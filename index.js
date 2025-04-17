/**
 * OpenRouter API密钥管理器
 * 提供OpenAI兼容的API端点，自动轮询多个OpenRouter API密钥
 */

// 使用Cloudflare KV存储API密钥
// 在Cloudflare Dashboard中创建一个名为API_KEYS的KV命名空间

// 配置
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'anthropic/claude-3-opus-20240229';

// 安全配置
const ACCESS_TOKEN_PARAM = 'access_token'; // URL参数名称，用于访问管理页面

// 错误消息
const ERROR_MESSAGES = {
  NO_API_KEYS: '没有可用的API密钥',
  QUOTA_EXCEEDED: '配额已用尽',
  INVALID_REQUEST: '无效的请求',
  INTERNAL_ERROR: '内部服务器错误'
};

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
    const accessToken = params.get(ACCESS_TOKEN_PARAM);
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
      `<!DOCTYPE html>
      <html>
        <head>
          <title>OpenRouter API密钥管理器</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            .container { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
            p { line-height: 1.5; }
            code { background: #eee; padding: 2px 5px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>OpenRouter API密钥管理器</h1>
          <div class="container">
            <h2>服务说明</h2>
            <p>这是一个OpenRouter API密钥管理服务，提供以下功能：</p>
            <ul>
              <li>存储多个OpenRouter API密钥</li>
              <li>提供OpenAI兼容的API端点</li>
              <li>自动轮询使用API密钥，当一个密钥用尽额度时自动切换到下一个</li>
            </ul>
            <p>管理页面受到保护，需要访问令牌才能访问。请使用以下链接访问管理页面：</p>
            <p><code>/admin?access_token=您的访问令牌</code></p>
            <p>如果您是首次使用，请直接访问 <a href="/admin">/admin</a> 页面设置访问令牌。</p>
          </div>

          <div class="container">
            <h2>API使用方法</h2>
            <p>您可以像OpenAI API一样使用此服务：</p>
            <pre><code>POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer your-custom-key

{
  "model": "anthropic/claude-3-opus-20240229",
  "messages": [
    { "role": "user", "content": "你好，请介绍一下自己" }
  ]
}</code></pre>
            <p>获取可用模型：</p>
            <pre><code>GET /v1/models
Authorization: Bearer your-custom-key</code></pre>
          </div>
        </body>
      </html>`,
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
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>OpenRouter API密钥管理器 - 管理页面</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          .container { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          textarea { width: 100%; height: 100px; margin-bottom: 10px; }
          input[type="text"], input[type="password"] { width: 100%; padding: 8px; margin-bottom: 10px; }
          button { background: #4285f4; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; }
          button:hover { background: #3b78e7; }
          .response { margin-top: 20px; white-space: pre-wrap; background: #eee; padding: 10px; }
          .warning { color: #d32f2f; font-weight: bold; }
          .tab { overflow: hidden; border: 1px solid #ccc; background-color: #f1f1f1; }
          .tab button { background-color: inherit; float: left; border: none; outline: none; cursor: pointer; padding: 14px 16px; }
          .tab button:hover { background-color: #ddd; }
          .tab button.active { background-color: #4285f4; color: white; }
          .tabcontent { display: none; padding: 20px; border: 1px solid #ccc; border-top: none; }
          .visible { display: block; }
        </style>
      </head>
      <body>
        <h1>OpenRouter API密钥管理器</h1>

        ${isFirstTime ? `
        <div class="container">
          <h2>首次设置</h2>
          <p class="warning">请设置访问令牌以保护您的管理页面。此令牌将用于访问此管理页面。</p>
          <input type="text" id="accessToken" placeholder="设置一个访问令牌（至少8个字符）">
          <button onclick="saveAccessToken()">保存访问令牌</button>
          <div id="tokenResponse" class="response"></div>
        </div>
        ` : ''}

        <div class="tab">
          <button class="tablinks active" onclick="openTab(event, 'apiKeysTab')">密钥管理</button>
          <button class="tablinks" onclick="openTab(event, 'statsTab')">使用统计</button>
          <button class="tablinks" onclick="openTab(event, 'settingsTab')">设置</button>
        </div>

        <div id="apiKeysTab" class="tabcontent visible">
          <div class="container">
            <h2>管理API密钥</h2>
            <p>输入您的OpenRouter API密钥，每行一个：</p>
            <textarea id="apiKeys" placeholder="sk-or-xxxxxxxx"></textarea>
            <p>管理密码：</p>
            <input type="password" id="adminPassword" placeholder="输入管理密码">
            <br><br>
            <button onclick="saveKeys()">保存密钥</button>
            <div id="keysResponse" class="response"></div>
          </div>
        </div>

        <div id="statsTab" class="tabcontent">
          <div class="container">
            <h2>使用统计</h2>
            <button onclick="loadStats()">加载统计数据</button>
            <div id="statsResponse" class="response"></div>
          </div>
        </div>

        <div id="settingsTab" class="tabcontent">
          <div class="container">
            <h2>设置</h2>
            <p>更改访问令牌：</p>
            <input type="text" id="newAccessToken" placeholder="新的访问令牌（至少8个字符）">
            <p>当前管理密码：</p>
            <input type="password" id="currentAdminPassword" placeholder="输入当前管理密码">
            <br><br>
            <button onclick="updateAccessToken()">更新访问令牌</button>
            <div id="settingsResponse" class="response"></div>
          </div>
        </div>

        <script>
          // 调试函数
          function debugFetch(url, options) {
            console.log('Fetch request:', { url, options });
            return fetch(url, options)
              .then(response => {
                console.log('Fetch response status:', response.status);
                return response.clone().text().then(text => {
                  try {
                    console.log('Fetch response body:', JSON.parse(text));
                  } catch (e) {
                    console.log('Fetch response body (text):', text);
                  }
                  return response;
                });
              })
              .catch(error => {
                console.error('Fetch error:', error);
                throw error;
              });
          }

          // 切换标签页
          function openTab(evt, tabName) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tabcontent");
            for (i = 0; i < tabcontent.length; i++) {
              tabcontent[i].classList.remove("visible");
            }
            tablinks = document.getElementsByClassName("tablinks");
            for (i = 0; i < tablinks.length; i++) {
              tablinks[i].classList.remove("active");
            }
            document.getElementById(tabName).classList.add("visible");
            evt.currentTarget.classList.add("active");
          }

          // 保存访问令牌
          async function saveAccessToken() {
            const accessToken = document.getElementById('accessToken').value.trim();

            if (accessToken.length < 8) {
              document.getElementById('tokenResponse').textContent = '访问令牌至少需要8个字符';
              return;
            }

            try {
              const response = await debugFetch('/manage-keys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  accessToken: accessToken,
                  action: 'set_token'
                })
              });

              const data = await response.json();
              if (data.success) {
                // 重定向到带有访问令牌的管理页面
                window.location.href = '/admin?access_token=' + accessToken;
              } else {
                document.getElementById('tokenResponse').textContent = JSON.stringify(data, null, 2);
              }
            } catch (error) {
              document.getElementById('tokenResponse').textContent = '错误: ' + error.message;
            }
          }

          // 更新访问令牌
          async function updateAccessToken() {
            const newAccessToken = document.getElementById('newAccessToken').value.trim();
            const currentAdminPassword = document.getElementById('currentAdminPassword').value.trim();

            if (newAccessToken.length < 8) {
              document.getElementById('settingsResponse').textContent = '新的访问令牌至少需要8个字符';
              return;
            }

            if (!currentAdminPassword) {
              document.getElementById('settingsResponse').textContent = '请输入当前管理密码';
              return;
            }

            try {
              const response = await debugFetch('/manage-keys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  accessToken: newAccessToken,
                  adminPassword: currentAdminPassword,
                  action: 'update_token'
                })
              });

              const data = await response.json();
              document.getElementById('settingsResponse').textContent = JSON.stringify(data, null, 2);

              if (data.success) {
                // 提示用户使用新令牌
                setTimeout(() => {
                  alert('访问令牌已更新，请使用新的访问令牌访问管理页面。');
                  window.location.href = '/admin?access_token=' + newAccessToken;
                }, 1000);
              }
            } catch (error) {
              document.getElementById('settingsResponse').textContent = '错误: ' + error.message;
            }
          }

          // 保存API密钥
          async function saveKeys() {
            const apiKeys = document.getElementById('apiKeys').value.trim().split('\n').filter(key => key.trim() !== '');
            const adminPassword = document.getElementById('adminPassword').value.trim();

            if (!adminPassword) {
              document.getElementById('keysResponse').textContent = '请输入管理密码';
              return;
            }

            if (apiKeys.length === 0) {
              document.getElementById('keysResponse').textContent = '请输入至少一个API密钥';
              return;
            }

            try {
              // 获取当前URL中的访问令牌
              const urlParams = new URLSearchParams(window.location.search);
              const accessToken = urlParams.get('access_token');

              const response = await debugFetch('/manage-keys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  keys: apiKeys,
                  adminPassword: adminPassword,
                  accessToken: accessToken,
                  action: 'set'
                })
              });

              const data = await response.json();
              document.getElementById('keysResponse').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
              document.getElementById('keysResponse').textContent = '错误: ' + error.message;
            }
          }

          // 加载统计数据
          async function loadStats() {
            try {
              // 获取当前URL中的访问令牌
              const urlParams = new URLSearchParams(window.location.search);
              const accessToken = urlParams.get('access_token');

              const adminPassword = prompt('请输入管理密码以查看统计数据');
              if (!adminPassword) return;

              const response = await debugFetch('/manage-keys', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  adminPassword: adminPassword,
                  accessToken: accessToken,
                  action: 'get'
                })
              });

              const data = await response.json();

              if (data.error) {
                document.getElementById('statsResponse').textContent = JSON.stringify(data, null, 2);
                return;
              }

              // 格式化统计数据
              let statsHtml = '<h3>API密钥统计</h3><table border="1" style="width:100%; border-collapse: collapse;">';
              statsHtml += '<tr><th>密钥</th><th>使用次数</th><th>错误次数</th><th>状态</th></tr>';

              for (let i = 0; i < data.keys.length; i++) {
                const key = data.keys[i];
                const usage = data.usage[i] || 0;
                const errors = data.errors[i] || 0;
                const isCurrent = i === data.currentIndex;

                // 显示密钥的前8位和后4位
                const maskedKey = key.substring(0, 8) + '...' + key.substring(key.length - 4);

                statsHtml += '<tr>' +
                  '<td>' + maskedKey + '</td>' +
                  '<td>' + usage + '</td>' +
                  '<td>' + errors + '</td>' +
                  '<td>' + (isCurrent ? '<strong>当前使用中</strong>' : '') + '</td>' +
                '</tr>';
              }

              statsHtml += '</table>';
              document.getElementById('statsResponse').innerHTML = statsHtml;
            } catch (error) {
              document.getElementById('statsResponse').textContent = '错误: ' + error.message;
            }
          }
        </script>
      </body>
    </html>`,
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
      return jsonResponse({ error: ERROR_MESSAGES.NO_API_KEYS }, 500);
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
    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, openRouterRequest);
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
          return jsonResponse({ error: ERROR_MESSAGES.QUOTA_EXCEEDED }, 429);
        }

        // 使用新密钥重试请求
        const retryRequest = createOpenRouterRequest(requestData, apiKeys[nextKeyIndex]);
        const retryResponse = await fetch(`${OPENROUTER_API_URL}/chat/completions`, retryRequest);

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
    return jsonResponse({ error: ERROR_MESSAGES.INTERNAL_ERROR + ': ' + error.message }, 500);
  }
}

// 处理模型列表请求
async function handleModels(request) {
  try {
    // 获取API密钥
    const apiKeys = await getApiKeys();
    if (!apiKeys || apiKeys.length === 0) {
      return jsonResponse({ error: ERROR_MESSAGES.NO_API_KEYS }, 500);
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
    const response = await fetch(`${OPENROUTER_API_URL}/models`, openRouterRequest);

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
          return jsonResponse({ error: ERROR_MESSAGES.QUOTA_EXCEEDED }, 429);
        }

        // 使用新密钥重试请求
        openRouterRequest.headers.Authorization = `Bearer ${apiKeys[nextKeyIndex]}`;
        const retryResponse = await fetch(`${OPENROUTER_API_URL}/models`, openRouterRequest);

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
    return jsonResponse({ error: ERROR_MESSAGES.INTERNAL_ERROR + ': ' + error.message }, 500);
  }
}

// 创建OpenRouter请求
function createOpenRouterRequest(requestData, apiKey) {
  // 复制请求数据
  const openRouterData = { ...requestData };

  // 如果没有指定模型，使用默认模型
  if (!openRouterData.model) {
    openRouterData.model = DEFAULT_MODEL;
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
