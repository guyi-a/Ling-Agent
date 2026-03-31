const API_BASE = ''; 
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-msg');

function showError(msg) {
    if(msg) {
        errorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
    } else {
        errorMsg.textContent = '';
    }
}

async function handleAuth(action) {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
        showError('请输入用户名和密码');
        return;
    }
    
    if (password.length < 6) {
        showError('密码至少需要 6 个字符');
        return;
    }

    const btn = action === 'login' ? loginBtn : registerBtn;
    const originalText = btn.textContent;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i> 处理中...';
    
    loginBtn.disabled = true;
    registerBtn.disabled = true;
    showError('');

    try {
        const endpoint = action === 'login' ? '/api/auth/login' : '/api/auth/register';
        const payload = { username, password };
        if (action === 'register') payload.device_id = 'web-browser';

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('username', data.username);
            // 登录成功，跳转到主页面
            window.location.replace('index.html');
        } else {
            showError(data.detail || '请求失败，请检查账号密码');
        }
    } catch (e) {
        showError('网络错误，请检查后端服务是否正常启动');
    } finally {
        btn.textContent = originalText;
        loginBtn.disabled = false;
        registerBtn.disabled = false;
    }
}

// 绑定事件
loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleAuth('login');
});

registerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleAuth('register');
});

// 处理回车键
loginForm.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleAuth('login');
    }
});

// 如果已经有Token，尝试直接跳转
if(localStorage.getItem('access_token')) {
    window.location.replace('index.html');
}