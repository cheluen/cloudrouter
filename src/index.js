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
    // 这里我们包含了预先编写的HTML内容
    // 在实际部署中，你可以从静态资源或KV存储中获取
    adminHtml = await fetch('https://raw.githubusercontent.com/yourusername/cloudrouter/main/src/admin.html').then(res => res.text());
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