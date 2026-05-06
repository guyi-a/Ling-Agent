"""
迁移脚本：为 sessions 表添加 project_id 列，并为现有 session 创建 adhoc project。
运行方式: cd agent-service && python migrate_projects.py
"""
import sqlite3
from datetime import datetime

DB_PATH = "./app.db"

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 检查 sessions 表是否已有 project_id 列
    cur.execute("PRAGMA table_info(sessions)")
    columns = [row[1] for row in cur.fetchall()]
    if "project_id" in columns:
        print("sessions.project_id 列已存在，跳过迁移")
        conn.close()
        return

    print("开始迁移...")

    # 1. 添加 project_id 列（nullable，之后填充）
    cur.execute("ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id)")
    print("已添加 sessions.project_id 列")

    # 2. 为每个现有 session 创建 adhoc project 并关联
    cur.execute("SELECT id, session_id, user_id, created_at FROM sessions")
    sessions = cur.fetchall()
    print(f"发现 {len(sessions)} 个现有会话，创建 adhoc project...")

    now = datetime.utcnow().isoformat()
    for sid, session_id, user_id, created_at in sessions:
        cur.execute(
            "INSERT INTO projects (slug, title, description, icon, user_id, created_at, updated_at) VALUES (NULL, NULL, NULL, NULL, ?, ?, ?)",
            (user_id, created_at or now, now),
        )
        project_id = cur.lastrowid
        cur.execute("UPDATE sessions SET project_id = ? WHERE id = ?", (project_id, sid))

    # 3. 创建索引
    try:
        cur.execute("CREATE INDEX ix_sessions_project_id ON sessions (project_id)")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    print(f"迁移完成：为 {len(sessions)} 个会话创建了对应的 adhoc project")

    # 验证
    cur.execute("SELECT COUNT(*) FROM sessions WHERE project_id IS NULL")
    null_count = cur.fetchone()[0]
    if null_count > 0:
        print(f"警告：仍有 {null_count} 个会话没有 project_id")
    else:
        print("所有会话都已关联到 project")

    conn.close()

if __name__ == "__main__":
    migrate()
