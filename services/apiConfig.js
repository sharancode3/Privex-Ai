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
  provider: 'privexai_provider',
  modelOverride: 'privexai_model_override'
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
 * Get provider preference (if any)
 * @returns {string} Provider name or empty string
 */
export function getProviderPreference() {
  try {
    return localStorage.getItem(STORAGE_KEYS.provider)?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Set provider preference
 * @param {string} provider - Provider name
 */
export function setProviderPreference(provider) {
  if (!provider || typeof provider !== 'string') return;
  try {
    localStorage.setItem(STORAGE_KEYS.provider, provider.trim());
  } catch (e) {
    console.error('Failed to save provider preference:', e.message);
  }
}

/**
 * Detect provider from API key format
 * @param {string} apiKey - API key
 * @returns {string} Provider name
 */
export function detectProvider(apiKey) {
  if (!apiKey) return 'openai';
  
  const key = String(apiKey).toLowerCase();
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('aiza')) return 'gemini';
  if (key.startsWith('xai-')) return 'xai';
  if (key.startsWith('hf_')) return 'huggingface';
  
  return 'openai'; // default
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
    preference: getProviderPreference(),
    config: window.PRIVEX_CONFIG || {}
  };
}

/**
 * Export all API config functions for consistent access
 */
export const ApiConfig = {
  setApiKey,
  getApiKey,
  isApiKeyPresent,
  clearApiKey,
  getProviderPreference,
  setProviderPreference,
  detectProvider,
  getConfig
};

export default ApiConfig;
