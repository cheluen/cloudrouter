# OpenRouter API密钥管理器

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cheluen/cloudrouter)

这是一个部署在Cloudflare Workers上的OpenRouter API密钥管理器，它提供以下功能：

1. 存储多个OpenRouter API密钥
2. 提供一个与OpenAI兼容的API端点
3. 自动轮询使用API密钥，当一个密钥用尽额度时自动切换到下一个

## 部署方式

### 方式一：一键部署（推荐）

1. 点击上方的 "Deploy to Cloudflare Workers" 按钮
2. 登录您的Cloudflare账户
3. 按照提示完成部署流程

这种方式会自动配置所需的KV命名空间和环境变量。

#### 部署前准备

在使用一键部署前，您需要：

1. 拥有一个Cloudflare账户
2. 在Cloudflare中启用Workers服务
3. 确保您有权限创建Workers和KV命名空间

#### 自定义配置

如果您想在部署前自定义配置，可以：

1. 先Fork这个仓库到您的GitHub账户
2. 修改 `config.js` 文件中的配置项
3. 使用您自己的仓库URL替换部署按钮的链接

#### 部署常见问题

1. **KV命名空间创建失败**：部署脚本会尝试创建KV命名空间，如果失败，将使用默认配置继续部署。您可以在部署后手动创建KV命名空间并更新Worker的绑定。

2. **按钮无响应**：如果部署后管理页面中的按钮无响应，请检查浏览器控制台是否有错误信息。如果有，可能是由于JavaScript代码出错或者浏览器兼容性问题导致的。

3. **部署失败**：如果部署失败，请检查是否有权限创建Workers和KV命名空间，以及是否超过了免费计划的限制。

### 方式二：从自己的GitHub仓库部署

1. Fork这个仓库到您的GitHub账户
2. 在您的Cloudflare账户中创建一个API令牌（在“我的个人资料 > API令牌”中创建）
3. 在您的GitHub仓库中添加一个名为`CLOUDFLARE_API_TOKEN`的密钥，值为您创建的API令牌
4. 推送代码到main分支，或手动触发GitHub Actions工作流

### 方式三：手动部署

1. 克隆或下载这个仓库
2. 如果需要，修改 `config.js` 文件中的配置
3. 安装依赖项：`npm install`
4. 安装Wrangler：`npm install -g wrangler`
5. 登录到Cloudflare：`wrangler login`
6. 运行部署脚本：`npm run deploy`

部署脚本会自动创建KV命名空间并部署应用。

#### 使用现有的KV命名空间

如果您已经有一个KV命名空间，可以在 `wrangler.toml` 文件中更新您的KV命名空间ID：

```toml
kv_namespaces = [
  { binding = "API_KEYS", id = "your-kv-namespace-id" }
]
```

注意：部署脚本会尝试创建新的KV命名空间，如果成功，将会替换上面的ID。如果您想保留现有的KV命名空间，请使用 `npm run deploy:direct` 命令直接部署。

## 使用方法

### 首次设置

1. 访问您的Worker URL（例如：`https://your-worker.your-username.workers.dev/`）
2. 点击首页上的管理页面链接（`/admin`）
3. 设置访问令牌（至少8个字符）来保护您的管理页面
4. 保存后，您将被重定向到带有访问令牌的管理页面

### 添加API密钥

1. 使用访问令牌访问管理页面（例如：`https://your-worker.your-username.workers.dev/admin?access_token=您的访问令牌`）
2. 在密钥管理标签页中，输入您的OpenRouter API密钥，每行一个
3. 设置一个管理密码（用于保护您的API密钥）
4. 点击 "保存密钥"

### 使用API

您可以像使用OpenAI API一样使用此服务：

```javascript
const response = await fetch('https://your-worker.your-username.workers.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-custom-key' // 这里可以使用任何值，因为验证是在OpenRouter端进行的
  },
  body: JSON.stringify({
    model: 'deepseek/deepseek-chat-v3-0324:free', // 可选，默认使用deepseek-chat-v3
    messages: [
      { role: 'user', content: '你好，请介绍一下自己' }
    ]
  })
});

const data = await response.json();
console.log(data);
```

### 获取可用模型

```javascript
const response = await fetch('https://your-worker.your-username.workers.dev/v1/models', {
  headers: {
    'Authorization': 'Bearer your-custom-key'
  }
});

const models = await response.json();
console.log(models);
```

## 安全特性

1. **访问令牌保护**：管理页面受访问令牌保护，防止未授权访问
2. **管理密码**：需要管理密码才能修改API密钥或查看统计数据
3. **密钥隐藏**：在统计页面中只显示密钥的部分内容，保护完整密钥

## 注意事项

1. 此服务使用Cloudflare Workers的KV存储来保存API密钥，免费计划有一定的限制
2. 当一个API密钥的配额用尽时，服务会自动切换到下一个可用的密钥
3. 如果所有密钥都用尽配额，服务将返回429错误
4. 为了安全起见，请设置一个强密码和复杂的访问令牌

## 自定义配置

所有配置项都集中在 `config.js` 文件中，您可以根据需要修改以下配置：

1. 默认模型：修改 `DEFAULT_MODEL` 属性
2. OpenRouter API URL：修改 `OPENROUTER_API_URL` 属性
3. 错误消息：修改 `ERROR_MESSAGES` 对象
4. 界面配置：修改 `UI` 对象

修改配置后，重新部署应用即可生效。

## 限制

1. Cloudflare Workers免费计划有每天100,000请求的限制
2. KV存储在免费计划中有读写操作的限制
3. 单个Worker请求的超时时间为30秒

## 常见问题解答

### 1. 管理页面按钮无响应

如果您发现管理页面中的按钮点击后没有响应，请尝试以下解决方法：

1. 打开浏览器的开发者工具（F12），查看控制台是否有错误信息
2. 尝试清除浏览器缓存并刷新页面
3. 尝试使用不同的浏览器访问管理页面
4. 如果问题仍然存在，请重新部署应用

### 2. KV命名空间创建失败

如果在部署过程中出现KV命名空间创建失败的错误，您可以：

1. 在Cloudflare Workers控制台中手动创建KV命名空间
2. 将创建的KV命名空间绑定到您的Worker，变量名为`API_KEYS`
3. 重新部署您的Worker

### 3. 如何备份我的API密钥和设置

您可以通过管理页面的统计标签页查看当前存储的API密钥。建议您在其他地方安全地保存这些密钥的副本。

如果您需要迁移到新的部署，可以：

1. 在原部署的管理页面中获取您的API密钥
2. 部署新的实例
3. 在新实例的管理页面中输入这些API密钥

### 4. 如何更改默认模型

默认模型配置在`config.js`文件中。要更改默认模型，请修改`DEFAULT_MODEL`属性，然后重新部署应用。

当前默认模型是`deepseek/deepseek-chat-v3-0324:free`。
