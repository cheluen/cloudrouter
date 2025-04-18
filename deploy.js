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

  // 设置预设值
  log('检查是否需要设置预设值...', colors.yellow);

  // 询问用户是否要设置预设值
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (query) => new Promise(resolve => readline.question(query, resolve));

  try {
    const setPresetValues = await askQuestion('是否要设置预设值？这将在部署时自动初始化访问令牌和API密钥。(y/n): ');

    if (setPresetValues.toLowerCase() === 'y') {
      // 设置访问令牌
      const accessToken = await askQuestion('请设置访问令牌（至少8个字符）: ');
      if (accessToken.length < 8) {
        log('访问令牌至少需要8个字符', colors.red);
        readline.close();
        process.exit(1);
      }

      // 设置管理密码
      const adminPassword = await askQuestion('请设置管理密码: ');
      if (!adminPassword) {
        log('管理密码不能为空', colors.red);
        readline.close();
        process.exit(1);
      }

      // 设置API密钥
      const apiKeys = await askQuestion('请输入OpenRouter API密钥，多个密钥用逗号分隔: ');
      if (!apiKeys) {
        log('至少需要输入一个API密钥', colors.red);
        readline.close();
        process.exit(1);
      }

      // 更新wrangler.toml中的预设值
      wranglerConfig = wranglerConfig.replace(/PRESET_ACCESS_TOKEN = "[^"]*"/, `PRESET_ACCESS_TOKEN = "${accessToken}"`);
      wranglerConfig = wranglerConfig.replace(/PRESET_ADMIN_PASSWORD = "[^"]*"/, `PRESET_ADMIN_PASSWORD = "${adminPassword}"`);
      wranglerConfig = wranglerConfig.replace(/PRESET_API_KEYS = "[^"]*"/, `PRESET_API_KEYS = "${apiKeys}"`);

      fs.writeFileSync(wranglerPath, wranglerConfig);
      log('已更新wrangler.toml文件中的预设值', colors.green);
    }

    readline.close();
  } catch (error) {
    log(`设置预设值时出错: ${error.message}`, colors.red);
    if (readline) readline.close();
  }

  // 创建KV命名空间
  log('正在创建新的KV命名空间...', colors.yellow);

  // 尝试创建KV命名空间
  let createKvOutput = exec('wrangler kv:namespace create API_KEYS');

  // 如果创建失败，尝试列出现有的KV命名空间
  if (!createKvOutput) {
    log('尝试列出现有的KV命名空间...', colors.yellow);
    const listKvOutput = exec('wrangler kv:namespace list');

    if (listKvOutput) {
      // 尝试从列表中找到API_KEYS命名空间
      const kvMatch = listKvOutput.match(/API_KEYS[^\n]*id = "([^"]+)"/i);
      if (kvMatch) {
        const kvId = kvMatch[1];
        log(`找到现有的API_KEYS命名空间，ID: ${kvId}`, colors.green);

        // 更新wrangler.toml中的ID
        wranglerConfig = wranglerConfig.replace(/id = "[^"]*"/, `id = "${kvId}"`);
        fs.writeFileSync(wranglerPath, wranglerConfig);
        log('已更新wrangler.toml文件', colors.green);
        createKvOutput = `id = "${kvId}"`; // 设置为有效值，以便后续处理
      }
    }
  }

  if (!createKvOutput) {
    log('创建KV命名空间失败，将使用默认配置继续部署', colors.yellow);
  } else {
    // 从输出中提取KV命名空间ID
    const kvIdMatch = createKvOutput.match(/id = "([^"]+)"/);
    if (kvIdMatch) {
      const kvId = kvIdMatch[1];
      log(`成功创建KV命名空间，ID: ${kvId}`, colors.green);

      // 更新wrangler.toml中的ID
      wranglerConfig = wranglerConfig.replace(/id = "[^"]*"/, `id = "${kvId}"`);
      fs.writeFileSync(wranglerPath, wranglerConfig);
      log('已更新wrangler.toml文件', colors.green);
    } else {
      log('无法从输出中提取KV命名空间ID，将使用默认配置继续部署', colors.yellow);
    }
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
