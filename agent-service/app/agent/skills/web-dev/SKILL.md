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
| Create new files | `write_file` | Path: `outputs/projects/{name}/filename` |
| Edit existing files | `edit_file` | **Prefer over write_file for small changes** — saves tokens |
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
   - API endpoints list (method, path, request/response format)
   - Frontend pages and components
   - Frontend-to-API mapping (which page calls which endpoint)
   This ensures frontend and backend paths stay in sync. **Do NOT write any code before PLAN.md is done.**
2. **Build backend** — write `main.py` + `routes.py` + `requirements.txt` → **MUST create venv and install deps BEFORE dev_run** (see "Virtual Environment" section below) → `dev_run` with `.venv\Scripts\python` (Windows) or `.venv/bin/python` (macOS/Linux), NEVER bare `python` → verify with `dev_logs`. **Do NOT write any frontend files before backend is created and working.**
3. **Curl-test ALL API endpoints** — this step is **MANDATORY**, do NOT skip it. After the server starts successfully, use `run_command` to curl every endpoint in PLAN.md. See the "API Self-Testing" section below for details.
4. **Build frontend** — write `index.html` (+ CSS/JS). Follow PLAN.md to ensure `fetch()` calls match API routes exactly.
5. **Start preview** — tell the user: "点击项目卡片上的预览按钮（眼睛图标）查看效果"
6. **Show the user** — pause and wait for feedback. Do not continue until the user responds.
7. **Iterate** — apply feedback → edit files → `dev_restart` → re-test affected endpoints with curl → tell user to refresh preview.

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

**Windows:**
```
run_command("cd outputs/projects/{app-name} && python -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt")
```

**macOS / Linux:**
```
run_command("cd outputs/projects/{app-name} && python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt")
```

Then start with venv Python:

**Windows:**
```
dev_run(name="{app-name}-server", command=".venv\\Scripts\\python -m uvicorn main:app --host 127.0.0.1", workdir="outputs/projects/{app-name}")
```

**macOS / Linux:**
```
dev_run(name="{app-name}-server", command=".venv/bin/python -m uvicorn main:app --host 127.0.0.1", workdir="outputs/projects/{app-name}")
```

## API Self-Testing (MANDATORY)

After `dev_run` + `dev_logs` confirms the server is running, you **MUST** curl-test every API endpoint before writing any frontend code. This catches 422 errors, wrong parameter formats, and routing issues early.

### How to test

Use `run_command` with curl. The server port is shown in `dev_logs` output (look for "Uvicorn running on http://127.0.0.1:{port}").

```bash
# GET — simple
curl -s http://127.0.0.1:{port}/api/health
curl -s http://127.0.0.1:{port}/api/todos

# POST with JSON body — MUST include Content-Type header
curl -s -X POST http://127.0.0.1:{port}/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "test item"}'

# PUT with JSON body
curl -s -X PUT http://127.0.0.1:{port}/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done": true}'

# DELETE
curl -s -X DELETE http://127.0.0.1:{port}/api/todos/1
```

### What to check

- **200/201** — endpoint works correctly
- **422 Unprocessable Entity** — the most common bug. Causes:
  - Missing `Content-Type: application/json` header → FastAPI can't parse the body
  - Route handler uses bare parameters `def create(title: str)` instead of Pydantic model `def create(body: TodoCreate)` → FastAPI treats them as query params, not JSON body
  - Request body field names don't match the Pydantic model (e.g., sending `name` but model expects `title`)
  - Wrong field type (e.g., sending `"123"` string but model expects `int`)
- **404** — route path mismatch, check router prefix vs URL
- **500** — server error, check `dev_logs` for traceback

### If a test fails

1. Read the error response body (`curl -s` shows it)
2. Fix the backend code with `edit_file` (prefer over `write_file` for small fixes)
3. `dev_restart` the server
4. Re-run the failing curl test
5. Do NOT proceed to frontend until ALL endpoints return expected results

## Frontend Guide

### Tech Stack

Frontend uses **Tailwind CSS + DaisyUI + Alpine.js** — all via CDN, no build step.

| Library | Role | CDN |
|---------|------|-----|
| **Tailwind CSS** | Utility-first CSS | `<script src="https://cdn.tailwindcss.com"></script>` |
| **DaisyUI** | Semantic component classes | `<link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">` |
| **Alpine.js** | Lightweight reactivity | `<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>` |

**CDN order matters:** DaisyUI CSS first → Tailwind JS → Alpine.js (with `defer`).

### DaisyUI Components

```html
<!-- Buttons -->
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-ghost">Ghost</button>
<button class="btn btn-outline btn-primary">Outline</button>
<button class="btn btn-sm">Small</button>
<button class="btn btn-primary" :disabled="saving">
    <span x-show="saving" class="loading loading-spinner loading-sm"></span>Save
</button>

<!-- Card -->
<div class="card bg-base-100 shadow-md">
    <div class="card-body">
        <h2 class="card-title">Title</h2>
        <p>Content</p>
        <div class="card-actions justify-end">
            <button class="btn btn-primary btn-sm">Action</button>
        </div>
    </div>
</div>

<!-- Form Controls -->
<input type="text" class="input input-bordered w-full" placeholder="Enter text...">
<select class="select select-bordered w-full">
    <option disabled selected>Pick one</option>
    <option>Option A</option>
</select>
<textarea class="textarea textarea-bordered w-full" rows="3"></textarea>
<label class="label cursor-pointer">
    <span class="label-text">Remember me</span>
    <input type="checkbox" class="checkbox checkbox-primary" x-model="remember">
</label>
<div class="join w-full">
    <input class="input input-bordered join-item flex-1" x-model="newItem">
    <button class="btn btn-primary join-item" @click="addItem()">Add</button>
</div>

<!-- Feedback -->
<span class="badge badge-primary">New</span>
<span class="badge badge-success">Done</span>
<span class="badge badge-warning">Pending</span>
<div class="alert alert-success"><span>Success message</span></div>
<div class="alert alert-error"><span>Error message</span></div>
<span class="loading loading-spinner loading-md"></span>

<!-- Navbar + Tabs -->
<div class="navbar bg-base-100 shadow-md">
    <div class="flex-1"><span class="text-xl font-bold px-4">App Name</span></div>
    <div class="flex-none gap-2">
        <button class="btn btn-ghost btn-sm" @click="tab = 'list'">List</button>
    </div>
</div>
<div class="tabs tabs-bordered">
    <a class="tab" :class="tab === 'all' && 'tab-active'" @click="tab = 'all'">All</a>
    <a class="tab" :class="tab === 'done' && 'tab-active'" @click="tab = 'done'">Done</a>
</div>

<!-- Modal -->
<button class="btn btn-primary" @click="showModal = true">Open</button>
<div class="modal" :class="showModal && 'modal-open'">
    <div class="modal-box">
        <h3 class="font-bold text-lg">Confirm</h3>
        <p class="py-4">Are you sure?</p>
        <div class="modal-action">
            <button class="btn btn-ghost" @click="showModal = false">Cancel</button>
            <button class="btn btn-primary" @click="confirm(); showModal = false">OK</button>
        </div>
    </div>
    <div class="modal-backdrop" @click="showModal = false"></div>
</div>

<!-- Table -->
<div class="overflow-x-auto">
    <table class="table">
        <thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
            <template x-for="item in items" :key="item.id">
                <tr class="hover">
                    <td x-text="item.name"></td>
                    <td><span class="badge badge-success" x-show="item.done">Done</span></td>
                    <td><button class="btn btn-ghost btn-xs text-error" @click="remove(item.id)">Delete</button></td>
                </tr>
            </template>
        </tbody>
    </table>
</div>

<!-- Stats -->
<div class="stats shadow">
    <div class="stat"><div class="stat-title">Total</div><div class="stat-value" x-text="items.length">0</div></div>
    <div class="stat"><div class="stat-title">Done</div><div class="stat-value text-success" x-text="items.filter(i=>i.done).length">0</div></div>
</div>
```

### Alpine.js Patterns

```html
<!-- Function-based state -->
<div x-data="app()" x-init="init()">...</div>
<script>
function app() {
    return {
        items: [], loading: true, filter: 'all',
        async init() { await this.loadItems(); },
        get filteredItems() {
            return this.filter === 'all' ? this.items : this.items.filter(i => i.status === this.filter);
        },
        async loadItems() {
            this.loading = true;
            const res = await fetch("api/items");
            this.items = await res.json();
            this.loading = false;
        },
    }
}
</script>

<!-- Conditional & list -->
<div x-show="isOpen" x-transition>...</div>
<template x-if="user"><span x-text="user.name"></span></template>
<template x-for="item in items" :key="item.id">
    <div class="card bg-base-100 shadow-sm mb-2">
        <div class="card-body p-4 flex-row items-center justify-between">
            <span x-text="item.name"></span>
            <button class="btn btn-ghost btn-xs text-error" @click="remove(item.id)">Delete</button>
        </div>
    </div>
</template>
<div x-show="items.length === 0 && !loading" class="text-center py-12 text-base-content/50">
    No items yet.
</div>
```

### Layout Patterns

```html
<!-- Standard (Navbar + Content) -->
<body class="min-h-screen bg-base-200">
    <div class="navbar bg-base-100 shadow-md">...</div>
    <div class="max-w-4xl mx-auto p-6"><!-- content --></div>
</body>

<!-- Card Grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">...</div>

<!-- Two-Column (List + Detail) -->
<div class="flex gap-6">
    <div class="w-1/3"><!-- list --></div>
    <div class="flex-1"><!-- detail --></div>
</div>

<!-- Responsive helpers -->
<div class="flex flex-col md:flex-row gap-4">...</div>
<div class="w-full max-w-4xl mx-auto px-4">...</div>
<div class="hidden md:block">Desktop only</div>
```

### DaisyUI Themes

```html
<html data-theme="light">   <!-- default -->
<html data-theme="dark">
<html data-theme="cupcake"> <!-- soft pastel -->
```

Semantic colors: `bg-base-100/200/300`, `text-base-content`, `text-primary/secondary/accent`, `text-success/warning/error`

### Frontend Pitfalls

| Pitfall | Fix |
|---------|-----|
| **fetch 路径加了前导 `/`** | 用 `fetch("api/...")` 不是 `fetch("/api/...")` |
| **Alpine.js 没加 `defer`** | `<script src="...alpinejs..." defer></script>` |
| **DaisyUI CSS 放在 Tailwind 后面** | DaisyUI CSS 必须在 Tailwind JS **之前** |
| **x-for 没有 key** | `<template x-for="item in items" :key="item.id">` |
| **x-data 里用箭头函数** | 用 `function app() { return {...} }` 不用箭头函数 |
| **忘记 x-init** | `<div x-data="app()" x-init="init()">` 两个都要写 |

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
- **CRITICAL**: `run_command` is for one-off commands (pip install, curl) ONLY. NEVER use `run_command` to start servers — it blocks and times out. ALWAYS use `dev_run` to start servers. Max 120s timeout.
- Always verify service startup with `dev_logs` before telling the user to preview

## Common Pitfalls

### 422 Unprocessable Entity (最常见的坑!)

| 错误写法 | 正确写法 | 原因 |
|----------|----------|------|
| `def create(title: str)` | `def create(body: TodoCreate)` | 裸参数被 FastAPI 当作 query param，不读 JSON body |
| `def create(data: dict)` | `def create(body: TodoCreate)` | `dict` 不是 Pydantic model，FastAPI 无法校验 |
| 前端 `fetch(url, {body: JSON.stringify(data)})` 不加 header | 加 `headers: {"Content-Type": "application/json"}` | 没有 Content-Type，FastAPI 不知道 body 是 JSON |
| 前端发 `{Name: "test"}` 但 model 定义 `name: str` | 字段名大小写必须完全匹配 | Pydantic 严格匹配字段名 |
| `Form(...)` 参数但前端发 JSON | 统一用 Pydantic model 接收 JSON body | Form 和 JSON 是不同的 Content-Type，别混用 |

### 其他常见问题

| Pitfall | Fix |
|---------|-----|
| **Static mount 在 API 前面** | 吞掉所有请求返回 HTML。**必须放最后**: `app.mount("/", ...)` 在 `include_router` 之后 |
| **SQLite 用相对路径** `"./data/app.db"` | uvicorn cwd 不确定。**用** `os.path.dirname(__file__)` 构建绝对路径 |
| **fetch 路径不匹配 router prefix** | router 用 `prefix="/api"` → 前端必须 `fetch("api/xxx")`（无前导 `/`），不是 `fetch("/api/xxx")`（会打到主站 404） |
| **建表不加 IF NOT EXISTS** | 服务重启报 table already exists。**始终用** `CREATE TABLE IF NOT EXISTS` |
| **忘记关 DB 连接** | 用 `with get_db() as conn` 自动 commit + close |
| **前端不检查 res.ok** | 后端返回 4xx/5xx 但前端当成功处理。**必须检查** `if (!res.ok)` 并读 `err.detail` |
| **修改代码后忘记重启** | `edit_file` 改代码后必须 `dev_restart`，否则旧代码还在跑 |
| **curl 测试不带 -s** | 不加 `-s` 会输出进度条干扰 JSON 解析，**始终用** `curl -s` |
| **curl URL 含中文/非 ASCII** | Windows curl 不自动编码 → "Invalid HTTP request"。**必须** URL-encode：`北京` → `%E5%8C%97%E4%BA%AC`。用 `python -c "from urllib.parse import quote; print(quote('北京'))"` 生成编码 |
