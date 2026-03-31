// 配置项
const API_BASE = ''; 
let currentToken = localStorage.getItem('access_token');
let currentUsername = localStorage.getItem('username') || 'demouser';
let currentSessionId = null;

// DOM 元素
const historyList = document.getElementById('history-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const chatTitle = document.getElementById('chat-title');
const usernameEl = document.getElementById('current-username');

// 流式状态
let isStreaming = false;
let streamAbortController = null;

function setStreamingState(streaming) {
    isStreaming = streaming;
    const stopBtn = document.getElementById('stop-btn');
    sendBtn.style.display = streaming ? 'none' : '';
    if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
    chatInput.disabled = streaming;
    if (!streaming) chatInput.focus();
}

// ==================== 工作区 Sidebar ====================

function getFileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = { pdf: '📄', csv: '📊', xlsx: '📊', xls: '📊', txt: '📝', md: '📝',
                  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', zip: '🗜️', json: '📋',
                  py: '🐍', js: '📜', ts: '📜', doc: '📝', docx: '📝', pptx: '📊' };
    return map[ext] || '📎';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function refreshWorkspacePanel() {
    const body = document.getElementById('ws-body');
    if (!body) return;
    if (!currentSessionId) {
        body.innerHTML = '<div class="ws-empty">选择会话后查看文件</div>';
        return;
    }
    try {
        const res = await request(`/api/workspace/${currentSessionId}/files`);
        if (!res.ok) return;
        const data = await res.json();
        renderWsSidebar(data.files || []);
    } catch (e) {
        console.error('获取工作区文件失败', e);
    }
}

function renderWsSidebar(files) {
    const body = document.getElementById('ws-body');
    if (!body) return;

    // 按文件夹分组
    const folders = { uploads: [], outputs: [] };
    files.forEach(f => {
        if (folders[f.folder]) folders[f.folder].push(f);
    });

    // 记住当前展开状态
    const openFolders = {};
    body.querySelectorAll('.ws-folder').forEach(el => {
        openFolders[el.dataset.folder] = el.classList.contains('open');
    });

    body.innerHTML = '';

    ['uploads', 'outputs'].forEach(folderName => {
        const items = folders[folderName];
        const label = folderName === 'uploads' ? '📂 上传文件' : '📁 导出文件';
        const isOpen = openFolders[folderName] !== false;

        const folderEl = document.createElement('div');
        folderEl.className = `ws-folder${isOpen ? ' open' : ''}`;
        folderEl.dataset.folder = folderName;

        folderEl.innerHTML = `
            <div class="ws-folder-header">
                <i class="fa-solid fa-chevron-right ws-folder-toggle"></i>
                <span class="ws-folder-name">${label}</span>
                <span class="ws-folder-count">${items.length}</span>
            </div>
            <div class="ws-file-list">
                ${items.length === 0
                    ? '<div class="ws-file-row" style="color:var(--text-secondary);font-style:italic">（空）</div>'
                    : items.map(f => {
                        const canPreview = isPreviewable(f.name);
                        return `
                        <div class="ws-file-row">
                            <span class="ws-file-icon">${getFileIcon(f.name)}</span>
                            <span class="ws-file-name-text ${canPreview ? 'ws-previewable' : ''}"
                                title="${canPreview ? '点击预览' : escapeHTML(f.name)}"
                                data-folder="${escapeHTML(f.folder)}"
                                data-name="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
                            <span class="ws-file-size-text">${formatSize(f.size)}</span>
                            <button class="ws-file-dl-btn" title="下载"
                                data-folder="${escapeHTML(f.folder)}"
                                data-name="${escapeHTML(f.name)}">
                                <i class="fa-solid fa-download"></i>
                            </button>
                        </div>`;
                      }).join('')
                }
            </div>
        `;

        folderEl.querySelector('.ws-folder-header').addEventListener('click', () => {
            folderEl.classList.toggle('open');
        });

        folderEl.querySelectorAll('.ws-file-dl-btn').forEach(btn => {
            btn.addEventListener('click', () => downloadWsFile(btn.dataset.folder, btn.dataset.name));
        });

        folderEl.querySelectorAll('.ws-previewable').forEach(span => {
            span.addEventListener('click', () => previewWsFile(span.dataset.folder, span.dataset.name));
        });

        body.appendChild(folderEl);
    });
}

async function downloadWsFile(folder, filename) {    const url = `/api/workspace/${currentSessionId}/files/${folder}/${encodeURIComponent(filename)}`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) { console.error('下载失败', res.status); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) {
        console.error('下载出错', e);
    }
}

const PREVIEW_EXTS = new Set(['pdf','png','jpg','jpeg','gif','webp','bmp','svg',
                               'txt','md','csv','json','py','js','ts','html','css','xml','yaml','yml','log']);
const TEXT_PREVIEW_EXTS = new Set(['txt','md','csv','json','py','js','ts','html','css','xml','yaml','yml','log']);

function isPreviewable(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return PREVIEW_EXTS.has(ext);
}

async function previewWsFile(folder, filename) {
    const url = `/api/workspace/${currentSessionId}/files/${folder}/${encodeURIComponent(filename)}`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) { console.error('预览失败', res.status); return; }

        const ext = (filename.split('.').pop() || '').toLowerCase();
        if (TEXT_PREVIEW_EXTS.has(ext)) {
            const buffer = await res.arrayBuffer();
            const text = new TextDecoder('utf-8').decode(buffer);
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            window.open(URL.createObjectURL(blob), '_blank');
            return;
        }

        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) {
        console.error('预览出错', e);
    }
}

async function uploadFiles(files) {
    if (!files || files.length === 0) return;

    // 若没有当前会话，自动创建一个
    if (!currentSessionId) {
        try {
            const res = await request('/api/sessions/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: `Chat at ${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}).slice(0,16)}` })
            });
            if (!res.ok) { alert('创建会话失败，请刷新后重试。'); return; }
            const session = await res.json();
            currentSessionId = session.session_id;
            chatTitle.textContent = session.title;
            loadSessions();
        } catch (e) {
            alert('创建会话失败：' + e.message);
            return;
        }
    }
    const results = [];
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`/api/workspace/${currentSessionId}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}` },
                body: formData,
            });
            if (res.ok) {
                const data = await res.json();
                results.push(`✅ ${data.filename} (${formatSize(data.size)})`);
            } else {
                results.push(`❌ ${file.name} 上传失败`);
            }
        } catch (e) {
            results.push(`❌ ${file.name} 上传出错`);
        }
    }
    await refreshWorkspacePanel();
    appendMessage('assistant', `已上传到工作区：\n${results.join('\n')}`, true);
}

// --- 自动认证模块 ---
async function initAuth() {
    if (!currentToken) {
        // 未登录则重定向到登录页
        window.location.replace('login.html');
        return;
    }
    
    usernameEl.textContent = currentUsername;
    
    // 认证完成后加载会话
    await loadSessions();
}

// 绑定退出事件
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('username');
        window.location.replace('login.html');
    });
}

// 封装带认证的请求
async function request(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (currentToken) {
        options.headers['Authorization'] = `Bearer ${currentToken}`;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (res.status === 401) {
        localStorage.removeItem('access_token');
        currentToken = null;
        console.warn('Token expired. Please reload the page.');
    }
    return res;
}

// --- 数据加载与渲染模块 ---

// 加载会话列表
async function loadSessions() {
    try {
        const res = await request('/api/sessions/');
        if (res.ok) {
            const sessions = await res.json();
            renderSessions(sessions);
        }
    } catch (e) {
        console.error('Failed to load sessions', e);
    }
}

// 渲染左侧会话列表
function renderSessions(sessions) {
    historyList.innerHTML = '';
    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = `history-item ${session.session_id === currentSessionId ? 'active' : ''}`;
        item.dataset.sessionId = session.session_id;
        item.innerHTML = `
            <i class="fa-regular fa-message" style="flex-shrink:0"></i>
            <span class="text-truncate" style="flex:1;min-width:0">${escapeHTML(session.title || '新对话')}</span>
            <div class="history-item-actions">
                <button class="action-icon-btn rename-btn" title="重命名"><i class="fa-solid fa-pencil"></i></button>
                <button class="action-icon-btn delete-btn" title="删除"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        item.querySelector('.rename-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            startRename(item, session.session_id, session.title || '新对话');
        });
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete(session.session_id, item);
        });
        item.addEventListener('click', () => loadChatHistory(session.session_id, session.title));
        historyList.appendChild(item);
    });
}

// 重命名会话（内联编辑）
function startRename(item, sessionId, currentTitle) {
    const titleSpan = item.querySelector('span.text-truncate');
    const actionsDiv = item.querySelector('.history-item-actions');
    const input = document.createElement('input');
    input.className = 'history-item-rename-input text-truncate';
    input.value = currentTitle;
    titleSpan.replaceWith(input);
    actionsDiv.style.display = 'none';
    input.focus();
    input.select();

    async function commitRename() {
        const newTitle = input.value.trim() || currentTitle;
        // 恢复 span
        const span = document.createElement('span');
        span.className = 'text-truncate';
        span.style.cssText = 'flex:1;min-width:0';
        span.textContent = newTitle;
        input.replaceWith(span);
        actionsDiv.style.display = '';

        if (newTitle === currentTitle) return;
        try {
            const res = await request(`/api/sessions/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (res.ok) {
                // 更新顶部标题
                if (sessionId === currentSessionId) {
                    chatTitle.textContent = newTitle;
                }
            } else {
                span.textContent = currentTitle; // 回滚
            }
        } catch (e) {
            span.textContent = currentTitle;
        }
    }

    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentTitle; input.blur(); }
    });
}

// 内联确认删除
function confirmDelete(sessionId, item) {
    const actionsDiv = item.querySelector('.history-item-actions');
    actionsDiv.innerHTML = `
        <span style="font-size:12px;color:var(--text-secondary);margin-right:4px;">删除?</span>
        <button class="action-icon-btn confirm-yes" title="确认删除" style="color:#ff5f56">✓</button>
        <button class="action-icon-btn confirm-no" title="取消">✕</button>
    `;
    actionsDiv.style.display = 'flex';

    actionsDiv.querySelector('.confirm-yes').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(sessionId, item);
    });
    actionsDiv.querySelector('.confirm-no').addEventListener('click', (e) => {
        e.stopPropagation();
        // 恢复原来的操作按钮
        actionsDiv.innerHTML = `
            <button class="action-icon-btn rename-btn" title="重命名"><i class="fa-solid fa-pencil"></i></button>
            <button class="action-icon-btn delete-btn" title="删除"><i class="fa-solid fa-trash"></i></button>
        `;
        actionsDiv.querySelector('.rename-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            startRename(item, sessionId, item.querySelector('span.text-truncate')?.textContent || '新对话');
        });
        actionsDiv.querySelector('.delete-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            confirmDelete(sessionId, item);
        });
    });
}

// 删除会话
async function deleteSession(sessionId, item) {
    try {
        const res = await request(`/api/sessions/${sessionId}?hard_delete=true`, { method: 'DELETE' });
        if (res.ok) {
            item.remove();
            if (sessionId === currentSessionId) {
                currentSessionId = null;
                chatTitle.textContent = '新对话';
                chatMessages.innerHTML = '';
                const wsBody = document.getElementById('ws-body');
                if (wsBody) wsBody.innerHTML = '<div class="ws-empty">选择会话后查看文件</div>';
            }
        } else {
            console.error('删除失败:', res.status);
        }
    } catch (e) {
        console.error('删除会话失败', e);
    }
}

// 加载特定会话的消息历史
async function loadChatHistory(sessionId, title) {
    currentSessionId = sessionId;
    chatTitle.textContent = title || '历史对话';
    
    // 更新侧边栏 active 状态
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
    event?.currentTarget?.classList.add('active');

    try {
        const res = await request(`/api/messages/session/${sessionId}/history`);
        if (res.ok) {
            const data = await res.json();
            renderMessages(data.messages);
        }
    } catch (e) {
        console.error('Failed to load history', e);
    }

    // 刷新工作区文件面板
    await refreshWorkspacePanel();
}

// 渲染消息列表（只渲染 user/assistant 且有内容的消息）
function renderMessages(messages) {
    chatMessages.innerHTML = '';
    const visible = messages.filter(m =>
        (m.role === 'user' || m.role === 'assistant') && (m.content || '').trim()
    );
    if (visible.length === 0) {
        chatMessages.innerHTML = `<div class="message agent"><div class="message-content"><p>空会话</p></div></div>`;
        return;
    }
    visible.forEach(msg => appendMessage(msg.role, msg.content));
    scrollToBottom();
}

// 向容器追加单条消息，支持打字机效果
function appendMessage(role, content, animate = false) {
    const isUser = role === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'agent'}`;

    const avatar = isUser ?
        `<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}" alt="User">` :
        `<img src="https://api.dicebear.com/7.x/bottts/svg?seed=Ling-Agent" alt="AI">`;

    msgDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="markdown-content"></div>
        </div>
    `;
    chatMessages.appendChild(msgDiv);
    scrollToBottom();

    const contentEl = msgDiv.querySelector('.markdown-content');

    if (!animate || isUser) {
        contentEl.innerHTML = isUser ? `<p>${escapeHTML(content)}</p>` : marked.parse(content);
        scrollToBottom();
        return msgDiv;
    }

    // 打字机效果：逐字符追加，完成后统一 Markdown 渲染
    let i = 0;
    const speed = 8; // ms per char
    function type() {
        if (i < content.length) {
            // 每次追加一批字符（加速渲染长文本）
            const batch = Math.min(3, content.length - i);
            i += batch;
            // 实时渲染局部 markdown（简单用 innerText 显示中间态，最后一次渲染完整 md）
            contentEl.innerHTML = marked.parse(content.slice(0, i));
            scrollToBottom();
            setTimeout(type, speed);
        }
    }
    type();
    return msgDiv;
}

// --- 交互与发送逻辑 ---

// 发送消息（SSE 真流式）
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isStreaming) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';

    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) welcomeMsg.style.display = 'none';

    appendMessage('user', text);

    // 创建 AI 消息气泡（空的，用于流式填充）
    const aiDiv = document.createElement('div');
    aiDiv.className = 'message agent';
    aiDiv.innerHTML = `
        <div class="message-avatar"><img src="https://api.dicebear.com/7.x/bottts/svg?seed=Ling-Agent" alt="AI"></div>
        <div class="message-content"><div class="markdown-content streaming-cursor"></div></div>
    `;
    chatMessages.appendChild(aiDiv);
    scrollToBottom();
    const contentEl = aiDiv.querySelector('.markdown-content');

    const payload = { message: text };
    if (currentSessionId) payload.session_id = currentSessionId;

    let accumulated = '';
    let toolIndicator = null;

    streamAbortController = new AbortController();
    setStreamingState(true);

    try {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(payload),
            signal: streamAbortController.signal
        });

        if (!res.ok) {
            contentEl.classList.remove('streaming-cursor');
            contentEl.innerHTML = '<p>请求失败，请检查网络或后端日志。</p>';
            setStreamingState(false);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // 解析 SSE 事件（每个事件以 \n\n 分隔）
            const parts = buffer.split('\n\n');
            buffer = parts.pop(); // 最后一段可能不完整

            for (const part of parts) {
                const lines = part.split('\n');
                let event = 'message', data = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) event = line.slice(7).trim();
                    if (line.startsWith('data: ')) data = line.slice(6).trim();
                }
                if (!data) continue;

                let parsed;
                try { parsed = JSON.parse(data); } catch { continue; }

                if (event === 'session') {
                    if (parsed.is_new_session || !currentSessionId) {
                        currentSessionId = parsed.session_id;
                        loadSessions();
                        refreshWorkspacePanel();
                    }
                } else if (event === 'model_start') {
                    // 新一轮模型推理开始：保留已有内容，继续累积
                    scrollToBottom();
                } else if (event === 'token') {
                    // token 到来时把工具卡片标记为完成，不移除（保留在气泡里）
                    if (toolIndicator) {
                        toolIndicator.classList.add('done');
                        toolIndicator.querySelector('.tool-status').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
                        toolIndicator = null;
                    }
                    accumulated += parsed.text;
                    contentEl.innerHTML = marked.parse(accumulated);
                    scrollToBottom();
                } else if (event === 'tool_start') {
                    // 新工具卡片插入到气泡底部
                    const card = document.createElement('div');
                    card.className = 'tool-indicator';
                    const toolLabel = getToolLabel(parsed.tool_name);
                    card.innerHTML = `
                        <i class="fa-solid ${toolLabel.icon} tool-icon"></i>
                        <span>${toolLabel.text}</span>
                        <i class="fa-solid fa-circle-notch fa-spin tool-status"></i>
                    `;
                    contentEl.appendChild(card);
                    toolIndicator = card;
                    scrollToBottom();
                } else if (event === 'tool_end') {
                    // 标记完成 + 刷新工作区（agent 可能写了文件）
                    if (toolIndicator) {
                        toolIndicator.classList.add('done');
                        toolIndicator.querySelector('.tool-status').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
                        toolIndicator = null;
                    }
                    refreshWorkspacePanel();
                } else if (event === 'done') {
                    contentEl.classList.remove('streaming-cursor');
                    if (accumulated) contentEl.innerHTML = marked.parse(accumulated);
                    refreshWorkspacePanel();
                } else if (event === 'approval_required') {
                    // 暂停 stream，在气泡内嵌审批卡片
                    contentEl.classList.remove('streaming-cursor');
                    showApprovalCard(contentEl, parsed.request_id, parsed.tool_name, parsed.tool_input || {});
                } else if (event === 'approval_rejected') {
                    contentEl.classList.remove('streaming-cursor');
                    const note = document.createElement('div');
                    note.className = 'tool-indicator done';
                    note.style.color = '#ff5f56';
                    note.innerHTML = `<i class="fa-solid fa-ban tool-icon" style="color:#ff5f56"></i><span>已拒绝执行：${escapeHTML(parsed.tool_name)}</span>`;
                    contentEl.appendChild(note);
                    scrollToBottom();
                } else if (event === 'error') {
                    contentEl.classList.remove('streaming-cursor');
                    contentEl.innerHTML += `<p style="color:#ff5f56">[错误] ${escapeHTML(parsed.message || '')}</p>`;
                }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            contentEl.classList.remove('streaming-cursor');
            contentEl.innerHTML += '<p style="color:#aaa"><i class="fa-solid fa-stop"></i> 已停止生成</p>';
        } else {
            console.error('SSE error:', e);
            contentEl.classList.remove('streaming-cursor');
            contentEl.innerHTML = '<p>网络错误，请稍后重试。</p>';
        }
    } finally {
        setStreamingState(false);
    }
}

// 工具审批内嵌卡片（插入到当前 AI 气泡底部，不遮挡对话）
function showApprovalCard(contentEl, requestId, toolName, toolInput) {
    // 移除同一气泡里的旧卡片（防止重叠）
    contentEl.querySelector('.approval-card')?.remove();

    const toolLabel = getToolLabel(toolName);
    const inputPreview = Object.keys(toolInput).length > 0
        ? `<pre class="approval-args">${escapeHTML(JSON.stringify(toolInput, null, 2))}</pre>`
        : '';

    const card = document.createElement('div');
    card.className = 'approval-card';
    card.innerHTML = `
        <div class="approval-card-header">
            <i class="fa-solid fa-triangle-exclamation" style="color:#f5a623;font-size:12px"></i>
            <span>需要授权</span>
            <span class="approval-card-tool">
                <i class="fa-solid ${toolLabel.icon}"></i> ${escapeHTML(toolLabel.text)}
            </span>
            <span class="approval-card-timer" data-remaining="60">⏱ 60s</span>
        </div>
        ${inputPreview}
        <div class="approval-card-actions">
            <button class="approval-btn reject">拒绝</button>
            <button class="approval-btn approve">✅ 允许</button>
        </div>
    `;
    contentEl.appendChild(card);
    scrollToBottom();

    const timerEl = card.querySelector('.approval-card-timer');
    let remaining = 60;
    const interval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `⏱ ${remaining}s`;
        if (remaining <= 0) {
            clearInterval(interval);
            sendApproval(false);
        }
    }, 1000);

    function sendApproval(approved) {
        clearInterval(interval);
        // 替换卡片为结果提示
        card.innerHTML = approved
            ? `<div class="approval-card-result ok"><i class="fa-solid fa-circle-check"></i> 已允许</div>`
            : `<div class="approval-card-result no"><i class="fa-solid fa-ban"></i> 已拒绝</div>`;
        fetch('/api/chat/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ request_id: requestId, approved })
        }).catch(e => console.error('approve error', e));
    }

    card.querySelector('.approval-btn.approve').addEventListener('click', () => sendApproval(true));
    card.querySelector('.approval-btn.reject').addEventListener('click', () => sendApproval(false));
}

// 工具名映射为友好显示
function getToolLabel(toolName) {
    const map = {
        'list_dir':    { icon: 'fa-folder-open',  text: '查看工作区' },
        'read_file':   { icon: 'fa-file-lines',   text: '读取文件' },
        'write_file':  { icon: 'fa-pen-to-square', text: '写入文件' },
        'web_search':  { icon: 'fa-magnifying-glass', text: '网络搜索' },
        'search_web':  { icon: 'fa-magnifying-glass', text: '网络搜索' },
        'fetch_url':   { icon: 'fa-globe',         text: '访问网页' },
        'skill':       { icon: 'fa-puzzle-piece',  text: '加载技能' },
    };
    const entry = map[toolName];
    if (entry) return entry;
    // 未知工具：美化名称
    const text = toolName.replace(/_/g, ' ');
    return { icon: 'fa-wrench', text };
}

// 工具函数
function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 初始化应用
    initAuth();

    // 自动调整文本框高度
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 发送按钮点击
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // 回车键发送
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 上传按钮（左侧输入框 + 按钮）
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        if (fileInput.files.length > 0) {
            await uploadFiles(fileInput.files);
            fileInput.value = '';
        }
    });

    // 右侧工作区 sidebar：上传按钮
    const wsUploadBtn = document.getElementById('ws-upload-btn');
    if (wsUploadBtn) {
        wsUploadBtn.addEventListener('click', () => fileInput.click());
    }

    // 右侧工作区 sidebar：刷新按钮
    const wsRefreshBtn = document.getElementById('ws-refresh-btn');
    if (wsRefreshBtn) {
        wsRefreshBtn.addEventListener('click', () => refreshWorkspacePanel());
    }

    // 新建对话
    newChatBtn.addEventListener('click', () => {
        currentSessionId = null;
        chatTitle.textContent = '新对话';
        chatMessages.innerHTML = '';
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        const wsBody = document.getElementById('ws-body');
        if (wsBody) wsBody.innerHTML = '<div class="ws-empty">选择会话后查看文件</div>';
    });
});
