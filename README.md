# OpenRouter API密钥管理器

这是一个部署在 Cloudflare Workers 上的 OpenRouter API 密钥管理器，它提供以下功能：

1.  存储多个 OpenRouter API 密钥
2.  提供一个与 OpenAI 兼容的 API 端点
3.  自动轮询使用 API 密钥，当一个密钥用尽额度时自动切换到下一个

本项目可以帮助您管理多个 OpenRouter API 密钥，通过轮询机制最大化利用每个密钥的配额，同时提供统一的 API 接口，兼容 OpenAI 客户端。

## 部署方法

本项目支持两种部署方式：通过 Cloudflare Dashboard 网页部署或使用命令行工具部署。

### 方式一：使用 Cloudflare Dashboard 部署

推荐使用 Cloudflare 的 Git 集成功能进行部署，以下是详细步骤：

1. **准备工作**
   * 将此仓库 Fork 到你的 GitHub/GitLab 账户
   * 登录到 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   * 确保你的 Cloudflare 账户已激活 Workers 服务

2. **创建项目**
   * 在 Cloudflare Dashboard 左侧菜单中，点击 "Workers & Pages"
   * 点击页面上的 "Create application" 按钮
   * 选择 "Connect Git" 选项卡
   * 选择 GitHub 或 GitLab 作为你的 Git 提供商
   * 如果尚未连接，点击 "Connect GitHub/GitLab" 并按照提示授权 Cloudflare 访问你的仓库
   * 在仓库列表中找到并选择你 Fork 的 OpenRouter API密钥管理器仓库
   * 选择 "main" 分支（或你的主分支名称）

3. **配置部署设置**
   * 在 "Build settings" 部分，保持默认设置不变
   * 项目名称可以使用默认的 "openrouter-apikey-manager" 或自定义名称
   * 在 "Deployment settings" 部分，选择 "Production" 环境
   * 确保 "Workers" 选项已启用
   * 点击 "Save and Deploy" 按钮开始部署

4. **等待部署完成**
   * Cloudflare 将自动构建和部署你的项目
   * 部署成功后，你会看到一个绿色的成功提示和你的 Worker URL（通常格式为 `https://your-project-name.your-account.workers.dev`）
   * 记下这个 URL，你将用它来访问你的 API 密钥管理器

5. **配置 KV 命名空间绑定**
   * 部署完成后，点击你的项目名称进入项目详情页面
   * 在左侧菜单中选择 "Settings" -> "Variables"
   * 滚动到 "KV Namespace Bindings" 部分
   * 记下自动创建的 KV 命名空间的绑定名称（Binding Name），这个名称很重要
   * 在 "Environment Variables & Secrets" 部分，点击 "Add Secret"
   * 名称输入：`KV_BINDING_NAME`
   * 值输入：刚才记下的 KV 命名空间绑定名称
   * 点击 "Save" 保存这个 Secret

这个步骤非常重要，如果不正确配置 KV_BINDING_NAME Secret，Worker 将无法正常工作。

6. **可选配置：预设值**
   * 如果你希望预先设置访问令牌、管理密码和 API 密钥，可以添加以下 Secrets：
   * 在 "Environment Variables & Secrets" 部分，点击 "Add Secret"，添加以下可选 Secrets：
     - `PRESET_ACCESS_TOKEN`: 初始访问令牌（至少 8 个字符）
     - `PRESET_ADMIN_PASSWORD`: 初始管理密码
     - `PRESET_API_KEYS`: 初始 API 密钥，多个密钥用英文逗号分隔（例如：`sk-abc,sk-def`）
   * 每添加一个 Secret 后点击 "Save" 保存

7. **验证部署**
   * 访问你的 Worker URL（例如：`https://your-project-name.your-account.workers.dev`）
   * 如果你设置了预设访问令牌，访问 `/admin?access_token=你的访问令牌`
   * 如果没有设置预设值，访问 `/admin` 进行初始设置

8. **常见问题排查**
   * 如果遇到 "KV Namespace not configured correctly..." 错误：
     - 确认你已正确设置了 `KV_BINDING_NAME` Secret
     - 确认该 Secret 的值与 Cloudflare 自动创建的 KV 命名空间绑定名称完全一致
     - 在设置 Secret 后等待几分钟，然后刷新页面
   * 如果管理页面按钮无响应：
     - 打开浏览器开发者工具（F12）查看控制台是否有错误
     - 尝试清除浏览器缓存或使用无痕模式访问
   * 如果需要重新部署：
     - 在 Cloudflare Dashboard 中进入你的 Worker 项目
     - 点击 "Deployments" 选项卡
     - 点击 "Deploy" 按钮重新部署最新版本

### 方式二：使用命令行部署

如果你喜欢使用命令行工具，可以按照以下步骤操作：

1. **准备工作**
   * 将此仓库克隆到本地：
     ```bash
     git clone https://github.com/your-username/openrouter-apikey-manager.git
     cd openrouter-apikey-manager
     ```
   * 确保已安装 [Node.js](https://nodejs.org/) (推荐版本 16 或更高)
   * 确保已注册 [Cloudflare 账户](https://dash.cloudflare.com/sign-up)

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置 Cloudflare 身份验证**
   * 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 中创建 API 令牌：
     - 进入你的个人资料页面
     - 点击 "API Tokens" -> "Create Token"
     - 选择 "Edit Cloudflare Workers" 模板
     - 按照提示完成创建，并复制生成的令牌
   * 登录 Wrangler：
     ```bash
     npx wrangler login
     ```
     按照提示在浏览器中完成授权

4. **使用交互式部署脚本**
   ```bash
   npm run deploy
   ```
   这将运行 `deploy.js` 脚本，它会：
   * 自动创建 KV 命名空间
   * 询问你是否要设置预设值（访问令牌、管理密码和 API 密钥）
   * 更新 wrangler.toml 文件
   * 部署到 Cloudflare Workers

   或者直接使用 Wrangler（如果你已经手动配置了 KV 命名空间）：
   ```bash
   npm run deploy:direct
   ```

5. **部署后配置**
   * 脚本完成后，会显示你的 Worker URL
   * 记录这个 URL，你将用它来访问你的 API 密钥管理器
   * 如果你在部署脚本中设置了预设值，可以直接访问 `/admin?access_token=你的访问令牌`
   * 如果没有设置预设值，访问 `/admin` 进行初始设置

6. **常见问题排查**
   * 如果遇到权限问题：
     - 确保你已成功登录 Wrangler (`npx wrangler login`)
     - 确保你的 Cloudflare 账户已激活 Workers 服务
   * 如果 KV 命名空间创建失败：
     - 可以在 Cloudflare Dashboard 中手动创建 KV 命名空间
     - 然后在 wrangler.toml 文件中更新 KV 命名空间的 ID
   * 如果需要重新部署：
     - 直接运行 `npm run deploy` 或 `npm run deploy:direct`

## 初始设置

部署完成后，你需要进行初始设置才能开始使用服务。根据你的部署方式，这些设置可能已经完成或需要手动配置。

### 首次访问设置

根据你的部署方式，初始设置有两种情况：

#### 如果你设置了预设值

如果你在部署过程中设置了预设值（通过 Secrets 或部署脚本），系统已自动配置好了初始设置：

1. 访问你的 Worker URL 的 `/admin` 路径，并添加你的访问令牌参数：
   ```
   https://your-worker-url/admin?access_token=你设置的访问令牌
   ```
2. 系统将自动使用你的预设值初始化管理页面
3. 你可以直接开始使用管理页面管理你的 API 密钥

#### 如果没有设置预设值

如果你没有设置预设值，需要手动进行初始设置：

1. 访问你的 Worker URL 的 `/admin` 路径：
   ```
   https://your-worker-url/admin
   ```
2. 系统将显示“首次设置”页面
3. 设置一个访问令牌（至少 8 个字符）并点击“保存访问令牌”
4. 设置管理密码（用于保护敏感操作）
5. 添加你的 OpenRouter API 密钥（每行一个）
6. 点击“保存密钥”完成设置

## 使用方法

### 管理页面

管理页面位于 `/admin` 路径，需要使用访问令牌访问：

```
https://your-worker-url/admin?access_token=您的访问令牌
```

管理页面提供三个主要功能区：

1. **密钥管理**
   * 添加、删除或更新 OpenRouter API 密钥
   * 每行输入一个密钥
   * 需要输入管理密码才能保存更改

2. **使用统计**
   * 查看各个密钥的使用情况和错误计数
   * 需要输入管理密码才能查看

3. **设置**
   * 更改访问令牌
   * 需要输入当前管理密码才能更改

### 使用 API

将请求指向你的 Worker URL：

* **聊天完成**: `POST https://your-worker-url/v1/chat/completions`
* **模型列表**: `GET https://your-worker-url/v1/models`

**请求示例:**

```javascript
const workerUrl = 'https://your-worker-url'; // 替换为您的 Worker URL

// 获取模型列表
async function getModels() {
  const response = await fetch(`${workerUrl}/v1/models`, {
    headers: {
      'Authorization': 'Bearer your-custom-key' // Bearer token 可以是任意值
    }
  });
  const models = await response.json();
  console.log(models);
}

// 发送聊天请求
async function chat() {
  const response = await fetch(`${workerUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-custom-key' // Bearer token 可以是任意值
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat-v3-0324:free', // 可选，默认使用 config.js 中的 DEFAULT_MODEL
      messages: [
        { role: 'user', content: '你好，请介绍一下自己' }
      ]
    })
  });
  const data = await response.json();
  console.log(data);
}

getModels();
chat();
```

## 安全特性

1. **访问令牌保护**: 管理页面 (`/admin`) 受访问令牌保护。
2. **管理密码**: 修改 API 密钥、查看统计数据、更改访问令牌需要管理密码。
3. **密钥隐藏**: 在统计页面中只显示密钥的部分内容。

## 注意事项

1. Cloudflare Workers 和 KV 存储在免费计划中有使用限制。
2. 当一个 API 密钥配额用尽时，服务会自动切换到下一个。所有密钥都用尽时返回 429 错误。
3. 请务必设置强访问令牌和管理密码。
4. 建议定期备份您的 API 密钥。

## 自定义配置

可以在 `config.js` 文件中修改默认模型、错误消息和 UI 文本。修改后需要将更改推送到你的 Git 仓库，Cloudflare 会自动重新部署。

## 常见问题解答

### 1. Worker 返回 "KV Namespace not configured correctly..." 错误

* **最可能的原因**: 你没有正确设置 `KV_BINDING_NAME` Secret。
* **解决方法**:
  1. 去 Cloudflare Dashboard -> Workers & Pages -> 你的 Worker -> Settings -> Variables -> KV Namespace Bindings，找到**实际的绑定名称**。
  2. 去 Settings -> Variables -> Environment Variables & Secrets，添加或编辑名为 `KV_BINDING_NAME` 的 Secret，确保其值是你找到的**实际绑定名称**。
  3. 保存 Secret 后，可能需要几秒钟到一分钟生效。

### 2. 管理页面按钮无响应

* 打开浏览器开发者工具 (F12) 查看控制台是否有错误。
* 尝试清除浏览器缓存或使用无痕模式访问。
* 检查 `/admin` 页面的 URL 是否包含正确的 `access_token` 参数。

### 3. 如何备份/迁移设置？

* API 密钥和管理密码存储在 KV 中。最简单的方式是在新部署中通过 `/admin` 页面重新输入。
* 访问令牌也存储在 KV 中，但可以通过 `PRESET_ACCESS_TOKEN` Secret 在新部署中预设。

### 4. 如何更新 Worker？

* 如果你使用了 Git 集成，只需将最新的代码更改推送到你连接的 Git 仓库分支，Cloudflare 会自动部署更新。
* 如果你没有使用 Git 集成（例如，直接上传代码），则需要重新上传更新后的代码。
