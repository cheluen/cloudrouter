/**
 * OpenRouter API密钥管理器配置文件
 * 在此文件中修改配置，无需修改主代码
 */

// API配置
const CONFIG = {
  // OpenRouter API URL
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1',
  
  // 默认模型
  DEFAULT_MODEL: 'deepseek/deepseek-chat-v3-0324:free',
  
  // 安全配置
  ACCESS_TOKEN_PARAM: 'access_token', // URL参数名称，用于访问管理页面
  
  // 错误消息
  ERROR_MESSAGES: {
    NO_API_KEYS: '没有可用的API密钥',
    QUOTA_EXCEEDED: '配额已用尽',
    INVALID_REQUEST: '无效的请求',
    INTERNAL_ERROR: '内部服务器错误'
  },
  
  // 界面配置
  UI: {
    TITLE: 'OpenRouter API密钥管理器',
    DESCRIPTION: '存储多个OpenRouter API密钥，提供OpenAI兼容的API端点，自动轮询使用API密钥'
  }
};

export default CONFIG;
