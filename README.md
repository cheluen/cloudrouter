# CloudRouter

> ✅ **稳定版本** - 完全可用，推荐部署使用

CloudRouter 是一个基于 Cloudflare Workers 的智能 API 路由器，为 OpenRouter API 提供 OpenAI 兼容接口，支持多密钥轮询、故障转移和 xAI Grok 模型的推理功能。

## 功能特性

- **OpenAI 兼容 API**：支持 `/v1/models` 和 `/v1/chat/completions` 端点，直接代理 OpenRouter 请求
- **推理功能支持**：新增 `/v1/chat/completions/reasoning` 端点，专为 xAI Grok 4 Fast 等模型启用 reasoning tokens（链式思考），提升复杂任务表现
- **智能密钥轮询**：多个 OpenRouter API 密钥自动轮询，提高并发能力和可用性
- **故障转移与健康检查**：密钥失效时自动切换，支持深度健康检查（包括数据策略验证）
- **Web 管理界面**：内置管理面板，支持 API 密钥添加/删除、客户端 Token 管理（自定义生成、启用/禁用）、密码修改
- **自定义 Token**：生成 OpenAI 风格的客户端访问 Token（sk- 前缀），完全控制访问权限
- **安全与隐私**：密码 SHA-256 哈希存储，日志仅记录密钥前 8 位和 body 大小，不暴露敏感数据
- **全球加速**：基于 Cloudflare Workers，全球边缘计算，低延迟，支持流式响应

## 一键部署

### 直接部署（推荐）
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cheluen/cloudrouter&autofork=false)

### Fork 后部署
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cheluen/cloudrouter)

## 手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/cheluen/cloudrouter.git
cd cloudrouter

# 2. 安装依赖
npm install

# 3. 登录 Cloudflare
npx wrangler login

# 4. 创建 KV 命名空间（用于存储密钥、密码哈希和 Token）
npx wrangler kv:namespace create "ROUTER_KV"

# 5. 更新 wrangler.toml 中的 KV ID
# 将命令输出的 ID 复制到 wrangler.toml 的 [[kv_namespaces]] 部分

# 6. 部署
npx wrangler deploy
# 或使用 npm run deploy（如果 package.json 中定义）
```

## 使用方法

1. **初始设置**：
   - 访问你的 Worker URL（e.g., `https://your-worker.workers.dev`），首次访问会引导设置管理员密码（至少 8 位）。

2. **管理界面操作**：
   - **添加 OpenRouter API 密钥**：在“API 密钥管理”部分输入名称和密钥值（sk-...），系统会自动健康检查。
   - **创建客户端 Token**：在“客户端 Token 管理”部分生成 Token（支持自定义值），可启用/禁用。
   - **修改密码**：在“修改管理员密码”部分更新密码。
   - **健康检查**：点击“深度健康检查”验证所有密钥（测试免费模型连通性）。

3. **API 配置**：
   - **Base URL**：`https://your-worker.workers.dev/v1`
   - **API Key**：使用管理界面生成的客户端 Token（Bearer Token 格式）
   - **端点**：
     - `/v1/models`：获取可用模型列表
     - `/v1/chat/completions`：标准聊天完成（无推理，默认）
     - `/v1/chat/completions/reasoning`：启用推理（仅支持 xAI Grok 模型，如 'xai/grok-4-fast'）

4. **示例请求**（使用 curl，替换 YOUR_URL 和 YOUR_TOKEN）：

   **标准聊天**：
   ```bash
   curl -X POST https://YOUR_URL/v1/chat/completions \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "openai/gpt-3.5-turbo",
       "messages": [{"role": "user", "content": "Hello!"}],
       "max_tokens": 100
     }'
   ```

   **启用推理（Grok 模型）**：
   ```bash
   curl -X POST https://YOUR_URL/v1/chat/completions/reasoning \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "xai/grok-4-fast",
       "messages": [{"role": "user", "content": "解释量子计算的基本原理"}],
       "max_tokens": 500,
       "stream": false
     }'
   ```
   - 系统会自动添加 `"reasoning": {"enabled": true}` 到请求体。
   - 如果模型不支持推理，会返回 400 错误提示使用支持模型。

5. **注意事项**：
   - **模型 ID**：从 `/v1/models` 获取 OpenRouter 支持的模型列表。推理仅限 xAI Grok 系列（基于 OpenRouter 文档）。
   - **限流与计费**：代理 OpenRouter 的限流和定价，无额外费用。
   - **隐私**：不记录请求内容，仅日志摘要。OpenRouter 可能用提示改进模型（见其条款）。
   - **调试**：管理界面显示密钥状态（健康/不可用），日志可在 Cloudflare 控制台查看。

## 版本说明

- ✅ **当前版本**：v1.0（稳定），包含推理端点、多密钥轮询、健康检查和管理面板
- 🔧 **更新亮点**：新增 reasoning 支持，提升 Grok 模型在逻辑/数学任务的表现；优化日志隐私
- 🚀 **推荐使用**：适合生产环境，易扩展（可添加更多支持模型）
- 📖 **文档参考**：OpenRouter [reasoning tokens 指南](https://openrouter.ai/docs/use-cases/reasoning-tokens)

## 许可证

MIT License

---

**作者**：cheluen  
**仓库**：https://github.com/cheluen/cloudrouter  
**问题反馈**：GitHub Issues
