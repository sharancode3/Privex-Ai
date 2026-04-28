/**
 * API Client Service
 * 
 * Centralized API request handler supporting multiple providers:
 * - OpenAI, Anthropic, Gemini, XAI, HuggingFace
 * - Streaming and non-streaming responses
 * - Graceful error handling
 * - No crashes, safe fallbacks
 */

import { getApiKey, detectProvider } from './apiConfig.js';

const ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions'
};

const DEFAULT_MODEL = 'gpt-4o-mini';

let currentAbortController = null;

/**
 * Map API error status codes to user-friendly messages
 */
function mapErrorMessage(status, message) {
  if (!navigator.onLine) {
    return 'Offline: Internet connection needed to reach AI provider.';
  }
  if (status === 400) {
    return 'Bad request: Your message could not be processed. Try rephrasing.';
  }
  if (status === 401) {
    return 'Invalid API key: Check your provider key configuration.';
  }
  if (status === 403) {
    return 'Forbidden: API key does not have access to this model.';
  }
  if (status === 429) {
    return `Rate limited: Please wait before requesting again. ${message || ''}`;
  }
  if (status >= 500) {
    return 'Server error: AI provider is experiencing issues. Retry shortly.';
  }
  return message || 'Network error: Check your connection and API key.';
}

/**
 * Normalize messages to OpenAI format
 */
function toOpenAIMessages(messages, systemPrompt = '') {
  const normalized = [];
  
  if (systemPrompt?.trim()) {
    normalized.push({ role: 'system', content: systemPrompt.trim() });
  }
  
  for (const msg of messages || []) {
    const role = msg.role === 'model' ? 'assistant' : (msg.role || 'user');
    const text = Array.isArray(msg.parts)
      ? msg.parts.map((p) => p?.text || '').join('')
      : (msg.content || '');
    normalized.push({ role, content: text });
  }
  
  return normalized;
}

/**
 * Convert messages to Anthropic format
 */
function toAnthropicMessages(messages, systemPrompt = '') {
  const normalized = [];
  
  for (const msg of messages || []) {
    const role = msg.role === 'model' ? 'assistant' : (msg.role || 'user');
    if (role !== 'user' && role !== 'assistant') continue;
    
    const text = Array.isArray(msg.parts)
      ? msg.parts.map((p) => p?.text || '').join('')
      : (msg.content || '');
    
    if (!text) continue;
    
    normalized.push({
      role,
      content: [{ type: 'text', text }]
    });
  }
  
  return normalized;
}

/**
 * Resolve API endpoint based on provider
 */
function resolveEndpoint(provider, baseConfig = {}) {
  const config = window.PRIVEX_CONFIG || {};
  
  // Check for custom base URLs first
  if (provider === 'anthropic' && config.anthropicBaseUrl) {
    return `${config.anthropicBaseUrl.replace(/\/$/, '')}/messages`;
  }
  if (provider === 'huggingface' && (config.huggingFaceBaseUrl || config.huggingfaceBaseUrl)) {
    const base = config.huggingFaceBaseUrl || config.huggingfaceBaseUrl;
    return `${base.replace(/\/$/, '')}/chat/completions`;
  }
  if (provider === 'gemini' && config.geminiBaseUrl) {
    return `${config.geminiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  }
  if (provider === 'xai' && config.xaiBaseUrl) {
    return `${config.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  }
  
  // Use default endpoints
  return ENDPOINTS[provider] || ENDPOINTS.openai;
}

/**
 * Get authorization headers for provider
 */
function getHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  return headers;
}

/**
 * Build request body for streaming
 */
function buildStreamBody(messages, systemPrompt, config, provider) {
  if (provider === 'anthropic') {
    return {
      model: config.model || DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.9,
      stream: true,
      system: systemPrompt?.trim() || undefined,
      messages: toAnthropicMessages(messages, '')
    };
  }
  
  return {
    model: config.model || DEFAULT_MODEL,
    messages: toOpenAIMessages(messages, systemPrompt),
    temperature: config.temperature ?? 0.9,
    max_tokens: config.maxTokens ?? 8192,
    stream: true
  };
}

/**
 * Build request body for non-streaming
 */
function buildNonStreamBody(messages, systemPrompt, config, provider) {
  if (provider === 'anthropic') {
    return {
      model: config.model || DEFAULT_MODEL,
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.9,
      stream: false,
      system: systemPrompt?.trim() || undefined,
      messages: toAnthropicMessages(messages, '')
    };
  }
  
  return {
    model: config.model || DEFAULT_MODEL,
    messages: toOpenAIMessages(messages, systemPrompt),
    temperature: config.temperature ?? 0.9,
    max_tokens: config.maxTokens ?? 1024,
    stream: false
  };
}

/**
 * Stop any ongoing stream
 */
export function stopStreaming() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/**
 * Test connection to API provider
 */
export async function testConnection(apiKey, model = DEFAULT_MODEL) {
  if (!apiKey?.trim()) {
    return {
      ok: false,
      status: 401,
      message: 'No API key provided'
    };
  }
  
  try {
    const provider = detectProvider(apiKey);
    const endpoint = resolveEndpoint(provider, { model });
    const body = provider === 'anthropic'
      ? {
          model,
          max_tokens: 16,
          temperature: 0,
          stream: false,
          system: 'Reply with: ok',
          messages: [{ role: 'user', content: 'Reply with: ok' }]
        }
      : {
          model,
          messages: [{ role: 'user', content: 'Reply with: ok' }],
          max_tokens: 8,
          temperature: 0
        };
    
    const headers = getHeaders(provider, apiKey);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        status: response.status,
        message: mapErrorMessage(response.status, errorData?.error?.message)
      };
    }
    
    return {
      ok: true,
      status: 200,
      message: 'Connection successful'
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: mapErrorMessage(0, error.message)
    };
  }
}

/**
 * Send non-streaming request
 */
export async function sendRequest(messages, systemPrompt, config = {}, onError) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    const err = {
      ok: false,
      status: 401,
      message: 'No API key present. Configure one before sending requests.'
    };
    if (onError) onError(err.status, err.message);
    return err;
  }
  
  try {
    const provider = detectProvider(apiKey);
    const endpoint = resolveEndpoint(provider, config);
    const body = buildNonStreamBody(messages, systemPrompt, config, provider);
    const headers = getHeaders(provider, apiKey);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = {
        ok: false,
        status: response.status,
        message: mapErrorMessage(response.status, errorData?.error?.message)
      };
      if (onError) onError(error.status, error.message);
      return error;
    }
    
    const data = await response.json();
    
    // Extract response based on provider
    let content = '';
    if (provider === 'anthropic') {
      content = (data?.content || [])
        .filter((part) => part?.type === 'text')
        .map((part) => part?.text || '')
        .join('');
    } else {
      content = data?.choices?.[0]?.message?.content || '';
    }
    
    return {
      ok: true,
      status: 200,
      content,
      data
    };
  } catch (error) {
    const err = {
      ok: false,
      status: 0,
      message: mapErrorMessage(0, error.message)
    };
    if (onError) onError(err.status, err.message);
    return err;
  }
}

/**
 * Send streaming request
 */
export async function streamRequest(messages, systemPrompt, config = {}, onChunk, onDone, onError) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    const message = 'No API key present. Configure one before streaming.';
    if (onError) onError(401, message);
    return;
  }
  
  stopStreaming();
  currentAbortController = new AbortController();
  
  try {
    const provider = detectProvider(apiKey);
    const endpoint = resolveEndpoint(provider, config);
    const body = buildStreamBody(messages, systemPrompt, config, provider);
    const headers = getHeaders(provider, apiKey);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: currentAbortController.signal
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (onError) {
        onError(response.status, mapErrorMessage(response.status, errorData?.error?.message));
      }
      return;
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      buffer = lines[lines.length - 1];
      
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        
        if (!line || line === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;
        
        try {
          const json = JSON.parse(line.slice(6));
          
          if (provider === 'anthropic') {
            const delta = json?.delta?.text || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(delta);
            }
          } else {
            const deltaContent = json?.choices?.[0]?.delta?.content || '';
            if (deltaContent) {
              fullText += deltaContent;
              if (onChunk) onChunk(deltaContent);
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    
    if (onDone) onDone(fullText);
  } catch (error) {
    if (error.name === 'AbortError') {
      if (onDone) onDone('');
      return;
    }
    if (onError) {
      onError(0, mapErrorMessage(0, error.message));
    }
  }
}

/**
 * API Client namespace for organized access
 */
export const ApiClient = {
  testConnection,
  sendRequest,
  streamRequest,
  stopStreaming,
  detectProvider
};

export default ApiClient;
