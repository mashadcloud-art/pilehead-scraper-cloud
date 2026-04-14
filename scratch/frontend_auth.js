const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Inject global fetch interceptor & login logic
const loginLogic = `
<script>
// --- AUTHENTICATION INTERCEPTOR ---
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    config = config || {};
    config.headers = config.headers || {};
    const token = localStorage.getItem('jwt');
    if (token) config.headers['Authorization'] = \`Bearer \${token}\`;
    
    const res = await originalFetch(resource, config);
    if (res.status === 401 || res.status === 403) {
        document.getElementById('login-overlay').style.display = 'flex';
        localStorage.removeItem('jwt');
    }
    return res;
};

// Check if already logged in structurally
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('jwt')) {
        document.getElementById('login-overlay').style.display = 'none';
        initSocketRoom(); // Connect to personal room
    }
});

async function performLogin() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    const res = await window.fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.success) {
        localStorage.setItem('jwt', data.token);
        localStorage.setItem('username', data.username);
        document.getElementById('login-overlay').style.display = 'none';
        initSocketRoom();
        // Force refresh state
        window.location.reload();
    } else {
        alert('Login failed: ' + data.error);
    }
}

function initSocketRoom() {
    const uname = localStorage.getItem('username');
    if (uname && window.socket) {
        window.socket.emit('join-room', uname);
    }
}
</script>
`;

if (!html.includes('AUTHENTICATION INTERCEPTOR')) {
    html = html.replace('<script src="renderer.js"></script>', loginLogic + '\n<script src="renderer.js"></script>');
}

// 2. Inject login wall div
const loginDiv = `
<div id="login-overlay" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:var(--os-bg);z-index:99999;display:flex;align-items:center;justify-content:center;">
   <div style="background:var(--os-bg-2);padding:40px;border-radius:12px;box-shadow:var(--os-shadow);width:320px;text-align:center;">
       <h2 style="margin-top:0;">Secure Server Login</h2>
       <input type="text" id="login-user" placeholder="Username" style="width:calc(100% - 20px);padding:10px;margin-bottom:10px;background:var(--os-bg-3);color:#fff;border:1px solid var(--os-border);border-radius:6px;">
       <input type="password" id="login-pass" placeholder="Password" style="width:calc(100% - 20px);padding:10px;margin-bottom:20px;background:var(--os-bg-3);color:#fff;border:1px solid var(--os-border);border-radius:6px;">
       <button onclick="performLogin()" style="width:100%;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">Enter Admin Area</button>
   </div>
</div>
`;

if (!html.includes('id="login-overlay"')) {
    html = html.replace('<body>', '<body>\n' + loginDiv);
}

fs.writeFileSync('index.html', html);
console.log('Frontend patched.');
