/**
 * OpenRouter API密钥管理器
 * 提供OpenAI兼容的API端点，自动轮询多个OpenRouter API密钥
 */

// 使用Cloudflare KV存储API密钥
// 在Cloudflare Dashboard中创建一个名为API_KEYS的KV命名空间

// 导入配置
import CONFIG from './config.js';

// 声明KV命名空间绑定
// 这个变量会在Cloudflare Workers环境中自动绑定到KV命名空间
/* global API_KEYS */

// 处理请求
async function handleRequest(request) {
  // 检查请求方法
  if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 管理API密钥的路由
  if (path === '/manage-keys' && request.method === 'POST') {
    return handleManageKeys(request);
  }

  // OpenAI兼容的聊天完成路由
  if (path === '/v1/chat/completions') {
    return handleChatCompletions(request);
  }

  // OpenAI兼容的模型列表路由
  if (path === '/v1/models') {
    return handleModels(request);
  }

  // 管理页面路由
  if (path === '/admin' && request.method === 'GET') {
    // 验证访问令牌
    const params = url.searchParams;
    const accessToken = params.get(CONFIG.ACCESS_TOKEN_PARAM);
    const storedAccessToken = await API_KEYS.get('access_token');

    // 如果没有设置访问令牌，允许首次访问以设置令牌
    if (!storedAccessToken) {
      return serveAdminPage(true);
    }

    // 验证访问令牌
    if (!accessToken || accessToken !== storedAccessToken) {
      return new Response('访问被拒绝。请提供有效的访问令牌。', { status: 403 });
    }

    return serveAdminPage(false);
  }

  // 默认路由 - 返回简单的信息页面
  if (path === '/' && request.method === 'GET') {
    return new Response(
      '<!DOCTYPE html>\n' +
      '<html>\n' +
      '  <head>\n' +
      '    <title>' + CONFIG.UI.TITLE + '</title>\n' +
      '    <meta charset="UTF-8">\n' +
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '    <style>\n' +
      '      body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }\n' +
      '      h1 { color: #333; }\n' +
      '      .container { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }\n' +
      '      p { line-height: 1.5; }\n' +
      '      code { background: #eee; padding: 2px 5px; border-radius: 3px; }\n' +
      '    </style>\n' +
      '  </head>\n' +
      '  <body>\n' +
      '    <h1>' + CONFIG.UI.TITLE + '</h1>\n' +
      '    <div class="container">\n' +
      '      <h2>服务说明</h2>\n' +
      '      <p>' + CONFIG.UI.DESCRIPTION + '，提供以下功能：</p>\n' +
      '      <ul>\n' +
      '        <li>存储多个OpenRouter API密钥</li>\n' +
      '        <li>提供OpenAI兼容的API端点</li>\n' +
      '        <li>自动轮询使用API密钥，当一个密钥用尽额度时自动切换到下一个</li>\n' +
      '      </ul>\n' +
      '      <p>管理页面受到保护，需要访问令牌才能访问。请使用以下链接访问管理页面：</p>\n' +
      '      <p><code>/admin?' + CONFIG.ACCESS_TOKEN_PARAM + '=您的访问令牌</code></p>\n' +
      '      <p>如果您是首次使用，请直接访问 <a href="/admin">/admin</a> 页面设置访问令牌。</p>\n' +
      '    </div>\n' +
      '\n' +
      '    <div class="container">\n' +
      '      <h2>API使用方法</h2>\n' +
      '      <p>您可以像OpenAI API一样使用此服务：</p>\n' +
      '      <pre><code>POST /v1/chat/completions\nContent-Type: application/json\nAuthorization: Bearer your-custom-key\n\n{\n  "model": "deepseek/deepseek-chat-v3-0324:free",\n  "messages": [\n    { "role": "user", "content": "你好，请介绍一下自己" }\n  ]\n}</code></pre>\n' +
      '      <p>获取可用模型：</p>\n' +
      '      <pre><code>GET /v1/models\nAuthorization: Bearer your-custom-key</code></pre>\n' +
      '    </div>\n' +
      '  </body>\n' +
      '</html>',
      {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      }
    );
  }

  // 404 - 未找到
  return new Response('未找到', { status: 404 });
}

// 处理CORS预检请求
function handleCORS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// 提供管理页面
function serveAdminPage(isFirstTime) {
  var firstTimeHtml = '';
  if (isFirstTime) {
    firstTimeHtml = '<div class="container">' +
      '<h2>首次设置</h2>' +
      '<p class="warning">请设置访问令牌以保护您的管理页面。此令牌将用于访问此管理页面。</p>' +
      '<input type="text" id="accessToken" placeholder="设置一个访问令牌（至少8个字符）">' +
      '<button id="saveTokenBtn">保存访问令牌</button>' +
      '<div id="tokenResponse" class="response"></div>' +
      '</div>';
  }

  var tabsHtml = '<div class="tab">' +
    '<button class="tablinks active" data-tab="apiKeysTab">密钥管理</button>' +
    '<button class="tablinks" data-tab="statsTab">使用统计</button>' +
    '<button class="tablinks" data-tab="settingsTab">设置</button>' +
    '</div>';

  var apiKeysTabHtml = '<div id="apiKeysTab" class="tabcontent visible">' +
    '<div class="container">' +
    '<h2>管理API密钥</h2>' +
    '<p>输入您的OpenRouter API密钥，每行一个：</p>' +
    '<textarea id="apiKeys" placeholder="sk-or-xxxxxxxx"></textarea>' +
    '<p>管理密码：</p>' +
    '<input type="password" id="adminPassword" placeholder="输入管理密码">' +
    '<br><br>' +
    '<button id="saveKeysBtn">保存密钥</button>' +
    '<div id="keysResponse" class="response"></div>' +
    '</div>' +
    '</div>';

  var statsTabHtml = '<div id="statsTab" class="tabcontent">' +
    '<div class="container">' +
    '<h2>使用统计</h2>' +
    '<button id="loadStatsBtn">加载统计数据</button>' +
    '<div id="statsResponse" class="response"></div>' +
    '</div>' +
    '</div>';

  var settingsTabHtml = '<div id="settingsTab" class="tabcontent">' +
    '<div class="container">' +
    '<h2>设置</h2>' +
    '<p>更改访问令牌：</p>' +
    '<input type="text" id="newAccessToken" placeholder="新的访问令牌（至少8个字符）">' +
    '<p>当前管理密码：</p>' +
    '<input type="password" id="currentAdminPassword" placeholder="输入当前管理密码">' +
    '<br><br>' +
    '<button id="updateTokenBtn">更新访问令牌</button>' +
    '<div id="settingsResponse" class="response"></div>' +
    '</div>' +
    '</div>';

  var scriptHtml = '<script>' +
    'function debugFetch(url, options) {' +
    '  console.log("Fetch request:", { url, options });' +
    '  document.getElementById("debug-info").textContent = "发送请求到: " + url;' +
    '  return fetch(url, options)' +
    '    .then(function(response) {' +
    '      console.log("Fetch response status:", response.status);' +
    '      document.getElementById("debug-info").textContent += "\n响应状态: " + response.status;' +
    '      return response.clone().text().then(function(text) {' +
    '        try {' +
    '          console.log("Fetch response body:", JSON.parse(text));' +
    '          document.getElementById("debug-info").textContent += "\n响应内容: " + text.substring(0, 100) + "...";' +
    '        } catch (e) {' +
    '          console.log("Fetch response body (text):", text);' +
    '          document.getElementById("debug-info").textContent += "\n响应内容: " + text.substring(0, 100) + "...";' +
    '        }' +
    '        return response;' +
    '      });' +
    '    })' +
    '    .catch(function(error) {' +
    '      console.error("Fetch error:", error);' +
    '      document.getElementById("debug-info").textContent += "\n请求错误: " + error.message;' +
    '      throw error;' +
    '    });' +
    '}' +
    '' +
    'function openTab(evt, tabName) {' +
    '  console.log("Opening tab:", tabName);' +
    '  var i, tabcontent, tablinks;' +
    '  tabcontent = document.getElementsByClassName("tabcontent");' +
    '  for (i = 0; i < tabcontent.length; i++) {' +
    '    tabcontent[i].classList.remove("visible");' +
    '  }' +
    '  tablinks = document.getElementsByClassName("tablinks");' +
    '  for (i = 0; i < tablinks.length; i++) {' +
    '    tablinks[i].classList.remove("active");' +
    '  }' +
    '  ' +
    '  var tabElement = document.getElementById(tabName);' +
    '  if (tabElement) {' +
    '    tabElement.classList.add("visible");' +
    '  } else {' +
    '    console.error("Tab element not found:", tabName);' +
    '  }' +
    '  ' +
    '  if (evt && evt.currentTarget) {' +
    '    evt.currentTarget.classList.add("active");' +
    '  } else {' +
    '    var buttons = document.querySelectorAll(".tablinks");' +
    '    for (i = 0; i < buttons.length; i++) {' +
    '      if (buttons[i].getAttribute("data-tab") === tabName) {' +
    '        buttons[i].classList.add("active");' +
    '        break;' +
    '      }' +
    '    }' +
    '  }' +
    '}' +
    '' +
    'function initializeUI() {' +
    '  console.log("Initializing UI...");' +
    '  document.getElementById("debug-info").textContent = "UI初始化中...";' +
    '  ' +
    '  // 直接绑定按钮点击事件，不使用事件监听器' +
    '  document.getElementById("saveTokenBtn").onclick = function() {' +
    '    console.log("保存令牌按钮被点击");' +
    '    document.getElementById("debug-info").textContent = "保存令牌按钮被点击";' +
    '    saveAccessToken();' +
    '  };' +
    '  ' +
    '  document.getElementById("saveKeysBtn").onclick = function() {' +
    '    console.log("保存密钥按钮被点击");' +
    '    document.getElementById("debug-info").textContent = "保存密钥按钮被点击";' +
    '    saveKeys();' +
    '  };' +
    '  ' +
    '  document.getElementById("loadStatsBtn").onclick = function() {' +
    '    console.log("加载统计按钮被点击");' +
    '    document.getElementById("debug-info").textContent = "加载统计按钮被点击";' +
    '    loadStats();' +
    '  };' +
    '  ' +
    '  document.getElementById("updateTokenBtn").onclick = function() {' +
    '    console.log("更新令牌按钮被点击");' +
    '    document.getElementById("debug-info").textContent = "更新令牌按钮被点击";' +
    '    updateAccessToken();' +
    '  };' +
    '  ' +
    '  // 绑定标签页切换事件' +
    '  var tabButtons = document.querySelectorAll(".tablinks");' +
    '  console.log("找到标签按钮:", tabButtons.length);' +
    '  ' +
    '  for (var i = 0; i < tabButtons.length; i++) {' +
    '    tabButtons[i].onclick = function() {' +
    '      var tabName = this.getAttribute("data-tab");' +
    '      console.log("标签按钮被点击:", tabName);' +
    '      document.getElementById("debug-info").textContent = "标签按钮被点击: " + tabName;' +
    '      openTab(null, tabName);' +
    '    };' +
    '  }' +
    '  ' +
    '  openTab(null, "apiKeysTab");' +
    '  document.getElementById("debug-info").textContent = "UI初始化完成";' +
    '}' +
    '' +
    '// 确保在页面加载完成后初始化UI' +
    'window.onload = function() {' +
    '  console.log("Window loaded");' +
    '  setTimeout(function() {' +
    '    console.log("执行延迟初始化");' +
    '    initializeUI();' +
    '    // 添加测试按钮事件' +
    '    document.getElementById("test-button").onclick = function() {' +
    '      document.getElementById("debug-info").textContent = "测试按钮被点击 - " + new Date().toISOString();' +
    '    };' +
    '  }, 500);' +
    '};' +
    '' +
    '// 备用初始化方法' +
    'document.addEventListener("DOMContentLoaded", function() {' +
    '  console.log("DOM内容已加载");' +
    '  setTimeout(function() {' +
    '    if (!window.uiInitialized) {' +
    '      console.log("使用DOMContentLoaded初始化UI");' +
    '      initializeUI();' +
    '    }' +
    '  }, 1000);' +
    '});' +
    '' +
    'async function saveAccessToken() {' +
    '  var accessToken = document.getElementById("accessToken").value.trim();' +
    '  ' +
    '  if (accessToken.length < 8) {' +
    '    document.getElementById("tokenResponse").textContent = "访问令牌至少需要8个字符";' +
    '    return;' +
    '  }' +
    '  ' +
    '  try {' +
    '    var response = await debugFetch("/manage-keys", {' +
    '      method: "POST",' +
    '      headers: {' +
    '        "Content-Type": "application/json"' +
    '      },' +
    '      body: JSON.stringify({' +
    '        accessToken: accessToken,' +
    '        action: "set_token"' +
    '      })' +
    '    });' +
    '    ' +
    '    var data = await response.json();' +
    '    if (data.success) {' +
    '      window.location.href = "/admin?access_token=" + accessToken;' +
    '    } else {' +
    '      document.getElementById("tokenResponse").textContent = JSON.stringify(data, null, 2);' +
    '    }' +
    '  } catch (error) {' +
    '    document.getElementById("tokenResponse").textContent = "错误: " + error.message;' +
    '  }' +
    '}' +
    '' +
    'async function updateAccessToken() {' +
    '  var newAccessToken = document.getElementById("newAccessToken").value.trim();' +
    '  var currentAdminPassword = document.getElementById("currentAdminPassword").value.trim();' +
    '  ' +
    '  if (newAccessToken.length < 8) {' +
    '    document.getElementById("settingsResponse").textContent = "新的访问令牌至少需要8个字符";' +
    '    return;' +
    '  }' +
    '  ' +
    '  if (!currentAdminPassword) {' +
    '    document.getElementById("settingsResponse").textContent = "请输入当前管理密码";' +
    '    return;' +
    '  }' +
    '  ' +
    '  try {' +
    '    var response = await debugFetch("/manage-keys", {' +
    '      method: "POST",' +
    '      headers: {' +
    '        "Content-Type": "application/json"' +
    '      },' +
    '      body: JSON.stringify({' +
    '        accessToken: newAccessToken,' +
    '        adminPassword: currentAdminPassword,' +
    '        action: "update_token"' +
    '      })' +
    '    });' +
    '    ' +
    '    var data = await response.json();' +
    '    document.getElementById("settingsResponse").textContent = JSON.stringify(data, null, 2);' +
    '    ' +
    '    if (data.success) {' +
    '      setTimeout(function() {' +
    '        alert("访问令牌已更新，请使用新的访问令牌访问管理页面。");' +
    '        window.location.href = "/admin?access_token=" + newAccessToken;' +
    '      }, 1000);' +
    '    }' +
    '  } catch (error) {' +
    '    document.getElementById("settingsResponse").textContent = "错误: " + error.message;' +
    '  }' +
    '}' +
    '' +
    'async function saveKeys() {' +
    '  var apiKeysElement = document.getElementById("apiKeys");' +
    '  var apiKeysText = apiKeysElement.value.trim();' +
    '  var apiKeys = apiKeysText.split("\n").filter(function(key) { return key.trim() !== ""; });' +
    '  var adminPassword = document.getElementById("adminPassword").value.trim();' +
    '  ' +
    '  if (!adminPassword) {' +
    '    document.getElementById("keysResponse").textContent = "请输入管理密码";' +
    '    return;' +
    '  }' +
    '  ' +
    '  if (apiKeys.length === 0) {' +
    '    document.getElementById("keysResponse").textContent = "请输入至少一个API密钥";' +
    '    return;' +
    '  }' +
    '  ' +
    '  try {' +
    '    var urlParams = new URLSearchParams(window.location.search);' +
    '    var accessToken = urlParams.get("access_token");' +
    '    ' +
    '    var response = await debugFetch("/manage-keys", {' +
    '      method: "POST",' +
    '      headers: {' +
    '        "Content-Type": "application/json"' +
    '      },' +
    '      body: JSON.stringify({' +
    '        keys: apiKeys,' +
    '        adminPassword: adminPassword,' +
    '        accessToken: accessToken,' +
    '        action: "set"' +
    '      })' +
    '    });' +
    '    ' +
    '    var data = await response.json();' +
    '    document.getElementById("keysResponse").textContent = JSON.stringify(data, null, 2);' +
    '  } catch (error) {' +
    '    document.getElementById("keysResponse").textContent = "错误: " + error.message;' +
    '  }' +
    '}' +
    '' +
    'async function loadStats() {' +
    '  try {' +
    '    var urlParams = new URLSearchParams(window.location.search);' +
    '    var accessToken = urlParams.get("access_token");' +
    '    ' +
    '    var adminPassword = prompt("请输入管理密码以查看统计数据");' +
    '    if (!adminPassword) return;' +
    '    ' +
    '    var response = await debugFetch("/manage-keys", {' +
    '      method: "POST",' +
    '      headers: {' +
    '        "Content-Type": "application/json"' +
    '      },' +
    '      body: JSON.stringify({' +
    '        adminPassword: adminPassword,' +
    '        accessToken: accessToken,' +
    '        action: "get"' +
    '      })' +
    '    });' +
    '    ' +
    '    var data = await response.json();' +
    '    ' +
    '    if (data.error) {' +
    '      document.getElementById("statsResponse").textContent = JSON.stringify(data, null, 2);' +
    '      return;' +
    '    }' +
    '    ' +
    '    var statsHtml = "<h3>API密钥统计</h3><table border=\"1\" style=\"width:100%; border-collapse: collapse;\">"' +
    '    + "<tr><th>密钥</th><th>使用次数</th><th>错误次数</th><th>状态</th></tr>";' +
    '    ' +
    '    for (var i = 0; i < data.keys.length; i++) {' +
    '      var key = data.keys[i];' +
    '      var usage = data.usage[i] || 0;' +
    '      var errors = data.errors[i] || 0;' +
    '      var isCurrent = i === data.currentIndex;' +
    '      ' +
    '      var maskedKey = key.substring(0, 8) + "..." + key.substring(key.length - 4);' +
    '      ' +
    '      statsHtml += "<tr>"' +
    '        + "<td>" + maskedKey + "</td>"' +
    '        + "<td>" + usage + "</td>"' +
    '        + "<td>" + errors + "</td>"' +
    '        + "<td>" + (isCurrent ? "<strong>当前使用中</strong>" : "") + "</td>"' +
    '        + "</tr>";' +
    '    }' +
    '    ' +
    '    statsHtml += "</table>";' +
    '    document.getElementById("statsResponse").innerHTML = statsHtml;' +
    '  } catch (error) {' +
    '    document.getElementById("statsResponse").textContent = "错误: " + error.message;' +
    '  }' +
    '}' +
    '</script>';

  var html = '<!DOCTYPE html>' +
    '<html>' +
    '  <head>' +
    '    <title>' + CONFIG.UI.TITLE + ' - 管理页面</title>' +
    '    <meta charset="UTF-8">' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '    <style>' +
    '      body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }' +
    '      h1 { color: #333; }' +
    '      .container { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }' +
    '      textarea { width: 100%; height: 100px; margin-bottom: 10px; }' +
    '      input[type="text"], input[type="password"] { width: 100%; padding: 8px; margin-bottom: 10px; }' +
    '      button { background: #4285f4; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; margin-right: 10px; }' +
    '      #debug-container { background: #ffe; padding: 10px; border: 1px solid #ddd; margin-top: 20px; }' +
    '      #debug-info { font-family: monospace; white-space: pre-wrap; font-size: 12px; }' +
    '      button:hover { background: #3b78e7; }' +
    '      .response { margin-top: 20px; white-space: pre-wrap; background: #eee; padding: 10px; }' +
    '      .warning { color: #d32f2f; font-weight: bold; }' +
    '      .tab { overflow: hidden; border: 1px solid #ccc; background-color: #f1f1f1; }' +
    '      .tab button { background-color: inherit; float: left; border: none; outline: none; cursor: pointer; padding: 14px 16px; }' +
    '      .tab button:hover { background-color: #ddd; }' +
    '      .tab button.active { background-color: #4285f4; color: white; }' +
    '      .tabcontent { display: none; padding: 20px; border: 1px solid #ccc; border-top: none; }' +
    '      .visible { display: block; }' +
    '    </style>' +
    '  </head>' +
    '  <body>' +
    '    <h1>' + CONFIG.UI.TITLE + '</h1>' +
    firstTimeHtml +
    tabsHtml +
    apiKeysTabHtml +
    statsTabHtml +
    settingsTabHtml +
    '<div class="container" id="debug-container">' +
    '  <h2>调试信息</h2>' +
    '  <button id="test-button">测试按钮响应</button>' +
    '  <div id="debug-info">等待初始化...</div>' +
    '</div>' +
    scriptHtml +
    '  </body>' +
    '</html>';

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

// 管理API密钥
async function handleManageKeys(request) {
  try {
    const requestData = await request.json();
    const { action } = requestData;

    // 设置访问令牌（首次设置）
    if (action === 'set_token') {
      const { accessToken } = requestData;

      // 检查是否已经设置了访问令牌
      const storedAccessToken = await API_KEYS.get('access_token');
      if (storedAccessToken) {
        return jsonResponse({ error: '访问令牌已经设置，请使用更新功能修改' }, 400);
      }

      // 验证访问令牌长度
      if (!accessToken || accessToken.length < 8) {
        return jsonResponse({ error: '访问令牌至少需要8个字符' }, 400);
      }

      // 保存访问令牌
      await API_KEYS.put('access_token', accessToken);

      return jsonResponse({ success: true, message: '访问令牌已设置' });
    }

    // 更新访问令牌
    if (action === 'update_token') {
      const { accessToken, adminPassword } = requestData;

      // 验证管理密码
      const storedPassword = await API_KEYS.get('admin_password');
      if (!storedPassword || storedPassword !== adminPassword) {
        return jsonResponse({ error: '管理密码不正确' }, 403);
      }

      // 验证访问令牌长度
      if (!accessToken || accessToken.length < 8) {
        return jsonResponse({ error: '访问令牌至少需要8个字符' }, 400);
      }

      // 保存新的访问令牌
      await API_KEYS.put('access_token', accessToken);

      return jsonResponse({ success: true, message: '访问令牌已更新' });
    }

    // 验证访问令牌（除了首次设置外的所有操作）
    const { accessToken } = requestData;
    const storedAccessToken = await API_KEYS.get('access_token');

    if (storedAccessToken && (!accessToken || accessToken !== storedAccessToken)) {
      return jsonResponse({ error: '访问令牌无效' }, 403);
    }

    // 设置或更新API密钥
    if (action === 'set') {
      const { keys, adminPassword } = requestData;

      // 验证管理密码
      const storedPassword = await API_KEYS.get('admin_password');

      if (!storedPassword) {
        // 首次设置
        await API_KEYS.put('admin_password', adminPassword);
      } else if (storedPassword !== adminPassword) {
        return jsonResponse({ error: '管理密码不正确' }, 403);
      }

      // 保存API密钥
      await API_KEYS.put('api_keys', JSON.stringify(keys));
      // 重置使用计数
      await API_KEYS.put('key_usage', JSON.stringify(keys.map(() => 0)));
      // 重置错误计数
      await API_KEYS.put('key_errors', JSON.stringify(keys.map(() => 0)));
      // 设置当前使用的密钥索引
      await API_KEYS.put('current_key_index', '0');

      return jsonResponse({ success: true, message: `已保存 ${keys.length} 个API密钥` });
    } else if (action === 'get') {
      // 获取当前密钥（需要管理密码）
      const { adminPassword } = requestData;
      const storedPassword = await API_KEYS.get('admin_password');

      if (!storedPassword || storedPassword !== adminPassword) {
        return jsonResponse({ error: '管理密码不正确' }, 403);
      }

      const apiKeys = await API_KEYS.get('api_keys');
      const keyUsage = await API_KEYS.get('key_usage');
      const keyErrors = await API_KEYS.get('key_errors');
      const currentKeyIndex = await API_KEYS.get('current_key_index');

      return jsonResponse({
        keys: apiKeys ? JSON.parse(apiKeys) : [],
        usage: keyUsage ? JSON.parse(keyUsage) : [],
        errors: keyErrors ? JSON.parse(keyErrors) : [],
        currentIndex: currentKeyIndex ? parseInt(currentKeyIndex) : 0
      });
    }

    return jsonResponse({ error: '无效的操作' }, 400);
  } catch (error) {
    return jsonResponse({ error: '处理请求时出错: ' + error.message }, 500);
  }
}

// 处理聊天完成请求
async function handleChatCompletions(request) {
  try {
    // 获取API密钥
    const apiKeys = await getApiKeys();
    if (!apiKeys || apiKeys.length === 0) {
      return jsonResponse({ error: CONFIG.ERROR_MESSAGES.NO_API_KEYS }, 500);
    }

    // 获取当前使用的密钥索引
    let currentKeyIndex = parseInt(await API_KEYS.get('current_key_index') || '0');
    if (isNaN(currentKeyIndex) || currentKeyIndex >= apiKeys.length) {
      currentKeyIndex = 0;
    }

    // 解析请求
    const requestData = await request.json();

    // 不需要验证Authorization头，因为验证是在OpenRouter端进行的

    // 创建转发到OpenRouter的请求
    const openRouterRequest = createOpenRouterRequest(requestData, apiKeys[currentKeyIndex]);

    // 发送请求到OpenRouter
    const response = await fetch(`${CONFIG.OPENROUTER_API_URL}/chat/completions`, openRouterRequest);
    const responseData = await response.json();

    // 检查是否有错误
    if (!response.ok) {
      // 检查是否是配额错误
      if (
        responseData.error &&
        (responseData.error.type === 'insufficient_quota' ||
         responseData.error.message?.includes('quota') ||
         responseData.error.message?.includes('rate limit'))
      ) {
        // 更新错误计数
        await updateKeyErrorCount(currentKeyIndex);

        // 切换到下一个密钥
        const nextKeyIndex = await rotateToNextKey(currentKeyIndex, apiKeys.length);

        // 如果所有密钥都已用尽，返回错误
        if (nextKeyIndex === -1) {
          return jsonResponse({ error: CONFIG.ERROR_MESSAGES.QUOTA_EXCEEDED }, 429);
        }

        // 使用新密钥重试请求
        const retryRequest = createOpenRouterRequest(requestData, apiKeys[nextKeyIndex]);
        const retryResponse = await fetch(`${CONFIG.OPENROUTER_API_URL}/chat/completions`, retryRequest);

        if (!retryResponse.ok) {
          return jsonResponse(await retryResponse.json(), retryResponse.status);
        }

        // 更新使用计数
        await updateKeyUsageCount(nextKeyIndex);

        return jsonResponse(await retryResponse.json());
      }

      return jsonResponse(responseData, response.status);
    }

    // 更新使用计数
    await updateKeyUsageCount(currentKeyIndex);

    // 返回成功响应
    return jsonResponse(responseData);
  } catch (error) {
    return jsonResponse({ error: CONFIG.ERROR_MESSAGES.INTERNAL_ERROR + ': ' + error.message }, 500);
  }
}

// 处理模型列表请求
async function handleModels(request) {
  try {
    // 获取API密钥
    const apiKeys = await getApiKeys();
    if (!apiKeys || apiKeys.length === 0) {
      return jsonResponse({ error: CONFIG.ERROR_MESSAGES.NO_API_KEYS }, 500);
    }

    // 获取当前使用的密钥索引
    let currentKeyIndex = parseInt(await API_KEYS.get('current_key_index') || '0');
    if (isNaN(currentKeyIndex) || currentKeyIndex >= apiKeys.length) {
      currentKeyIndex = 0;
    }

    // 创建请求
    const openRouterRequest = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKeys[currentKeyIndex]}`,
        'HTTP-Referer': request.headers.get('origin') || 'https://openrouter-apikey-manager.workers.dev',
        'X-Title': 'OpenRouter API Key Manager'
      }
    };

    // 发送请求到OpenRouter
    const response = await fetch(`${CONFIG.OPENROUTER_API_URL}/models`, openRouterRequest);

    if (!response.ok) {
      const responseData = await response.json();

      // 检查是否是配额错误
      if (
        responseData.error &&
        (responseData.error.type === 'insufficient_quota' ||
         responseData.error.message?.includes('quota') ||
         responseData.error.message?.includes('rate limit'))
      ) {
        // 更新错误计数
        await updateKeyErrorCount(currentKeyIndex);

        // 切换到下一个密钥
        const nextKeyIndex = await rotateToNextKey(currentKeyIndex, apiKeys.length);

        // 如果所有密钥都已用尽，返回错误
        if (nextKeyIndex === -1) {
          return jsonResponse({ error: CONFIG.ERROR_MESSAGES.QUOTA_EXCEEDED }, 429);
        }

        // 使用新密钥重试请求
        openRouterRequest.headers.Authorization = `Bearer ${apiKeys[nextKeyIndex]}`;
        const retryResponse = await fetch(`${CONFIG.OPENROUTER_API_URL}/models`, openRouterRequest);

        if (!retryResponse.ok) {
          return jsonResponse(await retryResponse.json(), retryResponse.status);
        }

        // 格式化为OpenAI兼容的响应
        const models = await retryResponse.json();
        return jsonResponse(formatModelsResponse(models));
      }

      return jsonResponse(responseData, response.status);
    }

    // 格式化为OpenAI兼容的响应
    const models = await response.json();
    return jsonResponse(formatModelsResponse(models));
  } catch (error) {
    return jsonResponse({ error: CONFIG.ERROR_MESSAGES.INTERNAL_ERROR + ': ' + error.message }, 500);
  }
}

// 创建OpenRouter请求
function createOpenRouterRequest(requestData, apiKey) {
  // 复制请求数据
  const openRouterData = { ...requestData };

  // 如果没有指定模型，使用默认模型
  if (!openRouterData.model) {
    openRouterData.model = CONFIG.DEFAULT_MODEL;
  }

  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://openrouter-apikey-manager.workers.dev',
      'X-Title': 'OpenRouter API Key Manager'
    },
    body: JSON.stringify(openRouterData)
  };
}

// 格式化模型响应为OpenAI兼容格式
function formatModelsResponse(openRouterModels) {
  if (!openRouterModels.data) {
    return { data: [] };
  }

  return {
    data: openRouterModels.data.map(model => ({
      id: model.id,
      object: 'model',
      created: Date.now(),
      owned_by: model.owned_by || 'openrouter',
      permission: [{
        id: `modelperm-${model.id}`,
        object: 'model_permission',
        created: Date.now(),
        allow_create_engine: false,
        allow_sampling: true,
        allow_logprobs: true,
        allow_search_indices: false,
        allow_view: true,
        allow_fine_tuning: false,
        organization: '*',
        group: null,
        is_blocking: false
      }],
      root: model.id,
      parent: null
    }))
  };
}

// 获取API密钥
async function getApiKeys() {
  const apiKeysStr = await API_KEYS.get('api_keys');
  if (!apiKeysStr) return [];

  try {
    return JSON.parse(apiKeysStr);
  } catch (error) {
    return [];
  }
}

// 更新密钥使用计数
async function updateKeyUsageCount(keyIndex) {
  try {
    const keyUsageStr = await API_KEYS.get('key_usage');
    let keyUsage = [];

    if (keyUsageStr) {
      keyUsage = JSON.parse(keyUsageStr);
    }

    // 确保数组长度足够
    while (keyUsage.length <= keyIndex) {
      keyUsage.push(0);
    }

    // 增加使用计数
    keyUsage[keyIndex]++;

    // 保存更新后的使用计数
    await API_KEYS.put('key_usage', JSON.stringify(keyUsage));
  } catch (error) {
    console.error('更新密钥使用计数时出错:', error);
  }
}

// 更新密钥错误计数
async function updateKeyErrorCount(keyIndex) {
  try {
    const keyErrorsStr = await API_KEYS.get('key_errors');
    let keyErrors = [];

    if (keyErrorsStr) {
      keyErrors = JSON.parse(keyErrorsStr);
    }

    // 确保数组长度足够
    while (keyErrors.length <= keyIndex) {
      keyErrors.push(0);
    }

    // 增加错误计数
    keyErrors[keyIndex]++;

    // 保存更新后的错误计数
    await API_KEYS.put('key_errors', JSON.stringify(keyErrors));
  } catch (error) {
    console.error('更新密钥错误计数时出错:', error);
  }
}

// 轮询到下一个可用的密钥
async function rotateToNextKey(currentIndex, totalKeys) {
  // 如果只有一个密钥，无法轮询
  if (totalKeys <= 1) {
    return -1;
  }

  // 计算下一个密钥索引
  const nextIndex = (currentIndex + 1) % totalKeys;

  // 保存新的密钥索引
  await API_KEYS.put('current_key_index', nextIndex.toString());

  return nextIndex;
}

// 创建JSON响应
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// 注册事件监听器
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
