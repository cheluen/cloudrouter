# OpenRouter API密钥管理器

这是一个部署在 Cloudflare Workers 上的 OpenRouter API 密钥管理器，它提供以下功能：

1.  存储多个 OpenRouter API 密钥
2.  提供一个与 OpenAI 兼容的 API 端点
3.  自动轮询使用 API 密钥，当一个密钥用尽额度时自动切换到下一个

本项目可以帮助您管理多个 OpenRouter API 密钥，通过轮询机制最大化利用每个密钥的配额，同时提供统一的 API 接口，兼容 OpenAI 客户端。

## 部署方法

本项目支持两种部署方式：通过 Cloudflare Dashboard 网页部署或使用命令行工具部署。

### 方式一：使用 Cloudflare Dashboard 部署

推荐使用 Cloudflare 的 Git 集成功能进行部署：

1. **准备工作**
   * 将此仓库 Fork 到你的 GitHub/GitLab 账户
   * 登录到 [Cloudflare Dashboard](https://dash.cloudflare.com/)

2. **创建项目**
   * 导航到 Workers & Pages 部分
   * 点击 "Create application" -> "Connect Git"
   * 选择你 Fork 的仓库并授权
   * 按照向导完成项目创建
   * 点击 "Save and Deploy" 开始部署

### 方式二：使用命令行部署

如果你喜欢使用命令行工具，可以按照以下步骤操作：

1. **安装依赖**
   ```bash
   npm install
   ```

2. **使用部署脚本**
   ```bash
   npm run deploy
   ```
   或者直接使用 Wrangler：
   ```bash
   npm run deploy:direct
   ```

## 部署后配置

无论使用哪种部署方式，你都需要完成以下关键配置步骤，确保 Worker 正常运行。

### 必要配置：KV 命名空间绑定

1. **找到 KV 命名空间的绑定名称**
   * 在 Cloudflare Dashboard 中进入你的 Worker 项目
   * 点击 "Settings" -> "Variables"
   * 在 "KV Namespace Bindings" 部分找到自动创建的 KV 命名空间
   * 记下其绑定名称 (Binding Name)，可能是类似 `KV_NAMESPACE_BINDING` 的名称

2. **设置 KV_BINDING_NAME Secret**
   * 在同一页面的 "Environment Variables & Secrets" 部分
   * 点击 "Add Secret"
   * 名称输入：`KV_BINDING_NAME`
   * 值输入：你在上一步找到的绑定名称
   * 点击 "Save" 保存

### 可选配置：预设值

为了简化初始设置，你可以添加以下 Secrets：

* `PRESET_ACCESS_TOKEN`: 初始访问令牌 (至少 8 字符)
* `PRESET_ADMIN_PASSWORD`: 初始管理密码
* `PRESET_API_KEYS`: 初始 API 密钥，多个密钥用英文逗号分隔 (e.g., `sk-abc,sk-def`)

如果设置了这些预设值，在首次访问 `/admin` 时会自动应用这些设置。

### 首次访问设置

如果没有设置预设值，需要手动进行初始设置：

1. 访问你的 Worker URL 的 `/admin` 路径
2. 按照页面提示设置访问令牌、管理密码和 API 密钥

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
