/**
 * 部署脚本
 * 用于自动创建KV命名空间并部署到Cloudflare Workers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// 打印带颜色的消息
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// 执行命令并返回输出
function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch (error) {
    log(`执行命令失败: ${command}`, colors.red);
    log(error.message, colors.red);
    return null;
  }
}

// 主函数
async function main() {
  log('开始部署OpenRouter API密钥管理器...', colors.cyan);

  // 检查wrangler是否安装
  try {
    exec('wrangler --version');
  } catch (error) {
    log('未找到wrangler，请先安装: npm install -g wrangler', colors.red);
    process.exit(1);
  }

  // 读取wrangler.toml
  const wranglerPath = path.join(__dirname, 'wrangler.toml');
  let wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');

  // 检查是否已经有KV命名空间ID
  const hasKvId = wranglerConfig.includes('id = "') && !wranglerConfig.includes('# id = "');

  if (!hasKvId) {
    log('未找到KV命名空间ID，将创建新的KV命名空间...', colors.yellow);

    // 创建KV命名空间
    const createKvOutput = exec('wrangler kv:namespace create API_KEYS');
    
    if (!createKvOutput) {
      log('创建KV命名空间失败，请检查您的Cloudflare账户权限', colors.red);
      process.exit(1);
    }

    // 从输出中提取KV命名空间ID
    const kvIdMatch = createKvOutput.match(/id = "([^"]+)"/);
    if (!kvIdMatch) {
      log('无法从输出中提取KV命名空间ID', colors.red);
      process.exit(1);
    }

    const kvId = kvIdMatch[1];
    log(`成功创建KV命名空间，ID: ${kvId}`, colors.green);

    // 更新wrangler.toml
    wranglerConfig = wranglerConfig.replace('# id = "your-kv-namespace-id"', `id = "${kvId}"`);
    fs.writeFileSync(wranglerPath, wranglerConfig);
    log('已更新wrangler.toml文件', colors.green);
  } else {
    log('已找到KV命名空间ID，将使用现有的KV命名空间', colors.green);
  }

  // 部署到Cloudflare Workers
  log('正在部署到Cloudflare Workers...', colors.cyan);
  const deployOutput = exec('wrangler deploy');
  
  if (!deployOutput) {
    log('部署失败，请检查错误信息', colors.red);
    process.exit(1);
  }

  log('部署成功！', colors.green);
  
  // 提取部署URL
  const urlMatch = deployOutput.match(/https:\/\/[^"\s]+\.workers\.dev/);
  if (urlMatch) {
    const deployUrl = urlMatch[0];
    log(`您的应用已部署到: ${deployUrl}`, colors.green);
    log(`管理页面: ${deployUrl}/admin`, colors.green);
  } else {
    log('部署成功，但无法提取部署URL', colors.yellow);
  }
}

// 执行主函数
main().catch(error => {
  log(`发生错误: ${error.message}`, colors.red);
  process.exit(1);
});
