---
name: frontend-design
label: 前端 UI 设计
description: Frontend UI design guide using Tailwind CSS + DaisyUI + Alpine.js. Load this skill when building web app frontends that need polished, responsive UI.
---

## Tech Stack

| Library | Role | CDN |
|---------|------|-----|
| **Tailwind CSS** | Utility-first CSS framework | `<script src="https://cdn.tailwindcss.com"></script>` |
| **DaisyUI** | Semantic component classes on top of Tailwind | `<link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">` |
| **Alpine.js** | Lightweight reactivity via HTML attributes | `<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>` |

No build step. No npm. Just three CDN tags.

## HTML Template

Every frontend page starts from this skeleton. For simple apps, one `index.html` with inline script is enough. For multi-page apps, each HTML file includes its own CDN imports — shared logic can go in `static/app.js`.

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

    <!-- Navbar -->
    <div class="navbar bg-base-100 shadow-md">
        <div class="flex-1">
            <span class="text-xl font-bold px-4">{App Name}</span>
        </div>
        <div class="flex-none gap-2">
            <!-- nav actions here -->
        </div>
    </div>

    <!-- Main Content -->
    <div x-data="app()" x-init="init()" class="max-w-4xl mx-auto p-6">
        <!-- page content -->
    </div>

    <script>
    function app() {
        return {
            // state
            items: [],
            loading: true,

            // lifecycle
            async init() {
                const res = await fetch("api/items");
                this.items = await res.json();
                this.loading = false;
            },

            // methods
        }
    }
    </script>
</body>
</html>
```

**CDN order matters:** DaisyUI CSS first → Tailwind JS → Alpine.js (with `defer`).

## DaisyUI Components

### Buttons

```html
<button class="btn">Default</button>
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-accent">Accent</button>
<button class="btn btn-ghost">Ghost</button>
<button class="btn btn-outline btn-primary">Outline</button>
<button class="btn btn-sm">Small</button>
<button class="btn btn-lg">Large</button>
<button class="btn btn-circle">
    <svg>...</svg>
</button>

<!-- Loading state -->
<button class="btn btn-primary" :disabled="saving">
    <span x-show="saving" class="loading loading-spinner loading-sm"></span>
    Save
</button>
```

### Cards

```html
<div class="card bg-base-100 shadow-md">
    <div class="card-body">
        <h2 class="card-title">Card Title</h2>
        <p>Card content goes here.</p>
        <div class="card-actions justify-end">
            <button class="btn btn-primary btn-sm">Action</button>
        </div>
    </div>
</div>

<!-- Compact card -->
<div class="card bg-base-100 shadow-sm">
    <div class="card-body p-4">
        <span class="font-medium">Compact item</span>
    </div>
</div>
```

### Form Controls

```html
<!-- Text input -->
<input type="text" class="input input-bordered w-full" placeholder="Enter text...">

<!-- With label -->
<label class="label"><span class="label-text">Name</span></label>
<input type="text" class="input input-bordered w-full">

<!-- Select -->
<select class="select select-bordered w-full">
    <option disabled selected>Pick one</option>
    <option>Option A</option>
    <option>Option B</option>
</select>

<!-- Textarea -->
<textarea class="textarea textarea-bordered w-full" rows="3" placeholder="Description..."></textarea>

<!-- Checkbox -->
<label class="label cursor-pointer">
    <span class="label-text">Remember me</span>
    <input type="checkbox" class="checkbox checkbox-primary" x-model="remember">
</label>

<!-- Toggle -->
<input type="checkbox" class="toggle toggle-primary" x-model="enabled">

<!-- Input + Button group -->
<div class="join w-full">
    <input class="input input-bordered join-item flex-1" placeholder="Add item..." x-model="newItem">
    <button class="btn btn-primary join-item" @click="addItem()">Add</button>
</div>
```

### Feedback & Status

```html
<!-- Badge -->
<span class="badge badge-primary">New</span>
<span class="badge badge-success">Done</span>
<span class="badge badge-warning">Pending</span>
<span class="badge badge-error">Failed</span>
<span class="badge badge-ghost">Draft</span>

<!-- Alert -->
<div class="alert alert-info">
    <span>This is an info message.</span>
</div>
<div class="alert alert-success">
    <span>Operation succeeded!</span>
</div>
<div class="alert alert-warning">
    <span>Please check your input.</span>
</div>
<div class="alert alert-error">
    <span>Something went wrong.</span>
</div>

<!-- Loading spinner -->
<span class="loading loading-spinner loading-md"></span>

<!-- Loading skeleton (placeholder while data loads) -->
<div class="skeleton h-4 w-full"></div>
<div class="skeleton h-32 w-full"></div>
```

### Navigation

```html
<!-- Navbar with actions -->
<div class="navbar bg-base-100 shadow-md">
    <div class="flex-1">
        <span class="text-xl font-bold px-4">My App</span>
    </div>
    <div class="flex-none gap-2">
        <button class="btn btn-ghost btn-sm" @click="tab = 'list'">List</button>
        <button class="btn btn-ghost btn-sm" @click="tab = 'stats'">Stats</button>
    </div>
</div>

<!-- Tabs -->
<div class="tabs tabs-bordered">
    <a class="tab" :class="tab === 'all' && 'tab-active'" @click="tab = 'all'">All</a>
    <a class="tab" :class="tab === 'active' && 'tab-active'" @click="tab = 'active'">Active</a>
    <a class="tab" :class="tab === 'done' && 'tab-active'" @click="tab = 'done'">Done</a>
</div>
```

### Modal

```html
<!-- Trigger -->
<button class="btn btn-primary" @click="showModal = true">Open</button>

<!-- Modal -->
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
```

### Table

```html
<div class="overflow-x-auto">
    <table class="table">
        <thead>
            <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            <template x-for="item in items" :key="item.id">
                <tr class="hover">
                    <td x-text="item.name"></td>
                    <td>
                        <span class="badge badge-success" x-show="item.done">Done</span>
                        <span class="badge badge-ghost" x-show="!item.done">Pending</span>
                    </td>
                    <td>
                        <button class="btn btn-ghost btn-xs" @click="edit(item)">Edit</button>
                        <button class="btn btn-ghost btn-xs text-error" @click="remove(item.id)">Delete</button>
                    </td>
                </tr>
            </template>
        </tbody>
    </table>
</div>
```

### Stats

```html
<div class="stats shadow">
    <div class="stat">
        <div class="stat-title">Total</div>
        <div class="stat-value" x-text="items.length">0</div>
    </div>
    <div class="stat">
        <div class="stat-title">Completed</div>
        <div class="stat-value text-success" x-text="items.filter(i => i.done).length">0</div>
    </div>
    <div class="stat">
        <div class="stat-title">Pending</div>
        <div class="stat-value text-warning" x-text="items.filter(i => !i.done).length">0</div>
    </div>
</div>
```

## Alpine.js Patterns

### State Management

```html
<!-- Inline state for simple components -->
<div x-data="{ count: 0, name: '' }">
    <input x-model="name" class="input input-bordered">
    <button @click="count++" class="btn btn-primary" x-text="'Clicked ' + count + ' times'"></button>
</div>

<!-- Function-based state for complex pages -->
<div x-data="app()" x-init="init()">
    <!-- page content uses this.xxx -->
</div>

<script>
function app() {
    return {
        items: [],
        loading: true,
        filter: 'all',

        async init() {
            await this.loadItems();
        },

        get filteredItems() {
            if (this.filter === 'all') return this.items;
            return this.items.filter(i => i.status === this.filter);
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
```

### Conditional Display

```html
<!-- Show/hide with transition -->
<div x-show="isOpen" x-transition>
    Content that slides in/out
</div>

<!-- Conditional rendering (fully removes from DOM) -->
<template x-if="user">
    <span x-text="user.name"></span>
</template>

<!-- Toggle pattern -->
<button @click="showDetails = !showDetails" class="btn btn-sm btn-ghost">
    <span x-text="showDetails ? 'Hide' : 'Show'"></span> Details
</button>
<div x-show="showDetails" x-transition.duration.200ms>
    ...
</div>
```

### List Rendering

```html
<template x-for="item in items" :key="item.id">
    <div class="card bg-base-100 shadow-sm mb-2">
        <div class="card-body p-4 flex-row items-center justify-between">
            <span x-text="item.name"></span>
            <button class="btn btn-ghost btn-xs text-error" @click="deleteItem(item.id)">Delete</button>
        </div>
    </div>
</template>

<!-- Empty state -->
<div x-show="items.length === 0 && !loading" class="text-center py-12 text-base-content/50">
    No items yet. Add your first one!
</div>
```

### CRUD with Fetch

```html
<div x-data="app()" x-init="init()">

    <!-- Create -->
    <div class="join w-full mb-4">
        <input class="input input-bordered join-item flex-1"
               placeholder="New item..." x-model="newTitle"
               @keydown.enter="create()">
        <button class="btn btn-primary join-item" @click="create()">Add</button>
    </div>

    <!-- Loading -->
    <div x-show="loading" class="flex justify-center py-8">
        <span class="loading loading-spinner loading-lg"></span>
    </div>

    <!-- List -->
    <template x-for="item in items" :key="item.id">
        <div class="card bg-base-100 shadow-sm mb-2">
            <div class="card-body p-3 flex-row items-center gap-3">
                <input type="checkbox" class="checkbox checkbox-primary"
                       :checked="item.done"
                       @change="toggle(item)">
                <span class="flex-1" :class="item.done && 'line-through opacity-50'"
                      x-text="item.title"></span>
                <button class="btn btn-ghost btn-xs text-error"
                        @click="remove(item.id)">Delete</button>
            </div>
        </div>
    </template>
</div>

<script>
function app() {
    return {
        items: [],
        newTitle: '',
        loading: true,

        async init() {
            const res = await fetch("api/todos");
            this.items = await res.json();
            this.loading = false;
        },

        async create() {
            if (!this.newTitle.trim()) return;
            const res = await fetch("api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: this.newTitle })
            });
            if (res.ok) {
                this.items.unshift(await res.json());
                this.newTitle = '';
            }
        },

        async toggle(item) {
            await fetch(`api/todos/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ done: !item.done })
            });
            item.done = !item.done;
        },

        async remove(id) {
            await fetch(`api/todos/${id}`, { method: "DELETE" });
            this.items = this.items.filter(i => i.id !== id);
        }
    }
}
</script>
```

## Layout Patterns

### Standard Layout (Navbar + Content)

```html
<body class="min-h-screen bg-base-200">
    <div class="navbar bg-base-100 shadow-md">
        <div class="flex-1">
            <span class="text-xl font-bold px-4">App Name</span>
        </div>
    </div>
    <div class="max-w-4xl mx-auto p-6">
        <!-- content -->
    </div>
</body>
```

### Card Grid

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <template x-for="item in items" :key="item.id">
        <div class="card bg-base-100 shadow-md">
            <div class="card-body">
                <h3 class="card-title" x-text="item.name"></h3>
                <p x-text="item.description"></p>
                <div class="card-actions justify-end">
                    <span class="badge" x-text="item.category"></span>
                </div>
            </div>
        </div>
    </template>
</div>
```

### Sidebar Layout

```html
<div class="drawer lg:drawer-open">
    <input id="drawer" type="checkbox" class="drawer-toggle">
    <div class="drawer-content">
        <!-- Navbar (mobile toggle) -->
        <div class="navbar bg-base-100 lg:hidden">
            <label for="drawer" class="btn btn-ghost btn-square">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
            </label>
            <span class="text-lg font-bold">App Name</span>
        </div>
        <!-- Page content -->
        <div class="p-6">
            <!-- ... -->
        </div>
    </div>
    <div class="drawer-side">
        <label for="drawer" class="drawer-overlay"></label>
        <ul class="menu bg-base-100 w-64 min-h-full p-4">
            <li><a :class="page === 'home' && 'active'" @click="page = 'home'">Home</a></li>
            <li><a :class="page === 'settings' && 'active'" @click="page = 'settings'">Settings</a></li>
        </ul>
    </div>
</div>
```

### Two-Column (List + Detail)

```html
<div class="flex gap-6">
    <!-- Left: list -->
    <div class="w-1/3">
        <template x-for="item in items" :key="item.id">
            <div class="p-3 rounded-lg cursor-pointer hover:bg-base-300"
                 :class="selected?.id === item.id && 'bg-base-300'"
                 @click="selected = item">
                <span x-text="item.name"></span>
            </div>
        </template>
    </div>
    <!-- Right: detail -->
    <div class="flex-1">
        <template x-if="selected">
            <div class="card bg-base-100 shadow-md">
                <div class="card-body">
                    <h2 class="card-title" x-text="selected.name"></h2>
                    <p x-text="selected.description"></p>
                </div>
            </div>
        </template>
        <div x-show="!selected" class="text-center py-12 text-base-content/50">
            Select an item to view details
        </div>
    </div>
</div>
```

## Design Tips

### Themes

DaisyUI has 30+ built-in themes. Set on `<html>`:

```html
<html data-theme="light">   <!-- default light -->
<html data-theme="dark">     <!-- dark mode -->
<html data-theme="cupcake">  <!-- soft pastel -->
```

Toggle in Alpine:
```html
<input type="checkbox" class="toggle" @change="
    document.documentElement.setAttribute('data-theme', $el.checked ? 'dark' : 'light')
">
```

### Responsive Design

```html
<!-- Stack on mobile, side-by-side on desktop -->
<div class="flex flex-col md:flex-row gap-4">...</div>

<!-- Full width on mobile, constrained on desktop -->
<div class="w-full max-w-4xl mx-auto px-4">...</div>

<!-- Grid: 1 col mobile → 2 cols tablet → 3 cols desktop -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">...</div>

<!-- Hide on mobile -->
<div class="hidden md:block">Desktop only</div>
```

### Color Utilities

DaisyUI uses semantic colors that adapt to the theme:
- `bg-base-100` / `bg-base-200` / `bg-base-300` — background layers
- `text-base-content` — default text color
- `text-primary` / `text-secondary` / `text-accent` — theme colors
- `text-success` / `text-warning` / `text-error` / `text-info` — status colors
- `bg-primary text-primary-content` — filled primary with matching text

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| **fetch 路径加了前导 `/`** | 用 `fetch("api/...")` 不是 `fetch("/api/...")`。预览在 iframe 代理中，前导 `/` 会 404 |
| **Alpine.js 没加 `defer`** | `<script src="...alpinejs..." defer></script>` — 必须 defer，否则 DOM 未就绪 |
| **DaisyUI CSS 放在 Tailwind 后面** | DaisyUI CSS 必须在 Tailwind JS **之前**加载 |
| **x-for 没有 key** | `<template x-for="item in items" :key="item.id">` — 没有 key 会导致渲染异常 |
| **x-data 里用箭头函数** | `function app() { return { ... } }` — 不要用箭头函数，否则 `this` 指向错误 |
| **忘记 x-init 调用 init** | `<div x-data="app()" x-init="init()">` — 两个都要写 |
| **class 写错** | `btn-primary` 不是 `button-primary`；`input-bordered` 不是 `input-border` |
