---
name: web-dev
label: Web 应用开发
description: Build web applications with HTML/CSS/JS frontend and optional FastAPI backend. Load this skill when the user wants to create a website, web app, or any project that needs a live preview in the browser.
---

## Components

**Service** — long-running backend process (API server, data pipeline).
Use when the app has backend logic, persistent state, or serves dynamic data to a Page.
Tech stack: FastAPI + uvicorn. For data persistence, use SQLite via Python's built-in `sqlite3` module — zero extra dependencies.

**Page** — browser-rendered web page (HTML + CSS + JS).
Use when the user needs to see or interact with something. Displayed in an iframe preview panel within the chat interface.
Pages talk to Services via `fetch()` on localhost.

**Common combinations:**
- **Page only** — simple static page (personal homepage, calculator, landing page). Still needs `main.py` to serve files.
- **Service + Page** — full-stack app (Todo list, data dashboard, CRUD app). Service handles API logic, Page is UI.
- **Service only** — headless automation (webhook receiver, data processor). No UI.

## Mental Model

A **Service** is a program running in the background — like a terminal executing your script. You can't see it, but it's alive and listening for requests. `dev_logs` shows its stdout/stderr — exactly what you'd see in that terminal.

A **Page** is a web page displayed in an iframe inside the chat window. The user clicks the preview button (eye icon) on the project card to see it. Think of it as a browser tab embedded in the chat.

**Connection:** A Page talks to a Service the same way any web page talks to a backend: `fetch("api/...")`. They are separate — connected by HTTP on localhost.

## Project Structure

All files go under `outputs/projects/{app-name}/`:

```
outputs/projects/{app-name}/
├── PLAN.md             # Project plan (REQUIRED — create FIRST)
├── main.py             # FastAPI entry: CORS, health, mount routes & static
├── routes.py           # API route handlers (all business logic here)
├── requirements.txt    # Python dependencies (if needed)
├── index.html          # Frontend entry (Tailwind + DaisyUI + Alpine.js via CDN)
├── *.html              # Additional pages if needed (admin.html, stats.html, etc.)
├── static/             # Shared CSS/JS/images (optional — only when multiple pages share code)
└── data/               # Runtime data (SQLite, etc.)
```

**File strategy:**
- **Simple apps** — single `index.html` with inline `<script>` and `<style>` is preferred
- **Multi-page apps** — multiple HTML files, each self-contained with CDN imports
- **Shared logic** — extract to `static/app.js` or `static/style.css` only when multiple pages need the same code

## Dev Tools

| Action | Tool | Notes |
|--------|------|-------|
| Create/edit files | `write_file` | Path: `outputs/projects/{name}/filename` |
| Read files | `read_file` | Check existing content before editing |
| List directory | `list_dir` | Verify project structure |
| Run shell commands | `run_command` | Create venv, install deps. Max 120s. |
| Start backend | `dev_run` | Start uvicorn/http.server as background process |
| Check logs | `dev_logs` | Verify startup, debug errors |
| Stop process | `dev_stop` | Stop a running service |
| Restart process | `dev_restart` | After code changes, restart to pick up |
| Run Python code | `python_repl` | DB initialization, data seeding, quick tests |

## Development Workflow

1. **Write PLAN.md FIRST** — create `outputs/projects/{app-name}/PLAN.md` containing:
   - Data model (tables, fields)
   - API endpoints list (method, path, request/response)
   - Frontend pages and components
   - Frontend-to-API mapping (which page calls which endpoint)
   This ensures frontend and backend paths stay in sync. **Do NOT write any code before PLAN.md is done.**
2. **Build backend** — write `main.py` + `routes.py` + `requirements.txt` → create venv if needed → install deps → `dev_run` → verify with `dev_logs`. **Do NOT write any frontend files before backend is created and working.**
3. **Build frontend** — write `index.html` (+ CSS/JS). Follow PLAN.md to ensure `fetch()` calls match API routes exactly.
4. **Start preview** — tell the user: "点击项目卡片上的预览按钮（眼睛图标）查看效果"
5. **Show the user** — pause and wait for feedback. Do not continue until the user responds.
6. **Iterate** — apply feedback → edit files → `dev_restart` → tell user to refresh preview.

## Backend Guide

**Every project MUST have `main.py` + `routes.py`.**

- `main.py` — app entry: CORS, health check, include routes, mount static files. **Keep it minimal.**
- `routes.py` — all API business logic goes here. Use `APIRouter` with prefix `/api`.

### main.py Template

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routes import router

app = FastAPI()

# CORS is REQUIRED — iframe preview is cross-origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check — REQUIRED
@app.get("/api/health")
async def health():
    return {"status": "ok"}

# Mount API routes
app.include_router(router)

# Static files MUST be mounted LAST (catch-all)
app.mount("/", StaticFiles(directory=".", html=True), name="static")
```

### routes.py Template (Complete CRUD Example)

Adapt this pattern to your app. **POST/PUT routes MUST use Pydantic models to receive JSON body.**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sqlite3, os

router = APIRouter(prefix="/api")

# ─── Database ───
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "app.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Init table (IF NOT EXISTS — safe on restart)
with get_db() as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

# ─── Pydantic models (REQUIRED for POST/PUT JSON body) ───
# Without these, FastAPI treats params as query strings → 422 error
class TodoCreate(BaseModel):
    title: str

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None

# ─── CRUD Routes ───
@router.get("/todos")
def list_todos():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM todos ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

@router.post("/todos")
def create_todo(body: TodoCreate):          # ← Pydantic model, NOT bare params
    with get_db() as conn:
        cur = conn.execute("INSERT INTO todos (title) VALUES (?)", (body.title,))
        return {"id": cur.lastrowid, "title": body.title, "done": False}

@router.put("/todos/{todo_id}")
def update_todo(todo_id: int, body: TodoUpdate):  # ← Pydantic model
    updates, params = [], []
    if body.title is not None:
        updates.append("title = ?"); params.append(body.title)
    if body.done is not None:
        updates.append("done = ?"); params.append(int(body.done))
    if not updates:
        raise HTTPException(400, "没有要更新的字段")
    params.append(todo_id)
    with get_db() as conn:
        conn.execute(f"UPDATE todos SET {', '.join(updates)} WHERE id = ?", params)
    return {"success": True}

@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: int):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "未找到")
    return {"success": True}
```

### Starting a Service

**Do NOT hardcode a port in the command.** Pass port via the `port` parameter — ProcessManager auto-allocates a free port from the configured range.

```
dev_run(name="{app-name}-server", command="python -m uvicorn main:app --host 127.0.0.1", workdir="outputs/projects/{app-name}")
```

Then immediately verify:
```
dev_logs(name="{app-name}-server")
```

If logs show errors, fix the code and `dev_restart`.

### Virtual Environment (when dependencies beyond stdlib are needed)

```
run_command("cd outputs/projects/{app-name} && python -m venv .venv && .venv/bin/pip install -r requirements.txt")
```

Then start with venv Python:
```
dev_run(name="{app-name}-server", command=".venv/bin/uvicorn main:app --host 127.0.0.1", workdir="outputs/projects/{app-name}")
```

## Frontend Guide

### Tech Stack

Frontend uses **Tailwind CSS + DaisyUI + Alpine.js** — all via CDN, no build step.

- **DaisyUI** — semantic component classes (`btn`, `card`, `navbar`, `modal`)
- **Tailwind CSS** — utility CSS for fine-grained control
- **Alpine.js** — lightweight reactivity via HTML attributes (`x-data`, `x-show`, `@click`, `x-for`)

For detailed component reference, layout patterns, and Alpine.js examples, load the `frontend-design` skill: `Skill(command="frontend-design")`.

### HTML Template

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{App Name}</title>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
</head>
<body class="min-h-screen bg-base-200">
    <div class="navbar bg-base-100 shadow-md">
        <span class="text-xl font-bold px-4">{App Name}</span>
    </div>
    <div x-data="app()" x-init="init()" class="max-w-4xl mx-auto p-6">
        <!-- content -->
    </div>
    <script>
    function app() {
        return {
            items: [],
            async init() {
                const res = await fetch("api/items");
                this.items = await res.json();
            },
        }
    }
    </script>
</body>
</html>
```

### Key Rules

- **CDN order**: DaisyUI CSS → Tailwind JS → Alpine.js (with `defer`)
- **API paths MUST NOT start with `/`**: use `fetch("api/items")` not `fetch("/api/items")`. The app runs inside a preview proxy iframe — a leading `/` sends requests to the wrong server and causes 404.
- Use DaisyUI components (`btn btn-primary`, `card`, `input input-bordered`) for consistent styling
- Use Alpine.js for state management and interactivity (`x-data`, `x-model`, `@click`, `x-for`)
- Make pages responsive — they display in an iframe of varying width
- Inline all CSS and JS in `index.html` — no separate static files needed

## Preview

- **You cannot open the preview programmatically.** The user must click the preview button (eye icon) on the project card in the workspace panel.
- After starting a service with `dev_run`, tell the user: "服务已启动，请点击右侧项目区 {app-name} 的预览按钮（👁）查看效果"

## Technical Constraints

- Bind servers to `127.0.0.1`, never `0.0.0.0`
- CORS must be enabled on all Services — iframe requests are cross-origin
- All files must be written under `outputs/projects/{app-name}/`
- Do not hardcode ports — let ProcessManager detect from command args
- Do not use `sleep` loops for periodic tasks
- `run_command` is for one-off commands (pip install, curl), NOT for running servers. Max 120s timeout.
- Always verify service startup with `dev_logs` before telling the user to preview

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| **POST/PUT 用裸参数** `def create(title: str)` | FastAPI 当作 query param → 422。**必须用 Pydantic model**: `def create(body: MyModel)` |
| **Static mount 在 API 前面** | 吞掉所有请求返回 HTML。**必须放最后**: `app.mount("/", ...)` 在 `include_router` 之后 |
| **SQLite 用相对路径** `"./data/app.db"` | uvicorn cwd 不确定。**用** `os.path.dirname(__file__)` 构建绝对路径 |
| **fetch 路径不匹配 router prefix** | router 用 `prefix="/api"` → 前端必须 `fetch("api/xxx")`（无前导 `/`），不是 `fetch("/api/xxx")`（会打到主站 404） |
| **建表不加 IF NOT EXISTS** | 服务重启报 table already exists。**始终用** `CREATE TABLE IF NOT EXISTS` |
| **忘记关 DB 连接** | 用 `with get_db() as conn` 自动 commit + close |
| **前端不检查 res.ok** | 后端返回 4xx/5xx 但前端当成功处理。**必须检查** `if (!res.ok)` 并读 `err.detail` |
