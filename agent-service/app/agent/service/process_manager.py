"""
进程管理 — 独立进程 + PID 文件管理

进程通过 subprocess.Popen 以独立 session 启动（start_new_session=True），
不随主服务重启而终止。状态持久化到文件系统：

    workspace/{session_id}/.proc/{name}/
      ├── pid          # PID
      ├── meta.json    # {command, workdir, port}
      └── output.log   # stdout+stderr

端口从全局池（9100-9199）分配，启动时从磁盘扫描恢复。
"""

import json
import logging
import os
import platform
import signal
import socket
import subprocess
import time
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── 端口管理 ───────────────────────────────────────────────

_allocated_ports: set[int] = set()
_ports_initialized = False


def _is_port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _init_ports() -> None:
    """启动时从磁盘扫描所有活跃进程的端口，恢复 _allocated_ports"""
    global _ports_initialized
    if _ports_initialized:
        return
    _ports_initialized = True

    workspace_root = Path(settings.WORKSPACE_ROOT)
    if not workspace_root.exists():
        return

    for session_dir in workspace_root.iterdir():
        if not session_dir.is_dir():
            continue
        proc_root = session_dir / ".proc"
        if not proc_root.exists():
            continue
        for name_dir in proc_root.iterdir():
            if not name_dir.is_dir():
                continue
            meta = _read_meta(name_dir)
            if meta and meta.get("port") and _is_process_alive(_read_pid(name_dir)):
                _allocated_ports.add(meta["port"])

    if _allocated_ports:
        logger.info(f"Recovered allocated ports: {_allocated_ports}")


def allocate_port(requested: Optional[int] = None) -> int:
    _init_ports()
    if requested is not None:
        if requested not in _allocated_ports and _is_port_free(requested):
            _allocated_ports.add(requested)
            return requested
        raise RuntimeError(f"Port {requested} is not available")

    start = getattr(settings, "DEV_PORT_RANGE_START", 9100)
    end = getattr(settings, "DEV_PORT_RANGE_END", 9199)
    for port in range(start, end + 1):
        if port not in _allocated_ports and _is_port_free(port):
            _allocated_ports.add(port)
            return port
    raise RuntimeError(f"No available ports in range {start}-{end}")


def release_port(port: Optional[int]) -> None:
    if port is not None:
        _allocated_ports.discard(port)


def detect_port(command: list[str]) -> Optional[int]:
    """从命令参数中检测端口号"""
    port_flags = {"--port", "-p", "-P", "--listen"}
    for i, arg in enumerate(command):
        for flag in port_flags:
            if arg.startswith(f"{flag}="):
                try:
                    return int(arg.split("=", 1)[1])
                except ValueError:
                    pass
        if arg in port_flags and i + 1 < len(command):
            try:
                return int(command[i + 1])
            except ValueError:
                pass
    for arg in reversed(command):
        if arg.isdigit():
            port = int(arg)
            if 1024 <= port <= 65535:
                return port
    return None


# ── 文件系统辅助 ──────────────────────────────────────────

def _proc_dir(session_id: str, name: str) -> Path:
    return Path(settings.WORKSPACE_ROOT) / session_id / ".proc" / name


def _read_pid(proc_dir: Path) -> Optional[int]:
    pid_file = proc_dir / "pid"
    if pid_file.exists():
        try:
            return int(pid_file.read_text().strip())
        except (ValueError, OSError):
            pass
    return None


def _read_meta(proc_dir: Path) -> Optional[dict]:
    meta_file = proc_dir / "meta.json"
    if meta_file.exists():
        try:
            return json.loads(meta_file.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _is_process_alive(pid: Optional[int]) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def _kill_tree(pid: int) -> None:
    """终止进程及其子进程"""
    if platform.system() == "Windows":
        try:
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(pid)],
                capture_output=True,
            )
        except OSError:
            pass
    else:
        try:
            pgid = os.getpgid(pid)
        except (ProcessLookupError, PermissionError):
            return
        try:
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        # 等待一小段时间让进程优雅退出
        for _ in range(10):
            if not _is_process_alive(pid):
                return
            time.sleep(0.2)
        try:
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


# ── 进程管理 ─────────────────────────────────────────────

def start_process(
    session_id: str,
    name: str,
    command: list[str],
    workdir: Path,
    port: Optional[int] = None,
) -> dict:
    """启动独立进程，返回 {name, pid, port, status, command, workdir}"""
    _init_ports()

    pdir = _proc_dir(session_id, name)

    # 如果同名进程存在且还在跑，先停掉
    old_pid = _read_pid(pdir)
    if _is_process_alive(old_pid):
        _kill_tree(old_pid)

    # 端口：显式指定时分配，否则从命令中检测并注册
    if port is not None:
        allocated_port = allocate_port(port)
    else:
        allocated_port = detect_port(command)
        if allocated_port is not None:
            _allocated_ports.add(allocated_port)

    # 准备目录和日志文件
    pdir.mkdir(parents=True, exist_ok=True)
    workdir.mkdir(parents=True, exist_ok=True)
    log_file = pdir / "output.log"

    try:
        with open(log_file, "w") as lf:
            proc = subprocess.Popen(
                command,
                cwd=str(workdir),
                stdout=lf,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
    except Exception as e:
        release_port(allocated_port)
        raise RuntimeError(f"Failed to start process: {e}") from e

    # 写 PID 和 meta
    (pdir / "pid").write_text(str(proc.pid))
    (pdir / "meta.json").write_text(json.dumps({
        "command": command,
        "workdir": str(workdir),
        "port": allocated_port,
    }))

    logger.info(
        f"▶ Process started: {name} (pid={proc.pid}, port={allocated_port}) in {workdir}"
    )

    return {
        "name": name,
        "command": command,
        "workdir": str(workdir),
        "port": allocated_port,
        "pid": proc.pid,
        "status": "running",
        "exit_code": None,
    }


def stop_process(session_id: str, name: str) -> None:
    """停止进程并清理 PID 文件"""
    pdir = _proc_dir(session_id, name)
    pid = _read_pid(pdir)
    meta = _read_meta(pdir)

    if pid and _is_process_alive(pid):
        _kill_tree(pid)

    # 释放端口
    if meta and meta.get("port"):
        release_port(meta["port"])

    # 清理 PID 文件（保留 meta 和日志供查看）
    pid_file = pdir / "pid"
    if pid_file.exists():
        pid_file.unlink()

    logger.info(f"■ Process stopped: {name} (session={session_id[:8]})")


def restart_process(session_id: str, name: str) -> dict:
    """重启进程：读 meta → 停 → 用同命令同端口启动"""
    pdir = _proc_dir(session_id, name)
    meta = _read_meta(pdir)
    if not meta:
        raise KeyError(f"Process '{name}' not found in session {session_id[:8]}")

    command = meta["command"]
    workdir = Path(meta["workdir"])
    port = meta.get("port")

    # 停掉旧进程（不释放端口，因为要复用）
    pid = _read_pid(pdir)
    if pid and _is_process_alive(pid):
        _kill_tree(pid)

    # 清空日志
    log_file = pdir / "output.log"

    try:
        with open(log_file, "w") as lf:
            proc = subprocess.Popen(
                command,
                cwd=str(workdir),
                stdout=lf,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
    except Exception as e:
        raise RuntimeError(f"Failed to restart process: {e}") from e

    # 更新 PID
    (pdir / "pid").write_text(str(proc.pid))

    logger.info(f"↻ Process restarted: {name} (pid={proc.pid}, port={port})")

    return {
        "name": name,
        "command": command,
        "workdir": str(workdir),
        "port": port,
        "pid": proc.pid,
        "status": "running",
        "exit_code": None,
    }


def get_process_status(session_id: str, name: str) -> dict:
    """获取进程状态"""
    pdir = _proc_dir(session_id, name)
    meta = _read_meta(pdir)
    if not meta:
        raise KeyError(f"Process '{name}' not found in session {session_id[:8]}")

    pid = _read_pid(pdir)
    alive = _is_process_alive(pid)

    return {
        "name": name,
        "command": meta["command"],
        "workdir": meta["workdir"],
        "port": meta.get("port"),
        "pid": pid,
        "status": "running" if alive else "exited",
        "exit_code": None,
    }


def list_processes(session_id: str) -> list[dict]:
    """列出 session 的所有进程"""
    _init_ports()
    proc_root = Path(settings.WORKSPACE_ROOT) / session_id / ".proc"
    if not proc_root.exists():
        return []

    results = []
    for name_dir in sorted(proc_root.iterdir()):
        if not name_dir.is_dir():
            continue
        meta = _read_meta(name_dir)
        if not meta:
            continue
        pid = _read_pid(name_dir)
        alive = _is_process_alive(pid)
        results.append({
            "name": name_dir.name,
            "command": meta["command"],
            "workdir": meta["workdir"],
            "port": meta.get("port"),
            "pid": pid,
            "status": "running" if alive else "exited",
            "exit_code": None,
        })
    return results


def get_logs(session_id: str, name: str, lines: int = 50) -> list[str]:
    """读取进程日志最后 N 行"""
    pdir = _proc_dir(session_id, name)
    if not pdir.exists():
        raise KeyError(f"Process '{name}' not found in session {session_id[:8]}")

    log_file = pdir / "output.log"
    if not log_file.exists():
        return []

    try:
        all_lines = log_file.read_text(errors="replace").splitlines()
        return all_lines[-lines:] if len(all_lines) > lines else all_lines
    except OSError:
        return []


def stop_all(session_id: str) -> None:
    """停止 session 的所有进程"""
    proc_root = Path(settings.WORKSPACE_ROOT) / session_id / ".proc"
    if not proc_root.exists():
        return

    for name_dir in proc_root.iterdir():
        if name_dir.is_dir():
            stop_process(session_id, name_dir.name)

    logger.info(f"■ All processes stopped for session {session_id[:8]}")


def list_all_processes() -> list[dict]:
    """列出所有 session 的所有进程（带 session_id）"""
    _init_ports()
    workspace_root = Path(settings.WORKSPACE_ROOT)
    if not workspace_root.exists():
        return []

    results = []
    for session_dir in sorted(workspace_root.iterdir()):
        if not session_dir.is_dir():
            continue
        proc_root = session_dir / ".proc"
        if not proc_root.exists():
            continue
        session_id = session_dir.name
        for name_dir in sorted(proc_root.iterdir()):
            if not name_dir.is_dir():
                continue
            meta = _read_meta(name_dir)
            if not meta:
                continue
            pid = _read_pid(name_dir)
            alive = _is_process_alive(pid)
            results.append({
                "session_id": session_id,
                "name": name_dir.name,
                "command": meta["command"],
                "workdir": meta["workdir"],
                "port": meta.get("port"),
                "pid": pid,
                "status": "running" if alive else "exited",
                "exit_code": None,
            })
    return results


def is_port_active(port: int) -> bool:
    """检查端口是否有正在运行的受管进程"""
    _init_ports()
    workspace_root = Path(settings.WORKSPACE_ROOT)
    if not workspace_root.exists():
        return False

    for session_dir in workspace_root.iterdir():
        if not session_dir.is_dir():
            continue
        proc_root = session_dir / ".proc"
        if not proc_root.exists():
            continue
        for name_dir in proc_root.iterdir():
            if not name_dir.is_dir():
                continue
            meta = _read_meta(name_dir)
            if meta and meta.get("port") == port:
                pid = _read_pid(name_dir)
                if _is_process_alive(pid):
                    return True
    return False
