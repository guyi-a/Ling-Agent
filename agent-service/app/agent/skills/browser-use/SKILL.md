---
name: browser-use
label: 浏览器操作
description: Use when the user wants a browser task completed directly in chat, such as opening a website, logging in, navigating pages, clicking controls, checking page content, or extracting information right now.
---

# Browser Automation with browser-use CLI

**🚨 CRITICAL: This CLI does NOT support `fill`, `type <selector>`, or `keys` commands. ONLY use `input <index> "text"` for text input and `click <index>` for submission. See "Supported Commands" below.**

## Command Restrictions (READ FIRST)

**❌ FORBIDDEN - These commands DO NOT EXIST in this CLI version:**
- `fill` → Use `input <index> "text"` instead
- `type <selector> <text>` → Use `input <index> "text"` instead
- `keys "Enter"` → Use `click <index>` on submit button instead
- CSS selectors (`#id`, `.class`) → Use numeric `[index]` from `state` instead

**✅ ONLY use these commands:**
- `open <url>` - Open page
- `state` - Get element indices
- `input <index> "text"` - Type into input field
- `click <index>` - Click element
- `scroll` - Scroll page
- `get text <index>` - Get text
- `eval <js>` - Run JavaScript
- `close` - Close browser

**Always run `state` first to get element indices, then use `input`/`click` with those indices.**

## When To Use

Use this skill when the user wants a browser task completed **now in chat**.
Examples:
- open or navigate a website
- use the user's existing session/account
- click buttons, menus, tabs, or links
- inspect what is currently shown on a page
- look something up inside a website
- extract information from a live page

If the user wants reusable code, a standalone script, or long-cycle automation, suggest creating a Python script instead.

## Output Rules (CRITICAL)

**Keep all output minimal and focused:**

1. **One action = One line of status**
   - ✅ Good: "✅ 已打开百度首页"
   - ❌ Bad: "现在我将打开百度首页。首先，我会执行 open 命令...【详细解释】"

2. **No redundant explanations**
   - Don't explain what you're about to do before doing it
   - Don't list multiple approaches or alternatives
   - Don't repeat the command syntax or examples

3. **Direct execution**
   - Call the tool immediately
   - Report only the essential result
   - Move to the next step

4. **Status format:**
   ```
   ✅ Opened page
   🔍 Located element [105]
   ✅ Input completed
   ✅ Search submitted
   ```

5. **Error handling:**
   - If something fails, report the error in one line
   - Adjust and retry immediately
   - No lengthy debugging explanations

**Example - Good:**
```
✅ 已打开百度
🔍 搜索框 [105]
✅ 已输入"杨洋"
✅ 搜索完成
```

**Example - Bad:**
```
现在为您启动 Chromium 浏览器，并在首页搜索框中输入"杨洋"并执行搜索：
【大段解释】
接下来，我将：
1. 定位搜索框
2. 输入关键词
3. 点击按钮
【继续解释】
```

## Available Tools

This skill uses two tools:

1. **`install_browser_use(step, index_url=None)`**
   - Install browser-use CLI step by step
   - Steps: `check` (start here), `install` (install CLI), `chromium` (install browser)
   - Optional `index_url` for PyPI mirror (e.g., `https://pypi.tuna.tsinghua.edu.cn/simple`)

2. **`browser_use(command)`**
   - Execute browser-use CLI commands
   - Examples: `open https://example.com`, `state`, `click 5`, `get text 10`, `close`

## Startup Rules

Required order:
1. **Confirm browser-use is available** before any browser command
   - Call `install_browser_use(step='check')` first
   - If needed, follow the returned `next_step` to complete installation
2. **Run `browser_use('profile list')`** to list available browser profiles
3. **Open the site** with global flags **before** the action
   - Example: `browser_use('--headed --profile <profile_name> open https://example.com')`

Defaults:
- Prefer the user's existing browser profile to preserve login state
- Browser window is always visible (`--headed` is default)
- After the task is complete, close the browser session unless the user wants it left open

Command-shape rule:
- Global flags such as `--headed` and `--profile` must come **before** the action verb
- ✅ Correct: `--headed --profile <profile_name> open https://example.com`
- ❌ Wrong: `open https://example.com --headed --profile <profile_name>`
- ❌ Wrong: `open https://example.com --headed`

## Supported Commands (CRITICAL - READ THIS FIRST)

**This CLI version ONLY supports these commands:**

1. `open <url>` - Open a page
2. `state` - List all interactive elements with [index]
3. `click <index>` - Click element by index number
4. `input <index> "text"` - Type text into input field by index number
5. `scroll` / `scroll up` - Scroll the page
6. `get text <index>` - Get text from element by index number
7. `eval <javascript>` - Execute JavaScript code
8. `close` - Close browser

**FORBIDDEN commands that will fail immediately:**
- ❌ `fill` - DOES NOT EXIST, always use `input <index>` instead
- ❌ `type <selector> <text>` - DOES NOT EXIST, always use `input <index>` instead  
- ❌ `keys "Enter"` - DOES NOT EXIST, always use `click <index>` on submit button
- ❌ CSS selectors (`#id`, `.class`) - DOES NOT WORK, must use numeric `[index]` from `state`

**CRITICAL RULES:**
1. **NEVER try commands not in the supported list above**
2. **ALWAYS use `state` first to get element index numbers**
3. **ALWAYS use numeric index, NEVER use CSS selectors**
4. **For text input: ONLY use `input <index> "text"`, nothing else**
5. **For submitting forms: ONLY use `click <index>` on button, NEVER use `keys`**

## Core Workflow

1. **Open or navigate** to the target page
2. **Use `state`** to locate interactive elements
   - Returns a tree of elements with `[index]` for interaction
   - Only elements with `[index]` are interactive
   - `*[index]` means new elements appeared since last step
3. **Interact** with elements by index:
   - `click <index>` - Click an element
   - `input <index> "text"` - Type into an input field (use this for all text input)
   - `scroll` / `scroll up` - Scroll the page
4. **Read data**:
   - `get text <index>` - Get exact text from one element
   - `eval <javascript>` - Extract data using JavaScript (for repeated/list data)
5. **Verify** the resulting page state before continuing

Rules:
- **Keep output minimal** - Follow the Output Rules above, one line per action
- **Never try unsupported commands** - Check the Supported Commands list above
- Use `state` to locate and verify, not as final quoted data
- Use `eval` for extraction when it is the simplest reliable choice
- Do **not** use `eval` to force business-state changes or bypass validation
- Do not claim success unless the page state confirms it

## Download Handling

When downloading files from a webpage:

**Do NOT assume** clicking a download button will save the file to workspace automatically.

Required workflow:
1. **Before triggering download**, inject JavaScript hooks with `eval` to record network activity
2. **Trigger** the page's download flow
3. **Read back** the recorded logs from the page with `eval`
4. **Identify** the real download source from logs
5. **Reproduce** the request with `fetch` in page context
6. **Convert** response to base64 in JavaScript
7. **Write** the decoded data to a file using `write_file` tool

Example:
```javascript
eval "window._downloads = []; XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {apply(target, thisArg, args) { window._downloads.push({url: args[1]}); return Reflect.apply(target, thisArg, args); }});"
```

## Login And Verification Handling

During interactive tasks, explicitly handle login and verification:

- If the site is not logged in, **tell the user to sign in**
- Use repeated `state` checks or `browser_use('wait selector <selector>')` to detect when ready
- If 2FA/CAPTCHA appears, **tell the user to complete it**
- Do not use unsupported commands like `wait 3` (not a valid browser-use command)
- After login completes, **resume from the blocked step**
- If the user lacks permissions, **say so clearly**

Supported wait commands:
- `browser_use('wait selector <css_selector>')` - Wait for element to appear
- `browser_use('wait text <text>')` - Wait for text to appear

## Three Failure Rules

> **Rule 1 — Action success is not task success**: `clicked`, `input`, or `eval` only mean the tool command ran. They do **not** prove the site completed the intended action.

> **Rule 2 — Unchanged URL + unchanged page means check other contexts**: If both the URL and visible page remain unchanged after an action, inspect other tabs/popups before retrying.

> **Rule 3 — Invalid form state means fix the form**: If the page shows missing values or `invalid` fields, fix the actual form state instead of guessing a results URL.

## Navigation / Context SOP

If you perform an action and the page does not meaningfully change, treat it as a possible alternate-context case.

Mandatory execution order:
1. **Verify current page** with `state` and `eval window.location.href`
2. If unchanged, **start alternate-context inspection immediately**
3. **Next action must be `switch <index>`** (not another diagnostic step)
4. **Continue switching** through every plausible tab index
5. After each switch, **verify** with `state` and `eval window.location.href`
6. **Only after exhausting tabs** may you attempt same-page recovery

Audit rules:
- Checking only one tab is **not enough** — continue traversing remaining tabs
- A blank/unrelated tab does **not** end inspection — switch to next tab
- Current-page `state` or `eval` do **not** count as alternate-context inspection

Hard bans:
- Do **not** repeat same-page actions before alternate-context inspection
- Do **not** use `wait`, `eval`, or `state` as substitutes for tab inspection
- Do **not** stop after rejecting one tab — continue to remaining tabs

## Wrong Page / Wrong Recovery

Treat as failure unless explicitly requested:
- Generic site-wide search page
- Empty-keyword results page
- Unrelated listing page
- Broad homepage for the same domain

Recovery order:
1. Verify accepted field values match intended inputs
2. Verify alternate tab/popup/route context
3. Verify blockers (validation, consent, login, anti-bot)
4. Retry only from validated state
5. Report failure clearly instead of improvising with guessed URLs

## Reading Data

- Use `get text <index>` when you need one exact value
- Use `eval` when you need repeated/list extraction
- Prefer narrow extraction over `document.body.innerText`

## State Reminders

`state` returns interactive elements in tree format:

```text
[index]<tagname attribute=value />
    Text content (may be truncated)
    [child_index]<child_element />
```

Key points:
- Only elements with `[index]` are interactive
- `*[index]` means new elements appeared
- Pure text without `[]` is not interactive
- State text may be truncated

## Troubleshooting

- If blocked by popup/modal/cookie, handle that flow first
- If page changed unexpectedly, inspect before retrying
- If current page is invalid, fix actual state instead of guessing destination
- Keep workflow practical and finish the user's immediate task

## Example Workflows

### Simple Navigation
```python
# 1. Check installation
browser_use('profile list')

# 2. Open website
browser_use('--headed --profile Default open https://example.com')

# 3. Check page state
browser_use('state')

# 4. Click element
browser_use('click 5')

# 5. Close browser
browser_use('close')
```

### Extract Data
```python
# 1. Navigate to page
browser_use('--headed open https://news.example.com')

# 2. Wait for content
browser_use('wait selector .article-title')

# 3. Get specific text
browser_use('get text 10')

# 4. Extract list data
browser_use('eval Array.from(document.querySelectorAll(".article-title")).map(el => el.textContent)')
```

### Handle Login
```python
# 1. Open login page
browser_use('--headed --profile Default open https://app.example.com')

# 2. Check if login needed
browser_use('state')

# 3. If login form appears, tell user
# "Please sign in to continue. Let me know when ready."

# 4. Wait for user to complete login
browser_use('wait selector .dashboard')

# 5. Continue with task
browser_use('state')
```
