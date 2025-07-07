# CloudRouter 部署完整指南

本指南将帮助您完成 CloudRouter 的完整部署流程。

## 🚀 快速开始

### 方法一：一键部署（推荐）

1. 点击下面的按钮进行一键部署：
   
   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cheluen/cloudrouter)

2. 登录您的 Cloudflare 账户

3. 按照提示完成部署

### 方法二：手动部署

#### 前提条件

- [Node.js](https://nodejs.org/) 18 或更高版本
- [Git](https://git-scm.com/)
- Cloudflare 账户

#### 步骤 1: 克隆项目

```bash
git clone https://github.com/cheluen/cloudrouter.git
cd cloudrouter
```

#### 步骤 2: 安装依赖

```bash
npm install
```

#### 步骤 3: 登录 Cloudflare

```bash
npx wrangler login
```

这将打开浏览器，请按照提示登录您的 Cloudflare 账户。

#### 步骤 4: 创建 KV 命名空间

```bash
npx wrangler kv:namespace create "ROUTER_KV"
```

记录输出的 KV 命名空间 ID，例如：
```
{ binding = "ROUTER_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

#### 步骤 5: 更新配置文件

编辑 `wrangler.toml` 文件，将 KV 命名空间 ID 替换为您刚才创建的 ID：

```toml
[[kv_namespaces]]
binding = "ROUTER_KV"
id = "您的KV命名空间ID"  # 替换这里
```

#### 步骤 6: 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署成功后，您将看到类似以下的输出：
```
Published cloudrouter (1.23s)
  https://cloudrouter.your-username.workers.dev
```

## 🔧 首次设置

### 1. 访问管理面板

部署完成后，访问您的 Worker URL（例如 `https://cloudrouter.your-username.workers.dev`）

### 2. 设置管理员密码

首次访问时，系统会提示您设置管理员密码：
- 密码长度至少 8 位
- 请记住此密码，它用于访问管理面板

### 3. 添加 OpenRouter API 密钥

1. 使用刚设置的密码登录管理面板
2. 在"API 密钥管理"部分，添加您的 OpenRouter API 密钥
3. 为每个密钥提供一个易识别的名称
4. 系统会自动检查密钥的健康状态

### 4. 配置客户端

将您的 AI 客户端（如 NextChat, LobeChat 等）配置为：
- **API Base URL**: `https://your-worker-url.workers.dev/v1`
- **API Key**: 任何以 `sk-` 开头的字符串（例如 `sk-12345`）

## 🧪 测试部署

### 测试 API 状态

```bash
curl https://your-worker-url.workers.dev/api/admin/auth/status
```

应该返回：
```json
{"isPasswordSet":true}
```

### 测试模型列表

```bash
curl -H "Authorization: Bearer sk-test" https://your-worker-url.workers.dev/v1/models
```

应该返回 OpenRouter 的模型列表。

### 测试聊天完成

```bash
curl -X POST https://your-worker-url.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-test" \
  -d '{
    "model": "mistralai/mistral-7b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

## 🔍 故障排除

### 常见问题

1. **部署失败：需要 API Token**
   - 确保已运行 `npx wrangler login` 并成功登录
   - 或设置 `CLOUDFLARE_API_TOKEN` 环境变量

2. **KV 命名空间错误**
   - 确保 `wrangler.toml` 中的 KV 命名空间 ID 正确
   - 重新创建 KV 命名空间：`npx wrangler kv:namespace create "ROUTER_KV"`

3. **API 密钥无效**
   - 确保 OpenRouter API 密钥有效且有足够余额
   - 检查密钥是否以 `sk-or-` 开头

4. **管理面板无法访问**
   - 检查 Worker 是否成功部署
   - 确保访问的是正确的 Worker URL

### 查看日志

```bash
npx wrangler tail
```

这将显示实时日志，帮助诊断问题。

## 📝 更新部署

当有新版本时，更新部署：

```bash
git pull origin main
npm install
npm run deploy
```

## 🔒 安全建议

1. **管理员密码**：使用强密码，定期更换
2. **API 密钥**：定期轮换 OpenRouter API 密钥
3. **访问控制**：考虑在 Cloudflare 中设置访问规则

## 📞 获取帮助

如果遇到问题：
1. 查看 [GitHub Issues](https://github.com/cheluen/cloudrouter/issues)
2. 创建新的 Issue 描述您的问题
3. 提供详细的错误信息和日志

---

🎉 恭喜！您的 CloudRouter 现在已经成功部署并运行！
