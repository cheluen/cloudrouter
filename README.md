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

### 方式二：从自己的GitHub仓库部署

1. Fork这个仓库到您的GitHub账户
2. 在您的Cloudflare账户中创建一个API令牌（在“我的个人资料 > API令牌”中创建）
3. 在您的GitHub仓库中添加一个名为`CLOUDFLARE_API_TOKEN`的密钥，值为您创建的API令牌
4. 推送代码到main分支，或手动触发GitHub Actions工作流

### 方式三：手动部署

1. 登录到 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 点击 "创建应用程序"
4. 选择 "创建Worker"
5. 在编辑器中，删除默认代码，粘贴 `index.js` 中的全部代码
6. 点击 "保存并部署"

#### 手动配置KV存储

1. 在Worker详情页面，点击 "设置" 选项卡
2. 找到 "变量" 部分，点击 "KV命名空间绑定"
3. 点击 "添加绑定"
4. 变量名设置为 `API_KEYS`
5. 选择一个已有的KV命名空间，或创建一个新的
6. 点击 "保存"

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
    model: 'anthropic/claude-3-opus-20240229', // 可选，默认使用claude-3-opus
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

## 自定义

您可以根据需要修改以下配置：

1. 默认模型：修改 `DEFAULT_MODEL` 常量
2. OpenRouter API URL：修改 `OPENROUTER_API_URL` 常量
3. 错误消息：修改 `ERROR_MESSAGES` 对象

## 限制

1. Cloudflare Workers免费计划有每天100,000请求的限制
2. KV存储在免费计划中有读写操作的限制
3. 单个Worker请求的超时时间为30秒
