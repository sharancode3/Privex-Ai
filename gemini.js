const OPENAI_CHAT_COMPLETIONS = 'https://api.openai.com/v1/chat/completions';
const XAI_CHAT_COMPLETIONS = 'https://api.x.ai/v1/chat/completions';
const GEMINI_CHAT_COMPLETIONS = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const ANTHROPIC_MESSAGES = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';

let currentAbortController = null;

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

function getProvider(apiKey, config = {}) {
  const model = String(config.model || '').toLowerCase();
  const provider = String(window?.PRIVEX_CONFIG?.provider || '').toLowerCase();
  const key = String(apiKey || '');

  if (provider === 'anthropic' || provider === 'claude') return 'anthropic';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'xai') return 'xai';
  if (model.startsWith('claude') || key.startsWith('sk-ant-')) return 'anthropic';
  if (model.startsWith('gemini') || key.startsWith('AIza')) return 'gemini';
  if (model.startsWith('grok') || key.startsWith('xai-')) return 'xai';
  return 'openai';
}

function toAnthropicBody(messages, systemPrompt = '', config = {}, stream = false) {
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
      content: [{ type: 'text', text }],
    });
  }

  return {
    model: config.model || DEFAULT_MODEL,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.9,
    stream,
    system: systemPrompt?.trim() || undefined,
    messages: normalized,
  };
}

function resolveEndpoint(apiKey, config = {}) {
  const provider = getProvider(apiKey, config);
  if (provider === 'anthropic' && window?.PRIVEX_CONFIG?.anthropicBaseUrl) {
    return `${window.PRIVEX_CONFIG.anthropicBaseUrl.replace(/\/$/, '')}/messages`;
  }
  if (window?.PRIVEX_CONFIG?.geminiBaseUrl) {
    return `${window.PRIVEX_CONFIG.geminiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  }
  if (window?.PRIVEX_CONFIG?.xaiBaseUrl) {
    return `${window.PRIVEX_CONFIG.xaiBaseUrl.replace(/\/$/, '')}/chat/completions`;
  }
  if (provider === 'anthropic') {
    return ANTHROPIC_MESSAGES;
  }
  if (provider === 'gemini') {
    return GEMINI_CHAT_COMPLETIONS;
  }
  if (provider === 'xai') {
    return XAI_CHAT_COMPLETIONS;
  }
  return OPENAI_CHAT_COMPLETIONS;
}

function mapErrorMessage(status, message) {
  if (!navigator.onLine) return 'You appear to be offline. An internet connection is needed to reach the AI provider.';
  if (status === 400) return 'Message could not be processed. Try rephrasing your request.';
  if (status === 401) return 'Invalid API key. Check your provider key configuration.';
  if (status === 403) return "API key doesn't have access to this model. Check provider model permissions.";
  if (status === 429) return `Rate limit reached. ${message || 'Please retry shortly.'}`;
  if (status >= 500) return 'Provider servers returned an error. Try again in a moment.';
  return message || 'Network error. Check your internet connection.';
}

export function stopStreaming() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

export async function testConnection(apiKey, model = DEFAULT_MODEL) {
  try {
    const provider = getProvider(apiKey, { model });
    const endpoint = resolveEndpoint(apiKey, { model });
    const body = provider === 'anthropic'
      ? toAnthropicBody([{ role: 'user', content: 'Reply with: ok' }], '', { model, maxTokens: 16, temperature: 0 }, false)
      : {
        model: model || DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Reply with: ok' }],
        max_tokens: 8,
        temperature: 0,
      };
    const headers = {
      'Content-Type': 'application/json',
    };
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, message: mapErrorMessage(res.status, json?.error?.message) };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, status: 0, message: mapErrorMessage(0, error.message) };
  }
}

export async function nonStreamingGenerate(apiKey, messages, systemPrompt, config = {}) {
  const provider = getProvider(apiKey, config);
  const body = provider === 'anthropic'
    ? toAnthropicBody(messages, systemPrompt, { ...config, maxTokens: config.maxTokens ?? 4096 }, false)
    : {
      model: config.model || DEFAULT_MODEL,
      messages: toOpenAIMessages(messages, systemPrompt),
      temperature: config.temperature ?? 0.9,
      max_tokens: config.maxTokens ?? 1024,
      stream: false,
    };

  const endpoint = resolveEndpoint(apiKey, config);
  const headers = {
    'Content-Type': 'application/json',
  };
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(mapErrorMessage(response.status, errorJson?.error?.message));
  }

  const json = await response.json();
  if (provider === 'anthropic') {
    return (json?.content || []).filter((part) => part?.type === 'text').map((part) => part?.text || '').join('');
  }
  return json?.choices?.[0]?.message?.content || '';
}

export async function streamMessage(apiKey, messages, systemPrompt, config, onChunk, onDone, onError) {
  stopStreaming();
  currentAbortController = new AbortController();

  const provider = getProvider(apiKey, config);
  const body = provider === 'anthropic'
    ? toAnthropicBody(messages, systemPrompt, config, true)
    : {
      model: config.model || DEFAULT_MODEL,
      messages: toOpenAIMessages(messages, systemPrompt),
      temperature: config.temperature ?? 0.9,
      max_tokens: config.maxTokens ?? 8192,
      stream: true,
    };

  try {
    const endpoint = resolveEndpoint(apiKey, config);
    const headers = {
      'Content-Type': 'application/json',
    };
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: currentAbortController.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      onError(response.status, mapErrorMessage(response.status, err?.error?.message));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          let text = '';
          if (provider === 'anthropic') {
            if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta') {
              text = parsed?.delta?.text || '';
            }
          } else {
            text = parsed?.choices?.[0]?.delta?.content || '';
          }
          if (text) {
            fullText += text;
            onChunk(text, fullText);
          }
        } catch {
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone(null, { aborted: true });
      return;
    }
    onError(0, mapErrorMessage(0, err.message));
  } finally {
    currentAbortController = null;
  }
}
