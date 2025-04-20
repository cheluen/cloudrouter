import { Router } from 'itty-router';

// 创建路由器
const router = Router();

// 用于存储API密钥列表和当前使用的索引
let apiKeys = [];
let currentKeyIndex = 0;
let lastHealthCheck = 0;

// OpenRouter API基础URL
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// 初始化函数，从KV存储加载API密钥
async function initializeApiKeys(env) {
  try {
    const keys = await env.ROUTER_KV.get('api_keys', { type: 'json' });
    if (keys && Array.isArray(keys) && keys.length > 0) {
      apiKeys = keys;
      console.log(`已加载 ${apiKeys.length} 个API密钥`);
    } else {
      console.log('未找到API密钥，请先添加密钥');
      apiKeys = [];
    }
  } catch (error) {
    console.error('加载API密钥失败:', error);
    apiKeys = [];
  }
}

// 健康检查函数，验证API密钥是否有效
async function healthCheck() {
  const now = Date.now();
  // 每10分钟执行一次健康检查
  if (now - lastHealthCheck < 600000) return;
  
  lastHealthCheck = now;
  console.log('执行API密钥健康检查');
  
  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const isHealthy = await checkKeyHealth(key);
    apiKeys[i] = { ...key, isHealthy };
  }
}

// 检查单个密钥的健康状态
async function checkKeyHealth(key) {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${key.value}`,
        'HTTP-Referer': 'https://cloudrouter.project', 
        'X-Title': 'CloudRouter'
      }
    });
    return response.status === 200;
  } catch (error) {
    console.error(`密钥健康检查失败: ${key.name}`, error);
    return false;
  }
}

// 获取下一个可用的API密钥
function getNextKey() {
  if (apiKeys.length === 0) return null;
  
  let attempts = 0;
  while (attempts < apiKeys.length) {
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    const key = apiKeys[currentKeyIndex];
    if (key.isHealthy !== false) {
      return key;
    }
    attempts++;
  }
  
  // 如果所有密钥都不健康，返回第一个
  return apiKeys[0];
}

// 验证管理员身份
function isAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '');
  return token === env.AUTH_KEY;
}

// 验证API调用身份
function validateApiAccess(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '');
  // 如果使用的是管理员密钥，允许访问
  if (token === env.AUTH_KEY) return true;
  
  // 验证自定义API密钥
  // 这里可以实现更复杂的逻辑，例如从KV存储验证自定义密钥
  return token.startsWith('sk-');
}

// 管理页面HTML
let adminHtml = null;

// 获取管理页面HTML
async function getAdminHtml() {
  if (!adminHtml) {
    // 直接返回内联HTML，而不是从GitHub获取
    adminHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudRouter 管理面板</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .container {
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    .btn {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.3s;
    }
    .btn:hover {
      background-color: #2980b9;
    }
    .btn-danger {
      background-color: #e74c3c;
    }
    .btn-danger:hover {
      background-color: #c0392b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f5f5f5;
    }
    .key-status {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .key-status.healthy {
      background-color: #2ecc71;
    }
    .key-status.unhealthy {
      background-color: #e74c3c;
    }
    .modal {
      display: none;
      position: fixed;
      z-index: 1;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
    }
    .modal-content {
      background-color: #fff;
      margin: 15% auto;
      padding: 20px;
      border-radius: 8px;
      width: 50%;
      max-width: 500px;
    }
    .close {
      color: #aaa;
      float: right;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
    }
    .close:hover {
      color: #000;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 8px;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .code-block {
      background-color: #f7f7f7;
      padding: 15px;
      border-radius: 4px;
      font-family: monospace;
      overflow-x: auto;
    }
    .tab {
      overflow: hidden;
      border: 1px solid #ccc;
      background-color: #f1f1f1;
      border-radius: 4px 4px 0 0;
    }
    .tab button {
      background-color: inherit;
      float: left;
      border: none;
      outline: none;
      cursor: pointer;
      padding: 14px 16px;
      transition: 0.3s;
      font-size: 14px;
    }
    .tab button:hover {
      background-color: #ddd;
    }
    .tab button.active {
      background-color: #3498db;
      color: white;
    }
    .tabcontent {
      display: none;
      padding: 20px;
      border: 1px solid #ccc;
      border-top: none;
      border-radius: 0 0 4px 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CloudRouter 管理面板</h1>
    </div>
    
    <div class="tab">
      <button class="tablinks active" onclick="openTab(event, 'apiKeys')">API密钥管理</button>
      <button class="tablinks" onclick="openTab(event, 'deploy')">部署指南</button>
      <button class="tablinks" onclick="openTab(event, 'usage')">使用说明</button>
    </div>
    
    <div id="apiKeys" class="tabcontent" style="display: block;">
      <div class="header">
        <h2>API密钥管理</h2>
        <button class="btn" id="addKeyBtn">添加新密钥</button>
      </div>
      
      <div id="keysList">
        <p>正在加载API密钥...</p>
      </div>
    </div>
    
    <div id="deploy" class="tabcontent">
      <h2>部署指南</h2>
      
      <h3>从GitHub部署</h3>
      <p>您可以通过以下简单步骤将CloudRouter部署到Cloudflare Workers:</p>
      <ol>
        <li>Fork <a href="https://github.com/cheluen/cloudrouter" target="_blank">CloudRouter GitHub仓库</a></li>
        <li>在Cloudflare Dashboard中创建一个新的Workers服务</li>
        <li>在Workers服务设置中连接您的GitHub仓库</li>
        <li>创建一个KV命名空间，命名为"ROUTER_KV"</li>
        <li>在Workers环境变量中设置AUTH_KEY为您自定义的管理密钥</li>
        <li>部署Workers服务</li>
      </ol>
      
      <h3>本地开发</h3>
      <div class="code-block">
        <pre>
# 克隆仓库
git clone https://github.com/cheluen/cloudrouter.git
cd cloudrouter

# 安装依赖
npm install

# 本地开发
npm run dev

# 部署到Cloudflare Workers
npm run deploy
        </pre>
      </div>
    </div>
    
    <div id="usage" class="tabcontent">
      <h2>使用说明</h2>
      
      <h3>API端点</h3>
      <p>CloudRouter提供了与OpenAI API兼容的端点:</p>
      <ul>
        <li><code>/v1/chat/completions</code> - 用于发送聊天请求</li>
        <li><code>/v1/models</code> - 获取可用模型列表</li>
      </ul>
      
      <h3>在客户端使用</h3>
      <p>您可以在支持OpenAI API的客户端中使用CloudRouter，只需更改API基础URL:</p>
      <div class="code-block">
        <pre>
# API基础URL
https://your-worker-subdomain.workers.dev

# 身份验证
使用您设置的自定义API密钥进行身份验证，格式为"Bearer YOUR_API_KEY"
        </pre>
      </div>
      
      <h3>管理API密钥</h3>
      <p>使用管理面板添加和管理OpenRouter API密钥。系统会自动轮询使用这些密钥，如果某个密钥无响应，将自动切换到下一个可用密钥。</p>
    </div>
  </div>
  
  <!-- 添加密钥对话框 -->
  <div id="addKeyModal" class="modal">
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2>添加API密钥</h2>
      <form id="addKeyForm">
        <div class="form-group">
          <label for="keyName">密钥名称</label>
          <input type="text" id="keyName" required>
        </div>
        <div class="form-group">
          <label for="keyValue">密钥值</label>
          <input type="password" id="keyValue" required>
        </div>
        <button type="submit" class="btn">添加</button>
      </form>
    </div>
  </div>
  
  <!-- 身份验证对话框 -->
  <div id="authModal" class="modal">
    <div class="modal-content">
      <h2>请输入管理密钥</h2>
      <div class="form-group">
        <label for="authKey">管理密钥</label>
        <input type="password" id="authKey" required>
      </div>
      <button id="authSubmit" class="btn">登录</button>
    </div>
  </div>

  <script>
    let authToken = '';
    const apiBasePath = ''; // 如果部署在子路径，请在这里设置
    
    // 显示身份验证对话框
    function showAuthModal() {
      document.getElementById('authModal').style.display = 'block';
    }
    
    // 检查身份验证
    function checkAuth() {
      authToken = localStorage.getItem('cloudrouter_auth_token');
      if (!authToken) {
        showAuthModal();
        return false;
      }
      return true;
    }
    
    // 加载API密钥列表
    async function loadKeys() {
      if (!checkAuth()) return;
      
      try {
        const response = await fetch(\`\${apiBasePath}/admin/keys\`, {
          headers: {
            'Authorization': \`Bearer \${authToken}\`
          }
        });
        
        if (response.status === 401) {
          localStorage.removeItem('cloudrouter_auth_token');
          showAuthModal();
          return;
        }
        
        const keys = await response.json();
        const keysList = document.getElementById('keysList');
        
        if (keys.length === 0) {
          keysList.innerHTML = '<p>没有API密钥。请添加新密钥。</p>';
          return;
        }
        
        let html = \`
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>名称</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
        \`;
        
        keys.forEach(key => {
          const statusClass = key.isHealthy === false ? 'unhealthy' : 'healthy';
          const statusText = key.isHealthy === false ? '不可用' : '可用';
          
          html += \`
            <tr>
              <td><span class="key-status \${statusClass}"></span>\${statusText}</td>
              <td>\${key.name}</td>
              <td>
                <button class="btn btn-danger" onclick="deleteKey('\${key.name}')">删除</button>
              </td>
            </tr>
          \`;
        });
        
        html += \`
            </tbody>
          </table>
        \`;
        
        keysList.innerHTML = html;
      } catch (error) {
        console.error('加载API密钥失败', error);
        document.getElementById('keysList').innerHTML = '<p>加载API密钥失败。请刷新页面重试。</p>';
      }
    }
    
    // 删除API密钥
    async function deleteKey(name) {
      if (!confirm(\`确定要删除密钥 "\${name}" 吗？\`)) return;
      
      try {
        const response = await fetch(\`\${apiBasePath}/admin/keys/\${name}\`, {
          method: 'DELETE',
          headers: {
            'Authorization': \`Bearer \${authToken}\`
          }
        });
        
        if (response.status === 401) {
          localStorage.removeItem('cloudrouter_auth_token');
          showAuthModal();
          return;
        }
        
        const result = await response.json();
        if (result.success) {
          alert('密钥删除成功');
          loadKeys();
        } else {
          alert(\`删除失败: \${result.error}\`);
        }
      } catch (error) {
        console.error('删除API密钥失败', error);
        alert('删除API密钥失败。请刷新页面重试。');
      }
    }
    
    // 添加API密钥
    async function addKey(name, value) {
      try {
        const response = await fetch(\`\${apiBasePath}/admin/keys\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${authToken}\`
          },
          body: JSON.stringify({ name, value })
        });
        
        if (response.status === 401) {
          localStorage.removeItem('cloudrouter_auth_token');
          showAuthModal();
          return;
        }
        
        const result = await response.json();
        if (result.success) {
          alert('密钥添加成功');
          document.getElementById('addKeyModal').style.display = 'none';
          document.getElementById('addKeyForm').reset();
          loadKeys();
        } else {
          alert(\`添加失败: \${result.error}\`);
        }
      } catch (error) {
        console.error('添加API密钥失败', error);
        alert('添加API密钥失败。请刷新页面重试。');
      }
    }
    
    // 切换标签页
    function openTab(evt, tabName) {
      const tabcontent = document.getElementsByClassName('tabcontent');
      for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = 'none';
      }
      
      const tablinks = document.getElementsByClassName('tablinks');
      for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(' active', '');
      }
      
      document.getElementById(tabName).style.display = 'block';
      evt.currentTarget.className += ' active';
    }
    
    // 初始化
    document.addEventListener('DOMContentLoaded', function() {
      // 检查身份验证
      checkAuth();
      
      // 身份验证表单提交
      document.getElementById('authSubmit').addEventListener('click', function() {
        const authKey = document.getElementById('authKey').value;
        if (!authKey) return;
        
        localStorage.setItem('cloudrouter_auth_token', authKey);
        authToken = authKey;
        document.getElementById('authModal').style.display = 'none';
        loadKeys();
      });
      
      // 添加密钥对话框
      const addKeyModal = document.getElementById('addKeyModal');
      document.getElementById('addKeyBtn').addEventListener('click', function() {
        addKeyModal.style.display = 'block';
      });
      
      document.getElementsByClassName('close')[0].addEventListener('click', function() {
        addKeyModal.style.display = 'none';
      });
      
      // 添加密钥表单提交
      document.getElementById('addKeyForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const name = document.getElementById('keyName').value;
        const value = document.getElementById('keyValue').value;
        if (!name || !value) return;
        
        addKey(name, value);
      });
      
      // 点击其他区域关闭对话框
      window.addEventListener('click', function(event) {
        if (event.target === addKeyModal) {
          addKeyModal.style.display = 'none';
        }
      });
      
      // 加载API密钥
      loadKeys();
    });
  </script>
</body>
</html>`;
  }
  return adminHtml;
}

// 管理页面路由
router.get('/admin', async (request, env) => {
  return new Response(await getAdminHtml(), {
    headers: { 'Content-Type': 'text/html' }
  });
});

// 管理API路由
router.get('/admin/keys', async (request, env) => {
  if (!isAdmin(request, env)) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  await initializeApiKeys(env);
  return new Response(JSON.stringify(apiKeys.map(k => ({ name: k.name, isHealthy: k.isHealthy }))), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/admin/keys', async (request, env) => {
  if (!isAdmin(request, env)) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const data = await request.json();
    if (!data.name || !data.value) {
      return new Response(JSON.stringify({ error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await initializeApiKeys(env);
    apiKeys.push({ name: data.name, value: data.value });
    await env.ROUTER_KV.put('api_keys', JSON.stringify(apiKeys));
    
    return new Response(JSON.stringify({ success: true, message: '密钥添加成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: '请求处理失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

router.delete('/admin/keys/:name', async (request, env) => {
  if (!isAdmin(request, env)) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const { name } = request.params;
  
  await initializeApiKeys(env);
  const initialLength = apiKeys.length;
  apiKeys = apiKeys.filter(key => key.name !== name);
  
  if (apiKeys.length < initialLength) {
    await env.ROUTER_KV.put('api_keys', JSON.stringify(apiKeys));
    return new Response(JSON.stringify({ success: true, message: '密钥删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } else {
    return new Response(JSON.stringify({ error: '未找到指定密钥' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// OpenAI兼容的API路由
router.post('/v1/chat/completions', async (request, env) => {
  if (!validateApiAccess(request, env)) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  await initializeApiKeys(env);
  await healthCheck();
  
  const key = getNextKey();
  if (!key) {
    return new Response(JSON.stringify({ error: '没有可用的API密钥' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const requestData = await request.json();
    const model = requestData.model || 'gpt-3.5-turbo';
    
    // 转发请求到OpenRouter
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key.value}`,
        'HTTP-Referer': 'https://cloudrouter.project',
        'X-Title': 'CloudRouter'
      },
      body: JSON.stringify({
        ...requestData,
        // 确保模型名称正确，可以在这里进行映射
        model: model
      })
    });
    
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('处理请求失败:', error);
    // 标记当前密钥为不健康
    if (key) {
      key.isHealthy = false;
    }
    
    return new Response(JSON.stringify({ error: '处理请求失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 获取模型列表
router.get('/v1/models', async (request, env) => {
  if (!validateApiAccess(request, env)) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  await initializeApiKeys(env);
  await healthCheck();
  
  const key = getNextKey();
  if (!key) {
    return new Response(JSON.stringify({ error: '没有可用的API密钥' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${key.value}`,
        'HTTP-Referer': 'https://cloudrouter.project',
        'X-Title': 'CloudRouter'
      }
    });
    
    const data = await response.json();
    
    // 将OpenRouter的模型列表转换为OpenAI格式
    const openaiFormatModels = data.data.map(model => ({
      id: model.id,
      object: "model",
      created: Date.now(),
      owned_by: model.context.organization || "openrouter",
    }));
    
    return new Response(JSON.stringify({ 
      object: "list",
      data: openaiFormatModels
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    // 标记当前密钥为不健康
    if (key) {
      key.isHealthy = false;
    }
    
    return new Response(JSON.stringify({ error: '获取模型列表失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// 根路径重定向到管理页面
router.get('/', (request) => {
  return Response.redirect(`${new URL(request.url).origin}/admin`, 302);
});

// 添加404处理
router.all('*', () => new Response('Not Found', { status: 404 }));

// 主请求处理函数
export default {
  async fetch(request, env, ctx) {
    await initializeApiKeys(env);
    return router.handle(request, env);
  }
}; 