import { Router } from 'itty-router';

// 创建路由器
const router = Router();

// --- 全局变量 ---
let apiKeys = []; // 缓存 API 密钥
let currentKeyIndex = 0;
let lastHealthCheck = 0;
let adminPasswordHash = null; // 缓存管理员密码哈希
let clientTokens = []; // 缓存客户端访问 token

// OpenRouter API 基础 URL
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const KV_KEYS = {
  API_KEYS: 'api_keys',
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  CLIENT_TOKENS: 'client_tokens',
};

// --- 辅助函数 ---

// 初始化：从 KV 加载 API 密钥、管理员密码哈希和客户端 token
async function initializeState(env) {
  try {
    const [keysData, passwordHashData, tokensData] = await Promise.all([
      env.ROUTER_KV.get(KV_KEYS.API_KEYS, { type: 'json' }),
      env.ROUTER_KV.get(KV_KEYS.ADMIN_PASSWORD_HASH, { type: 'text' }),
      env.ROUTER_KV.get(KV_KEYS.CLIENT_TOKENS, { type: 'json' }),
    ]);

    if (keysData && Array.isArray(keysData)) {
      apiKeys = keysData;
      console.log(`已加载 ${apiKeys.length} 个API密钥`);
    } else {
      apiKeys = [];
      console.log('未找到API密钥');
    }

    if (passwordHashData) {
      adminPasswordHash = passwordHashData;
      console.log('已加载管理员密码哈希');
    } else {
      adminPasswordHash = null;
      console.log('未设置管理员密码');
    }

    if (tokensData && Array.isArray(tokensData)) {
      clientTokens = tokensData;
      console.log(`已加载 ${clientTokens.length} 个客户端 token`);
    } else {
      clientTokens = [];
      console.log('未找到客户端 token');
    }
  } catch (error) {
    console.error('初始化状态失败:', error);
    apiKeys = [];
    adminPasswordHash = null;
    clientTokens = [];
  }
}

// 密码哈希函数 (SHA-256)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 验证密码
async function verifyPassword(providedPassword, storedHash) {
  if (!providedPassword || !storedHash) {
    return false;
  }
  const providedHash = await hashPassword(providedPassword);
  return providedHash === storedHash;
}

// 验证客户端 token
function verifyClientToken(token) {
  if (!token || clientTokens.length === 0) {
    return false;
  }
  return clientTokens.some(tokenObj => tokenObj.token === token && tokenObj.enabled);
}

// 生成随机 token
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk-';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 管理员认证中间件
async function requireAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供认证信息' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7); // 提取密码
  if (!adminPasswordHash) {
    return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const isValid = await verifyPassword(token, adminPasswordHash);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效的管理密码' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 认证成功，将密码（或标记）附加到请求对象，以便后续路由使用（如果需要）
  request.isAdmin = true;
  request.adminPassword = token; // 存储明文密码以备更改密码时使用
  
  // 认证成功，返回 undefined 让路由继续处理
  return undefined;
}

// 检查 API 密钥健康状态
async function checkKeyHealth(key) {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    return response.ok;
  } catch (error) {
    console.error('健康检查失败:', error);
    return false;
  }
}

// 获取下一个可用的 API 密钥
async function getNextApiKey() {
  if (apiKeys.length === 0) {
    throw new Error('没有可用的 API 密钥');
  }

  // 每5分钟检查一次健康状态
  const now = Date.now();
  if (now - lastHealthCheck > 5 * 60 * 1000) {
    console.log('执行 API 密钥健康检查...');
    for (let i = 0; i < apiKeys.length; i++) {
      apiKeys[i].isHealthy = await checkKeyHealth(apiKeys[i].value);
    }
    lastHealthCheck = now;
  }

  // 寻找健康的密钥
  const healthyKeys = apiKeys.filter(key => key.isHealthy !== false);
  if (healthyKeys.length === 0) {
    throw new Error('没有健康的 API 密钥可用');
  }

  // 轮询使用健康的密钥
  const keyToUse = healthyKeys[currentKeyIndex % healthyKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % healthyKeys.length;
  
  return keyToUse.value;
}

// 获取管理页面 HTML 内容
async function getAdminHtml(env) {
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudRouter 管理面板</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; background-color: #f4f4f4; }
        .container { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1, h2 { color: #333; }
        button { background-color: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background-color 0.3s; margin-right: 5px; }
        button:hover { background-color: #2980b9; }
        button.danger { background-color: #e74c3c; }
        button.danger:hover { background-color: #c0392b; }
        input[type="text"], input[type="password"] { width: calc(100% - 22px); padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f0f0f0; }
        .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
        .status.healthy { background-color: #2ecc71; }
        .status.unhealthy { background-color: #e74c3c; }
        .status.unknown { background-color: #95a5a6; }
        .hidden { display: none; }
        #loading { text-align: center; padding: 20px; font-style: italic; color: #666; }
        .error-message { color: red; margin-bottom: 10px; }
        .success-message { color: green; margin-bottom: 10px; }
    </style>
</head>
<body>
    <h1>CloudRouter 管理面板</h1>
    <div id="loading">正在加载...</div>
    <div id="authSection" class="container hidden">
        <div id="setupSection" class="hidden">
            <h2>设置管理员密码</h2>
            <p>首次使用，请设置管理员密码。</p>
            <div id="setupError" class="error-message hidden"></div>
            <form id="setupForm">
                <label for="setupPassword">新密码:</label>
                <input type="password" id="setupPassword" required>
                <label for="confirmPassword">确认密码:</label>
                <input type="password" id="confirmPassword" required>
                <button type="submit">设置密码</button>
            </form>
        </div>
        <div id="loginSection" class="hidden">
            <h2>管理员登录</h2>
            <div id="loginError" class="error-message hidden"></div>
            <form id="loginForm">
                <label for="loginPassword">密码:</label>
                <input type="password" id="loginPassword" required>
                <button type="submit">登录</button>
            </form>
        </div>
    </div>
    <div id="mainContent" class="container hidden">
        <div style="display: flex; justify-content: space-between; align-items: center;">
             <h2>管理</h2>
             <button id="logoutButton">退出登录</button>
        </div>
        <div class="container">
            <h3>API 密钥管理 (OpenRouter)</h3>
            <div id="apiKeyError" class="error-message hidden"></div>
            <div id="apiKeySuccess" class="success-message hidden"></div>
            <form id="addKeyForm" style="margin-bottom: 15px;">
                <label for="keyName">密钥名称:</label>
                <input type="text" id="keyName" placeholder="例如：My Key 1" required>
                <label for="keyValue">密钥值 (sk-...):</label>
                <input type="password" id="keyValue" required>
                <button type="submit">添加密钥</button>
            </form>
            <h4>现有密钥:</h4>
            <table id="keysTable">
                <thead>
                    <tr>
                        <th>状态</th>
                        <th>名称</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="keysList">
                    <tr><td colspan="3">正在加载...</td></tr>
                </tbody>
            </table>
             <button id="refreshKeysButton">刷新密钥状态</button>
        </div>
        <div class="container">
            <h3>客户端 Token 管理</h3>
            <div id="tokenError" class="error-message hidden"></div>
            <div id="tokenSuccess" class="success-message hidden"></div>
            <form id="addTokenForm" style="margin-bottom: 15px;">
                <label for="tokenName">Token 名称:</label>
                <input type="text" id="tokenName" placeholder="例如：NextChat Token" required>
                <label for="customToken">自定义 Token (可选):</label>
                <input type="text" id="customToken" placeholder="留空则自动生成，或输入自定义 token">
                <button type="submit">创建 Token</button>
            </form>
            <h4>现有 Token:</h4>
            <table id="tokensTable">
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>Token</th>
                        <th>状态</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="tokensList">
                    <tr><td colspan="5">正在加载...</td></tr>
                </tbody>
            </table>
             <button id="refreshTokensButton">刷新 Token 列表</button>
        </div>
        <div class="container">
            <h3>修改管理员密码</h3>
            <div id="changePasswordError" class="error-message hidden"></div>
            <div id="changePasswordSuccess" class="success-message hidden"></div>
            <form id="changePasswordForm">
                <label for="currentPassword">当前密码:</label>
                <input type="password" id="currentPassword" required>
                <label for="newPassword">新密码:</label>
                <input type="password" id="newPassword" required>
                <label for="confirmNewPassword">确认新密码:</label>
                <input type="password" id="confirmNewPassword" required>
                <button type="submit">修改密码</button>
            </form>
        </div>
        <div class="container">
             <h3>使用说明</h3>
             <p>将以下地址配置到你的 AI 客户端的 API Base URL:</p>
             <code id="apiUrl"></code>
             <p><strong>重要:</strong> 请使用上面生成的客户端 Token 作为 API Key。</p>
             <p><strong>Token 创建:</strong> 您可以自定义 Token 内容，或留空让系统自动生成。</p>
             <p><strong>安全提示:</strong> 每个 Token 都是唯一的，可以单独启用/禁用。建议为不同的应用创建不同的 Token。</p>
             <p><strong>注意:</strong> 管理员密码仅用于访问此管理面板，不用于 API 调用。</p>
        </div>
    </div>
    <script>
        const apiUrlBase = window.location.origin;
        const adminApiBase = apiUrlBase + '/api/admin';
        let adminPassword = null;
        
        const loadingDiv = document.getElementById('loading');
        const authSection = document.getElementById('authSection');
        const setupSection = document.getElementById('setupSection');
        const loginSection = document.getElementById('loginSection');
        const mainContent = document.getElementById('mainContent');
        const setupForm = document.getElementById('setupForm');
        const loginForm = document.getElementById('loginForm');
        const addKeyForm = document.getElementById('addKeyForm');
        const addTokenForm = document.getElementById('addTokenForm');
        const changePasswordForm = document.getElementById('changePasswordForm');
        const keysList = document.getElementById('keysList');
        const tokensList = document.getElementById('tokensList');
        const logoutButton = document.getElementById('logoutButton');
        const refreshKeysButton = document.getElementById('refreshKeysButton');
        const refreshTokensButton = document.getElementById('refreshTokensButton');
        const apiUrlCode = document.getElementById('apiUrl');
        
        function showMessage(elementId, message, isError = true) {
            const el = document.getElementById(elementId);
            el.textContent = message;
            el.className = isError ? 'error-message' : 'success-message';
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 5000);
        }
        const showSetupError = (msg) => showMessage('setupError', msg);
        const showLoginError = (msg) => showMessage('loginError', msg);
        const showApiKeyError = (msg) => showMessage('apiKeyError', msg);
        const showApiKeySuccess = (msg) => showMessage('apiKeySuccess', msg, false);
        const showTokenError = (msg) => showMessage('tokenError', msg);
        const showTokenSuccess = (msg) => showMessage('tokenSuccess', msg, false);
        const showChangePasswordError = (msg) => showMessage('changePasswordError', msg);
        const showChangePasswordSuccess = (msg) => showMessage('changePasswordSuccess', msg, false);
        
        async function apiCall(endpoint, method = 'GET', body = null, requiresAuth = true) {
            const headers = { 'Content-Type': 'application/json' };
            if (requiresAuth) {
                if (!adminPassword) {
                    console.error('Admin password not available for authenticated request');
                    showLogin();
                    return null;
                }
                headers['Authorization'] = 'Bearer ' + adminPassword;
            }
            
            const options = { method, headers };
            if (body) {
                options.body = JSON.stringify(body);
            }
            
            try {
                const response = await fetch(adminApiBase + endpoint, options);
                if (response.status === 401) {
                    adminPassword = null;
                    localStorage.removeItem('cloudrouter_admin_password');
                    showLogin();
                    showLoginError('认证失败或会话已过期，请重新登录。');
                    return null;
                }
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: '未知错误' }));
                    throw new Error(errorData.error || 'HTTP error! status: ' + response.status);
                }
                if (response.status === 204) {
                    return { success: true };
                }
                return await response.json();
            } catch (error) {
                console.error('API call failed for ' + method + ' ' + endpoint + ':', error);
                if (endpoint.startsWith('/keys')) showApiKeyError('操作失败: ' + error.message);
                else if (endpoint.startsWith('/tokens')) showTokenError('操作失败: ' + error.message);
                else if (endpoint.startsWith('/auth/change-password')) showChangePasswordError('操作失败: ' + error.message);
                else showLoginError('操作失败: ' + error.message);
                return null;
            }
        }
        
        async function checkAuthStatus() {
            console.log('checkAuthStatus: Starting...');
            loadingDiv.classList.remove('hidden');
            authSection.classList.add('hidden');
            mainContent.classList.add('hidden');
            
            try {
                const storedPassword = localStorage.getItem('cloudrouter_admin_password');
                let loggedIn = false;
                console.log('checkAuthStatus: Checking stored password...');
                
                if (storedPassword) {
                    console.log('checkAuthStatus: Found stored password. Verifying...');
                    adminPassword = storedPassword;
                    const loginResponse = await apiCall('/auth/login', 'POST', { password: adminPassword }, false);
                    if (loginResponse && loginResponse.success) {
                        console.log('checkAuthStatus: Stored password verified.');
                        loggedIn = true;
                    } else {
                        console.log('checkAuthStatus: Stored password invalid or verification failed.');
                        adminPassword = null;
                        localStorage.removeItem('cloudrouter_admin_password');
                    }
                } else {
                    console.log('checkAuthStatus: No stored password found.');
                }
                
                if (loggedIn) {
                    console.log('checkAuthStatus: Logged in. Showing main content...');
                    showMainContent();
                } else {
                    console.log('checkAuthStatus: Not logged in. Checking setup status...');
                    let statusData = null;
                    try {
                        const statusResponse = await fetch(adminApiBase + '/auth/status');
                        console.log('checkAuthStatus: Status API response status:', statusResponse.status);
                        if (!statusResponse.ok) {
                             throw new Error('Status check failed with status: ' + statusResponse.status);
                        }
                        statusData = await statusResponse.json();
                        console.log('checkAuthStatus: Status API response data:', statusData);
                    } catch (fetchError) {
                         console.error('checkAuthStatus: Failed to fetch or parse status API response:', fetchError);
                         showLogin();
                         showLoginError('无法检查服务器状态，请稍后重试。');
                         loadingDiv.classList.add('hidden');
                         return;
                    }
                    
                    if (statusData && statusData.isPasswordSet === false) {
                        console.log('checkAuthStatus: Password not set. Showing setup...');
                        showSetup();
                    } else {
                        console.log('checkAuthStatus: Password likely set or status unknown. Showing login...');
                        showLogin();
                    }
                }
            } catch (error) {
                console.error('checkAuthStatus: General error during auth check:', error);
                loadingDiv.textContent = '加载管理面板时出错，请刷新页面。';
                return;
            }
            
            console.log('checkAuthStatus: Hiding loading indicator.');
            loadingDiv.classList.add('hidden');
            console.log('checkAuthStatus: Finished.');
        }
        
        function showSetup() {
            authSection.classList.remove('hidden');
            setupSection.classList.remove('hidden');
            loginSection.classList.add('hidden');
            mainContent.classList.add('hidden');
        }
        
        function showLogin() {
            authSection.classList.remove('hidden');
            setupSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
            mainContent.classList.add('hidden');
        }
        
        function showMainContent() {
            authSection.classList.add('hidden');
            mainContent.classList.remove('hidden');
            apiUrlCode.textContent = apiUrlBase + '/v1';
            loadApiKeys();
            loadTokens();
        }
        
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('setupPassword').value;
            const confirm = document.getElementById('confirmPassword').value;
            
            if (password !== confirm) {
                showSetupError('两次输入的密码不匹配。');
                return;
            }
            if (password.length < 8) {
                 showSetupError('密码长度至少需要8位。');
                 return;
            }
            
            const result = await apiCall('/auth/setup', 'POST', { password }, false);
            if (result && result.success) {
                adminPassword = password;
                localStorage.setItem('cloudrouter_admin_password', password);
                showMainContent();
            } else {
                 showSetupError(result?.error || '设置密码失败。');
            }
        });
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('loginPassword').value;
            const result = await apiCall('/auth/login', 'POST', { password }, false);
             if (result && result.success) {
                adminPassword = password;
                localStorage.setItem('cloudrouter_admin_password', password);
                showMainContent();
            } else {
                showLoginError('登录失败：密码错误。');
            }
        });
        
        logoutButton.addEventListener('click', () => {
            adminPassword = null;
            localStorage.removeItem('cloudrouter_admin_password');
            showLogin();
        });
        
        async function loadApiKeys() {
            keysList.innerHTML = '<tr><td colspan="3">正在加载密钥...</td></tr>';
            const result = await apiCall('/keys');
            if (result && result.keys) {
                renderApiKeys(result.keys);
            } else if (result === null) {
                 keysList.innerHTML = '<tr><td colspan="3" style="color: red;">加载密钥失败，请检查登录状态。</td></tr>';
            } else {
                 keysList.innerHTML = '<tr><td colspan="3">没有找到 API 密钥。</td></tr>';
            }
        }
        
        function renderApiKeys(keys) {
            if (keys.length === 0) {
                keysList.innerHTML = '<tr><td colspan="3">没有找到 API 密钥。请添加。</td></tr>';
                return;
            }
            keysList.innerHTML = keys.map(key => {
                const statusClass = key.isHealthy === true ? 'healthy' : (key.isHealthy === false ? 'unhealthy' : 'unknown');
                const statusText = key.isHealthy === true ? '可用' : (key.isHealthy === false ? '不可用' : '未知');
                const escapedName = escapeHtml(key.name);
                return '<tr>' +
                    '<td><span class="status ' + statusClass + '"></span> ' + statusText + '</td>' +
                    '<td>' + escapedName + '</td>' +
                    '<td><button class="danger" onclick="deleteApiKey(\\'' + escapedName + '\\')">删除</button></td>' +
                    '</tr>';
            }).join('');
        }
        
        function escapeHtml(unsafe) {
            if (!unsafe) return '';
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        }
        
        addKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('keyName').value.trim();
            const value = document.getElementById('keyValue').value.trim();
            
            if (!name || !value) {
                showApiKeyError('密钥名称和值不能为空。');
                return;
            }
             if (!value.startsWith('sk-')) {
                 showApiKeyError('OpenRouter API 密钥通常以 "sk-" 开头。');
             }
            
            const result = await apiCall('/keys', 'POST', { name, value });
            if (result && result.success) {
                showApiKeySuccess('API 密钥添加成功！');
                addKeyForm.reset();
                loadApiKeys();
            }
        });
        
        async function deleteApiKey(name) {
            if (!confirm('确定要删除密钥 "' + name + '" 吗？')) return;
            
            const result = await apiCall('/keys/' + encodeURIComponent(name), 'DELETE');
            if (result && result.success) {
                showApiKeySuccess('API 密钥删除成功！');
                loadApiKeys();
            }
        }
        
        refreshKeysButton.addEventListener('click', loadApiKeys);

        // Token 管理函数
        async function loadTokens() {
            tokensList.innerHTML = '<tr><td colspan="5">正在加载 Token...</td></tr>';
            const result = await apiCall('/tokens');
            if (result && result.tokens) {
                renderTokens(result.tokens);
            } else if (result === null) {
                 tokensList.innerHTML = '<tr><td colspan="5" style="color: red;">加载 Token 失败，请检查登录状态。</td></tr>';
            } else {
                 tokensList.innerHTML = '<tr><td colspan="5">没有找到 Token。</td></tr>';
            }
        }

        function renderTokens(tokens) {
            if (tokens.length === 0) {
                tokensList.innerHTML = '<tr><td colspan="5">没有找到 Token。请创建。</td></tr>';
                return;
            }
            tokensList.innerHTML = tokens.map(token => {
                const statusText = token.enabled ? '启用' : '禁用';
                const statusClass = token.enabled ? 'success-message' : 'error-message';
                const escapedName = escapeHtml(token.name);
                const maskedToken = token.token.substring(0, 8) + '...' + token.token.substring(token.token.length - 8);
                const createdDate = new Date(token.createdAt).toLocaleDateString();
                const toggleText = token.enabled ? '禁用' : '启用';

                return '<tr>' +
                    '<td>' + escapedName + '</td>' +
                    '<td><code style="font-size: 12px;">' + maskedToken + '</code> <button onclick="copyToken(\\'' + token.token + '\\')">复制</button></td>' +
                    '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
                    '<td>' + createdDate + '</td>' +
                    '<td>' +
                        '<button onclick="toggleToken(\\'' + escapedName + '\\', ' + !token.enabled + ')">' + toggleText + '</button> ' +
                        '<button class="danger" onclick="deleteToken(\\'' + escapedName + '\\')">删除</button>' +
                    '</td>' +
                    '</tr>';
            }).join('');
        }

        async function copyToken(token) {
            try {
                await navigator.clipboard.writeText(token);
                showTokenSuccess('Token 已复制到剪贴板！');
            } catch (err) {
                showTokenError('复制失败，请手动复制');
            }
        }

        async function toggleToken(name, enabled) {
            const result = await apiCall('/tokens/' + encodeURIComponent(name), 'PATCH', { enabled });
            if (result && result.success) {
                showTokenSuccess('Token 状态更新成功！');
                loadTokens();
            }
        }

        async function deleteToken(name) {
            if (!confirm('确定要删除 Token "' + name + '" 吗？')) return;

            const result = await apiCall('/tokens/' + encodeURIComponent(name), 'DELETE');
            if (result && result.success) {
                showTokenSuccess('Token 删除成功！');
                loadTokens();
            }
        }

        addTokenForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('tokenName').value.trim();
            const customToken = document.getElementById('customToken').value.trim();

            if (!name) {
                showTokenError('Token 名称不能为空。');
                return;
            }

            const requestData = { name };
            if (customToken) {
                requestData.token = customToken;
            }

            const result = await apiCall('/tokens', 'POST', requestData);
            if (result && result.success) {
                if (customToken) {
                    showTokenSuccess('Token 创建成功！使用了您的自定义 token: ' + result.token.token);
                } else {
                    showTokenSuccess('Token 创建成功！自动生成的 token: ' + result.token.token);
                }
                addTokenForm.reset();
                loadTokens();
            }
        });

        refreshTokensButton.addEventListener('click', loadTokens);

        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;
            
            if (newPassword !== confirmNewPassword) {
                showChangePasswordError('新密码和确认密码不匹配。');
                return;
            }
             if (newPassword.length < 8) {
                 showChangePasswordError('新密码长度至少需要8位。');
                 return;
            }
            if (currentPassword !== adminPassword) {
                 showChangePasswordError('当前密码不正确。');
                 return;
            }
            
            const result = await apiCall('/auth/change-password', 'POST', { currentPassword, newPassword });
            if (result && result.success) {
                showChangePasswordSuccess('密码修改成功！请使用新密码重新登录。');
                adminPassword = newPassword;
                localStorage.setItem('cloudrouter_admin_password', newPassword);
                changePasswordForm.reset();
            }
        });
        
        document.addEventListener('DOMContentLoaded', checkAuthStatus);
    </script>
</body>
</html>`;
    return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// --- API 路由 ---

// --- 管理员认证 API ---
router.get('/api/admin/auth/status', async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ isPasswordSet: !!adminPasswordHash }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/api/admin/auth/setup', async (request, env) => {
  await initializeState(env);
  if (adminPasswordHash) {
    return new Response(JSON.stringify({ error: '密码已设置' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { password } = await request.json();
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: '密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const newHash = await hashPassword(password);
    await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
    adminPasswordHash = newHash;

    return new Response(JSON.stringify({ success: true, message: '管理员密码设置成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("密码设置失败:", error);
    return new Response(JSON.stringify({ error: '设置密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/api/admin/auth/login', async (request, env) => {
  await initializeState(env);
  if (!adminPasswordHash) {
    return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { password } = await request.json();
    const isValid = await verifyPassword(password, adminPasswordHash);

    if (isValid) {
      return new Response(JSON.stringify({ success: true, message: '登录成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
     console.error("登录失败:", error);
     return new Response(JSON.stringify({ error: '登录时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/api/admin/auth/change-password', requireAdminAuth, async (request, env) => {
  try {
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: '新密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const newHash = await hashPassword(newPassword);
    await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
    adminPasswordHash = newHash;

    return new Response(JSON.stringify({ success: true, message: '密码修改成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("密码修改失败:", error);
    return new Response(JSON.stringify({ error: '修改密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- API 密钥管理 ---
router.get('/api/admin/keys', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ success: true, keys: apiKeys }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/api/admin/keys', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name, value } = await request.json();
    if (!name || !value) {
      return new Response(JSON.stringify({ error: '密钥名称和值不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 检查是否已存在相同名称的密钥
    if (apiKeys.some(key => key.name === name)) {
      return new Response(JSON.stringify({ error: '密钥名称已存在' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 检查密钥健康状态
    const isHealthy = await checkKeyHealth(value);
    const newKey = { name, value, isHealthy };
    apiKeys.push(newKey);

    // 保存到 KV
    await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));

    return new Response(JSON.stringify({ success: true, message: 'API 密钥添加成功', key: { name, isHealthy } }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("添加 API 密钥失败:", error);
    return new Response(JSON.stringify({ error: '添加密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.delete('/api/admin/keys/:name', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name } = request.params;
    const keyIndex = apiKeys.findIndex(key => key.name === name);

    if (keyIndex === -1) {
      return new Response(JSON.stringify({ error: '密钥不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    apiKeys.splice(keyIndex, 1);
    await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));

    return new Response(JSON.stringify({ success: true, message: 'API 密钥删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("删除 API 密钥失败:", error);
    return new Response(JSON.stringify({ error: '删除密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- 客户端 Token 管理 ---
router.get('/api/admin/tokens', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ success: true, tokens: clientTokens }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/api/admin/tokens', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name, token } = await request.json();
    if (!name) {
      return new Response(JSON.stringify({ error: 'Token 名称不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 检查是否已存在相同名称的 token
    if (clientTokens.some(t => t.name === name)) {
      return new Response(JSON.stringify({ error: 'Token 名称已存在' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 处理 token 值
    let tokenValue;
    if (token && token.trim()) {
      // 使用用户提供的自定义 token
      tokenValue = token.trim();

      // 检查是否已存在相同的 token 值
      if (clientTokens.some(t => t.token === tokenValue)) {
        return new Response(JSON.stringify({ error: 'Token 值已存在，请使用不同的 token' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else {
      // 自动生成 token
      tokenValue = generateToken();
    }

    // 创建新的 token
    const newToken = {
      name,
      token: tokenValue,
      enabled: true,
      createdAt: new Date().toISOString()
    };
    clientTokens.push(newToken);

    // 保存到 KV
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({
      success: true,
      message: 'Token 创建成功',
      token: newToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("创建 Token 失败:", error);
    return new Response(JSON.stringify({ error: '创建 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.patch('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name } = request.params;
    const { enabled } = await request.json();

    const tokenIndex = clientTokens.findIndex(token => token.name === name);
    if (tokenIndex === -1) {
      return new Response(JSON.stringify({ error: 'Token 不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    clientTokens[tokenIndex].enabled = enabled;
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({ success: true, message: 'Token 状态更新成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("更新 Token 失败:", error);
    return new Response(JSON.stringify({ error: '更新 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.delete('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name } = request.params;
    const tokenIndex = clientTokens.findIndex(token => token.name === name);

    if (tokenIndex === -1) {
      return new Response(JSON.stringify({ error: 'Token 不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    clientTokens.splice(tokenIndex, 1);
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({ success: true, message: 'Token 删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("删除 Token 失败:", error);
    return new Response(JSON.stringify({ error: '删除 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- OpenAI 兼容 API ---
router.get('/v1/models', async (request, env) => {
  await initializeState(env);

  // 客户端 token 验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7);
  if (!verifyClientToken(token)) {
    return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const apiKey = await getNextApiKey();
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API 错误: ${response.status}`);
    }

    const data = await response.text();
    return new Response(data, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return new Response(JSON.stringify({ error: { message: '获取模型列表失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/v1/chat/completions', async (request, env) => {
  await initializeState(env);

  // 客户端 token 验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7);
  if (!verifyClientToken(token)) {
    return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const apiKey = await getNextApiKey();
    const requestBody = await request.text();

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    const responseData = await response.text();
    return new Response(responseData, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('聊天完成请求失败:', error);
    return new Response(JSON.stringify({ error: { message: '聊天完成请求失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- 主页路由 ---
router.get('/', async (request, env) => {
  return await getAdminHtml(env);
});

// 404 处理
router.all('*', () => new Response('Not Found', { status: 404 }));

// --- 导出 ---
export default {
  async fetch(request, env, ctx) {
    await initializeState(env);
    return router.handle(request, env, ctx);
  },
};
