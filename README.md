✦ CloudRouter


  CloudRouter 是一个基于 Cloudflare Workers 的 OpenRouter API 代理工具，提供 OpenAI
  兼容接口，支持多密钥轮询、健康检查和 reasoning 功能。适用于 AI 客户端集成，简化 OpenRouter 使用。


  功能特性


   - OpenAI 兼容：支持 /v1/models 和 /v1/chat/completions 端点，兼容 OpenAI SDK、LangChain 等工具。
   - 密钥管理：支持多个 OpenRouter API 密钥，自动轮询和健康检查（检测限流/积分不足，fallback 到可用密钥）。
   - Reasoning 支持：在 model 参数后添加 |reasoning（e.g., "x-ai/grok-4-fast|reasoning"）启用模型 reasoning
     模式（链式思考）。OpenRouter 自动处理兼容模型（如 Grok、Gemini、DeepSeek），不支持的忽略参数。
   - 管理面板：Web 界面用于设置密码、添加密钥、生成客户端 Token 和健康检查。
   - 安全与监控：客户端 Token 验证，Cloudflare 日志记录请求/错误，支持 stream 和标准参数。
   - 兼容性：JSON 响应，支持 max_tokens、temperature、stream 等。reasoning 增加输出长度（思考步骤），注意 token 消耗。


  快速开始


  1. 部署
   1. 安装 Wrangler CLI：


   1    npm install -g wrangler

   2. 克隆仓库并部署：


   1    git clone https://github.com/cheluen/cloudrouter.git
   2    cd cloudrouter
   3    npx wrangler deploy

   3. 配置 KV（可选，持久化数据）：
      - 编辑 wrangler.toml：


   1      [[kv_namespaces]]
   2      binding = "ROUTER_KV"
   3      id = "your-kv-id"  # Cloudflare 仪表盘创建

      - 运行 npx wrangler deploy 更新。
   4. 获取 URL：Cloudflare 仪表盘 > Workers > cloudrouter > Triggers > Custom Domain（或默认 *.workers.dev）。


  2. 配置面板
   - 访问 Worker URL（e.g., https://cloudrouter.your-domain.workers.dev）。
   - 设置密码：首次访问设置管理员密码。
   - 添加密钥：在 "API 密钥管理" 添加 OpenRouter 密钥（sk-or-v1...），支持多密钥。
   - 生成 Token：在 "客户端 Token 管理" 生成 Token（用于 API 验证），可启用/禁用。
   - 健康检查：点击 "深度健康检查" 测试密钥状态（显示限流/积分问题）。


  3. API 使用
  Base URL：https://your-worker-url.workers.dev/v1（替换为你的 URL）。


  基本调用
  Python OpenAI SDK 示例：


    1 from openai import OpenAI
    2 
    3 client = OpenAI(
    4     api_key="YOUR_CLIENT_TOKEN",  # 从面板生成
    5     base_url="https://your-worker-url.workers.dev/v1"
    6 )
    7 
    8 response = client.chat.completions.create(
    9     model="x-ai/grok-4-fast",  # 从 /v1/models 查询
   10     messages=[{"role": "user", "content": "Hello!"}],
   11     max_tokens=100
   12 )
   13 print(response.choices[0].message.content)



  curl 示例：


   1 curl -X POST https://your-worker-url.workers.dev/v1/chat/completions \
   2   -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
   3   -H "Content-Type: application/json" \
   4   -d '{
   5     "model": "x-ai/grok-4-fast",
   6     "messages": [{"role": "user", "content": "Hello!"}],
   7     "max_tokens": 100
   8   }'



  启用 Reasoning
  在 model 后添加 |reasoning 启用（e.g., "x-ai/grok-4-fast|reasoning"）。支持模型生成思考步骤，不支持的正常响应。


  Python 示例：


   1 response = client.chat.completions.create(
   2     model="x-ai/grok-4-fast|reasoning",  # 启用 reasoning
   3     messages=[{"role": "user", "content": "用步骤计算 15% 的 200 是多少？"}],
   4     max_tokens=200
   5 )
   6 print(response.choices[0].message.content)  # 预期：包含步骤，如 "步骤1: 15% = 0.15；步骤2: 0.15 * 200 = 
     30"



  curl 示例：


   1 curl -X POST https://your-worker-url.workers.dev/v1/chat/completions \
   2   -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
   3   -H "Content-Type: application/json" \
   4   -d '{
   5     "model": "x-ai/grok-4-fast|reasoning",
   6     "messages": [{"role": "user", "content": "用步骤计算 15% 的 200 是多少？"}],
   7     "max_tokens": 200
   8   }'



   - 支持模型示例：
     - Grok: "x-ai/grok-4-fast|reasoning"（<thinking> 标签）。
     - Gemini: "google/gemini-2.5-flash|reasoning"（多步推理）。
     - DeepSeek: "deepseek/deepseek-chat-v3.1|reasoning"（链式思考）。
   - 查询模型：


   1   curl -X GET https://your-worker-url.workers.dev/v1/models \
   2     -H "Authorization: Bearer YOUR_CLIENT_TOKEN"

     - 搜索 "grok" 或 "gemini" 确认 ID。


  注意事项
   - 积分限额：OpenRouter 免费账户限额低（Grok 免费版每日 ~100 requests）。充值（最低 $5）解锁完整额度，避免 402/429
     错误。
   - 健康检查：面板显示密钥状态，失败时 fallback。充值后重试。
   - Token 消耗：reasoning 增加 ~20-50% 输出长度，调整 max_tokens。
   - Stream：添加 "stream": true，支持实时输出（reasoning 逐步显示）。
   - 错误：402（积分不足）/429（限流）常见，充值或等待恢复。日志在 Cloudflare 仪表盘查看（搜索 "启用 reasoning"）。


  部署维护
   - 依赖：Node.js, Wrangler CLI。
   - 自定义域名：Cloudflare 仪表盘绑定（e.g., openrouter.your-domain.com）。
   - 日志：Cloudflare > Workers > cloudrouter > Logs，监控请求/错误。
   - 更新：修改 src/index.js 后，运行 npx wrangler deploy。


  贡献与许可证
   - 欢迎 PR 和 issue 到 GitHub 仓库。
   - 许可证：MIT License。