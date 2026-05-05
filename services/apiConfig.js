/**
 * API Configuration Service
 * 
 * Centralized API key management for client-side operation.
 * - Stores API keys in localStorage (user-specific, persistent)
 * - Reads from window.PRIVEX_CONFIG if available (config.js)
 * - No hardcoded keys, no forced input
 * - Graceful failures if key is missing
 */

const STORAGE_KEYS = {
  apiKey: 'privexai_api_key',
  provider: 'privexai_provider_pref',
  customModel: 'privexai_custom_model'
};

/**
 * Set API key in localStorage
 * @param {string} key - API key
 */
export function setApiKey(key) {
  if (!key || typeof key !== 'string') return;
  try {
    localStorage.setItem(STORAGE_KEYS.apiKey, key.trim());
  } catch (e) {
    console.error('Failed to save API key:', e.message);
  }
}

/**
 * Get API key from config.js or localStorage
 * @returns {string} API key or empty string
 */
export function getApiKey() {
  // Priority: config.js > localStorage
  const configured = window.PRIVEX_CONFIG?.openaiApiKey
    || window.PRIVEX_CONFIG?.geminiApiKey
    || window.PRIVEX_CONFIG?.anthropicApiKey
    || window.PRIVEX_CONFIG?.xaiApiKey
    || window.PRIVEX_CONFIG?.huggingFaceApiKey
    || window.PRIVEX_CONFIG?.huggingfaceApiKey;
  
  if (configured?.trim()) return configured.trim();
  
  try {
    return localStorage.getItem(STORAGE_KEYS.apiKey)?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Check if API key is present
 * @returns {boolean}
 */
export function isApiKeyPresent() {
  return !!getApiKey();
}

/**
 * Check if API key is available
 * @returns {boolean}
 */
export function isApiKeyAvailable() {
  return isApiKeyPresent();
}

/**
 * Clear API key from storage
 */
export function clearApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
  } catch (e) {
    console.error('Failed to clear API key:', e.message);
  }
}

/**
 * Get user's provider preference (if set explicitly)
 * @returns {string} Provider name or empty string
 */
export function getUserProviderPreference() {
  try {
    return localStorage.getItem(STORAGE_KEYS.provider)?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Get user's custom model (if set)
 * @returns {string} Custom model name or empty string
 */
export function getCustomModel() {
  try {
    return localStorage.getItem(STORAGE_KEYS.customModel)?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Detect provider from API key format (best effort)
 * @param {string} apiKey - API key
 * @returns {string} Provider name (defaults to 'openai' if unknown)
 */
export function detectProvider(apiKey) {
  if (!apiKey) return 'openai';
  
  const key = String(apiKey).trim();
  
  // Anthropic
  if (key.startsWith('sk-ant-')) return 'anthropic';
  
  // OpenAI (sk- followed by letters/numbers, usually 48+ chars)
  if (key.startsWith('sk-') && key.length > 40 && !key.startsWith('sk-proj-')) return 'openai';
  
  // OpenAI Project (sk-proj-)
  if (key.startsWith('sk-proj-')) return 'openai';
  
  // Groq (gsk_)
  if (key.startsWith('gsk_')) return 'groq';
  
  // Google Gemini (AIza)
  if (key.startsWith('AIza')) return 'gemini';
  
  // xAI Grok (xai-)
  if (key.startsWith('xai-')) return 'xai';
  
  // OpenRouter (or-)
  if (key.startsWith('or-')) return 'openrouter';
  
  // HuggingFace (hf_, hf.)
  if (key.startsWith('hf_') || key.startsWith('hf.')) return 'huggingface';
  
  // Perplexity (pplx-)
  if (key.startsWith('pplx-')) return 'perplexity';
  
  // Replicate (r8_)
  if (key.startsWith('r8_')) return 'replicate';
  
  // Together AI (68eb437a...)
  if (key.match(/^[a-f0-9]{32,}$/i)) return 'togetherai';
  
  // Default fallback
  return 'openai';
}

/**
 * Get all config info
 * @returns {object} Config object
 */
export function getConfig() {
  return {
    apiKey: getApiKey(),
    isPresent: isApiKeyPresent(),
    provider: detectProvider(getApiKey()),
    preference: getUserProviderPreference(),
    config: window.PRIVEX_CONFIG || {}
  };
}

/**
 * Provider configurations
 */
export const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    authHeader: (k) => `Bearer ${k}`
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    authHeader: (k) => k,
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'x-api-key': (k) => k
    }
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    authHeader: (k) => `Bearer ${k}`
  },
  gemini: {
    url: (k) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`,
    model: 'gemini-1.5-flash',
    authHeader: () => null
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-beta',
    authHeader: (k) => `Bearer ${k}`
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
    authHeader: (k) => `Bearer ${k}`
  },
  huggingface: {
    url: 'https://api-inference.huggingface.co/models/',
    model: 'meta-llama/Llama-2-7b-chat-hf',
    authHeader: (k) => `Bearer ${k}`
  },
  perplexity: {
    url: 'https://api.perplexity.ai/chat/completions',
    model: 'pplx-7b-online',
    authHeader: (k) => `Bearer ${k}`
  }
};

/**
 * Export all API config functions for consistent access
 */
export const ApiConfig = {
  setApiKey,
  getApiKey,
  isApiKeyPresent,
  isApiKeyAvailable,
  clearApiKey,
  getUserProviderPreference,
  getCustomModel,
  detectProvider,
  getConfig
};

export default ApiConfig;
