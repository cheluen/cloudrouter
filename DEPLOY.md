# CloudRouter 部署指南

本文档提供了详细的CloudRouter部署步骤，帮助您快速将CloudRouter部署到Cloudflare Workers或Pages。

## 在Cloudflare Workers上部署

### 方法一：一键部署（最简单）

1. 点击下面的按钮开始部署
   
   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yourusername/cloudrouter)

2. 登录您的Cloudflare账户

3. 配置部署参数：
   - **项目名称**：为您的Worker选择一个名称（例如`cloudrouter`）
   - **KV命名空间**：创建一个名为`ROUTER_KV`的KV命名空间
   - **环境变量**：添加`AUTH_KEY`变量，设置您的管理密钥

4. 点击"部署"按钮

5. 部署完成后，访问您的Worker URL（例如`https://cloudrouter.your-username.workers.dev`）

### 方法二：使用Wrangler CLI

1. 确保已安装[Node.js](https://nodejs.org/)（14或更高版本）

2. 安装Wrangler CLI
   ```bash
   npm install -g wrangler
   ```

3. 登录到您的Cloudflare账户
   ```bash
   wrangler login
   ```

4. 克隆CloudRouter仓库
   ```bash
   git clone https://github.com/yourusername/cloudrouter.git
   cd cloudrouter
   ```

5. 安装依赖
   ```bash
   npm install
   ```

6. 创建KV命名空间
   ```bash
   wrangler kv:namespace create "ROUTER_KV"
   ```

7. 编辑`wrangler.toml`文件，更新KV命名空间ID和AUTH_KEY
   ```toml
   [[kv_namespaces]]
   binding = "ROUTER_KV"
   id = "您的KV命名空间ID" # 替换为上一步创建的KV命名空间ID

   [vars]
   AUTH_KEY = "您的管理密钥" # 替换为您想要设置的管理密钥
   ```

8. 部署到Cloudflare Workers
   ```bash
   npm run deploy
   ```

## 在Cloudflare Pages上部署

您也可以将CloudRouter部署到Cloudflare Pages，并使用Pages Functions功能：

1. 创建一个新的Pages项目，并连接到您的GitHub仓库

2. 配置构建设置：
   - **框架预设**：None
   - **构建命令**：`npm run build`
   - **构建输出目录**：`dist`

3. 在环境变量中添加：
   - `AUTH_KEY`：您的管理密钥

4. 在Pages Functions设置中启用"Functions"

5. 创建一个KV命名空间，并绑定到您的Pages项目
   - 命名空间名称：`ROUTER_KV`
   - 变量名：`ROUTER_KV`

6. 部署项目

## 首次使用设置

1. 访问您部署的Worker或Pages URL（例如`https://cloudrouter.your-username.workers.dev`）

2. 使用您设置的管理密钥登录管理面板

3. 在"API密钥管理"标签页中添加您的OpenRouter API密钥
   - 可以添加多个API密钥，系统会自动轮询使用

4. 在您的AI客户端中更改API端点为您的Worker URL

## 故障排除

如果您在部署或使用CloudRouter时遇到问题，请尝试以下步骤：

1. 确保您已正确设置所有环境变量和KV命名空间

2. 检查Cloudflare Workers/Pages的日志，了解可能的错误原因

3. 确认您的OpenRouter API密钥是有效的

4. 如果添加API密钥后无法使用，请尝试刷新页面并重新检查密钥状态

5. 如果问题仍然存在，请在GitHub仓库中创建一个Issue