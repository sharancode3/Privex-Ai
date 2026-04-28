import { Storage } from './storage.js';
import { renderMarkdown } from './markdown.js';
import { applyTheme, applyFontSize, applyWidth } from './themes.js';
import { ApiConfig } from './services/apiConfig.js';
import { ApiClient } from './services/apiClient.js';
import ChatEngine from './core/chatEngine.js';
import { ExportUtils } from './utils/export.js';

const LS = {
  apiKey: 'privexai_openai_key',
  model: 'privexai_model',
  activeConversationId: 'privexai_active_conv_id',
  apiValidated: 'privexai_api_validated',
  onboardingSeen: 'privexai_onboarding_seen',
  theme: 'privexai_theme',
  font: 'privexai_font_size',
  width: 'privexai_chat_width',
  showTimestamps: 'privexai_show_timestamps'
};

const MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'claude-3-5-haiku',
  'claude-3-5-sonnet',
  'claude-sonnet-4',
  'grok-2-latest',
  'grok-beta',
  'Qwen/Qwen2.5-72B-Instruct',
  'meta-llama/Meta-Llama-3.1-8B-Instruct'
];

const DEFAULTS = {
  model: 'gpt-4o-mini',
  theme: 'dark',
  font: 'md',
  width: 'normal'
};

const state = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  deferredInstallPrompt: null,
  sidebarOpen: false
};

const dom = {};

function $(id) {
  return document.getElementById(id);
}

function xorObfuscate(value) {
  // DEPRECATED: Use ApiConfig.setApiKey() instead
  const key = 'privex-ai-local';
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    out += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(out);
}

function xorDeobfuscate(value) {
  // DEPRECATED: Use ApiConfig.getApiKey() instead
  try {
    const decoded = atob(value);
    const key = 'privex-ai-local';
    let out = '';
    for (let i = 0; i < decoded.length; i += 1) {
      out += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
  } catch {
    return '';
  }
}

function getApiKey() {
  // Wrapper for ApiConfig
  return ApiConfig.getApiKey();
}

function setApiKey(raw) {
  // Wrapper for ApiConfig
  ApiConfig.setApiKey(raw);
}

function nowTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showStatus(text, type = '') {
  dom.apiStatus.textContent = text;
  dom.apiStatus.classList.remove('success', 'error');
  if (type) dom.apiStatus.classList.add(type);
}

function getSetting(key, fallback = '') {
  const raw = localStorage.getItem(key);
  return raw == null ? fallback : raw;
}

function boolSetting(key, fallback = false) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

function setLockedState() {
  // No longer check apiValidated - allow chats without API key
  // User just won't be able to send messages with error feedback
  const hasApiKey = ApiConfig.isApiKeyPresent();
  dom.messageInput.disabled = state.isStreaming;
  dom.sendBtn.disabled = state.isStreaming;
  
  if (state.isStreaming) {
    dom.chatLockState.textContent = 'Streaming response...';
  } else if (hasApiKey) {
    dom.chatLockState.textContent = 'Ready to chat privately';
  } else {
    dom.chatLockState.textContent = 'Set API key to start chatting';
  }
}

function autoResizeTextarea() {
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = `${Math.min(dom.messageInput.scrollHeight, 180)}px`;
}

function buildModelSelect(selectEl, preferredModel) {
  selectEl.innerHTML = MODELS.map((model) => `<option value="${model}">${model}</option>`).join('');
  selectEl.value = MODELS.includes(preferredModel) ? preferredModel : DEFAULTS.model;
}

function syncModelInputs(model) {
  buildModelSelect(dom.modelSelect, model);
  buildModelSelect(dom.panelModelSelect, model);
  dom.panelModelSelect.value = dom.modelSelect.value;
}

function markdownWithCodeCopy(text) {
  const html = renderMarkdown(text || '');
  const holder = document.createElement('div');
  holder.className = 'message-content';
  holder.innerHTML = html;

  holder.querySelectorAll('pre code').forEach((codeEl) => {
    const copy = document.createElement('button');
    copy.className = 'code-copy';
    copy.type = 'button';
    copy.dataset.code = encodeURIComponent(codeEl.textContent || '');
    copy.textContent = 'Copy code';
    codeEl.parentElement.insertAdjacentElement('afterend', copy);
  });

  return holder.innerHTML;
}

function renderMessages() {
  const showTimes = boolSetting(LS.showTimestamps, false);
  if (!state.messages.length) {
    dom.messages.innerHTML = '<div class="message-stack"><div class="empty-state"><h3>Privex AI Workspace</h3><p>Universal BYOK testing with local-only memory and zero server chat storage.</p><div class="empty-pill-row"><span class="empty-pill">Universal API key</span><span class="empty-pill">Streaming enabled</span><span class="empty-pill">Private local history</span></div></div></div>';
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'message-stack';

  state.messages.forEach((msg) => {
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${msg.role === 'user' ? 'user' : 'ai'}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const content = document.createElement('div');
    content.className = 'message-content';
    if (msg.role === 'model') {
      content.innerHTML = markdownWithCodeCopy(msg.content || '');
    } else {
      content.textContent = msg.content || '';
    }

    bubble.appendChild(content);

    if (showTimes) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = nowTime(msg.timestamp || Date.now());
      bubble.appendChild(meta);
    }

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-ghost';
    copyBtn.textContent = 'Copy';
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(msg.content || ''));
    actions.appendChild(copyBtn);

    if (msg.role === 'model') {
      const regenBtn = document.createElement('button');
      regenBtn.className = 'btn btn-ghost';
      regenBtn.textContent = 'Regenerate';
      regenBtn.type = 'button';
      regenBtn.addEventListener('click', () => regenerateFromMessage(msg.id));
      actions.appendChild(regenBtn);
    }

    bubble.appendChild(actions);
    wrapper.appendChild(bubble);
    stack.appendChild(wrapper);
  });

  dom.messages.innerHTML = '';
  dom.messages.appendChild(stack);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function renderConversationList() {
  dom.chatList.innerHTML = '';
  for (const conv of state.conversations) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `chat-item ${conv.id === state.activeConversationId ? 'active' : ''}`;
    item.innerHTML = `<strong>${conv.title || 'New Chat'}</strong><span>${conv.lastPreview || 'No messages yet'}</span>`;
    item.addEventListener('click', async () => {
      state.activeConversationId = conv.id;
      localStorage.setItem(LS.activeConversationId, conv.id);
      await loadMessages(conv.id);
      dom.activeTitle.textContent = conv.title || 'New Chat';
      renderConversationList();
      if (window.innerWidth <= 860) {
        dom.sidebar.classList.remove('open');
        state.sidebarOpen = false;
      }
    });
    dom.chatList.appendChild(item);
  }
}

async function loadMessages(conversationId) {
  state.messages = await Storage.getMessages(conversationId);
  renderMessages();
}

async function ensureConversation() {
  state.conversations = await Storage.getAllConversations();
  if (!state.conversations.length) {
    const created = await Storage.createConversation({ model: getSetting(LS.model, DEFAULTS.model) });
    state.conversations = [created];
  }

  const stored = getSetting(LS.activeConversationId);
  const exists = state.conversations.find((c) => c.id === stored);
  state.activeConversationId = exists ? exists.id : state.conversations[0].id;

  localStorage.setItem(LS.activeConversationId, state.activeConversationId);
  const active = state.conversations.find((c) => c.id === state.activeConversationId);
  dom.activeTitle.textContent = active?.title || 'New Chat';

  renderConversationList();
  await loadMessages(state.activeConversationId);
}

async function createNewChat() {
  const created = await Storage.createConversation({ model: getSetting(LS.model, DEFAULTS.model) });
  state.activeConversationId = created.id;
  localStorage.setItem(LS.activeConversationId, created.id);
  await ensureConversation();
}

// DEPRECATED: No longer used with ChatEngine
function activeSystemPrompt() {
  return 'You are Privex AI. Be concise for simple requests and detailed where needed.';
}

// DEPRECATED: No longer used with ChatEngine  
function toMessageArray(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content
  }));
}

async function sendMessage(text) {
  if (!text.trim() || state.isStreaming) return;
  
  // Check if API key is present BEFORE allowing send
  if (!ApiConfig.isApiKeyPresent()) {
    showStatus('⚠️ API key not configured. Open Settings to add your API key.', 'error');
    return;
  }

  state.isStreaming = true;
  setLockedState();

  const model = getSetting(LS.model, DEFAULTS.model);

  // Create user message immediately
  const userMessage = await Storage.addMessage(state.activeConversationId, {
    role: 'user',
    content: text.trim(),
    timestamp: Date.now()
  });

  // Create placeholder assistant message
  const assistantMessage = await Storage.addMessage(state.activeConversationId, {
    role: 'model',
    content: '',
    timestamp: Date.now()
  });

  state.messages.push(userMessage);
  state.messages.push(assistantMessage);
  renderMessages();

  let fullAssistantText = '';

  ChatEngine.sendMessage(
    state.activeConversationId,
    text.trim(),
    // onChunk
    (chunk) => {
      fullAssistantText += chunk;
      const target = state.messages.find((m) => m.id === assistantMessage.id);
      if (target) {
        target.content = fullAssistantText;
      }
      renderMessages();
    },
    // onDone
    async (msg) => {
      state.isStreaming = false;
      setLockedState();
      
      // Update assistant message with final content
      if (msg) {
        const target = state.messages.find((m) => m.id === msg.id);
        if (target) {
          target.content = msg.content || '';
        }
      }
      
      renderMessages();
      await ensureConversation();
    },
    // onError
    async (status, message) => {
      state.isStreaming = false;
      setLockedState();
      
      const target = state.messages.find((m) => m.id === assistantMessage.id);
      if (target) {
        target.content = `Error ${status || 0}: ${message || 'Request failed.'}`;
      }
      
      await Storage.updateMessage(assistantMessage.id, {
        content: target?.content || 'Error'
      });
      
      renderMessages();
      await ensureConversation();
    }
  );
}

async function regenerateFromMessage(aiMessageId) {
  if (state.isStreaming) return;
  
  const index = state.messages.findIndex((m) => m.id === aiMessageId);
  if (index < 0 || state.messages[index].role !== 'model') return;

  let userIndex = -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (state.messages[i].role === 'user') {
      userIndex = i;
      break;
    }
  }
  if (userIndex < 0) return;

  if (!ApiConfig.isApiKeyPresent()) {
    showStatus('⚠️ API key not configured. Open Settings to add your API key.', 'error');
    return;
  }

  const model = getSetting(LS.model, DEFAULTS.model);
  state.isStreaming = true;
  setLockedState();

  const target = state.messages[index];
  const userMessage = state.messages[userIndex];
  
  let fullText = '';
  
  ChatEngine.sendMessage(
    state.activeConversationId,
    userMessage.content,
    // onChunk
    (chunk) => {
      fullText += chunk;
      target.content = fullText;
      renderMessages();
    },
    // onDone
    async (msg) => {
      state.isStreaming = false;
      setLockedState();
      
      if (msg && msg.content) {
        target.content = msg.content;
        await Storage.updateMessage(target.id, {
          content: msg.content,
          timestamp: Date.now()
        });
      }
      
      renderMessages();
      await ensureConversation();
    },
    // onError
    async (status, message) => {
      state.isStreaming = false;
      setLockedState();
      target.content = `Regeneration failed: ${message}`;
      await Storage.updateMessage(target.id, { content: target.content });
      renderMessages();
    }
  );
}

async function runConnectionTest() {
  const key = dom.apiKeyInput.value.trim() || getApiKey();
  if (!key) {
    showStatus('Enter an API key first.', 'error');
    return;
  }

  const model = dom.modelSelect.value;

  localStorage.setItem(LS.model, model);
  setApiKey(key);

  showStatus('Testing connection...', '');
  dom.testConnectionBtn.disabled = true;

  const result = await ApiClient.testConnection(key, model);

  dom.testConnectionBtn.disabled = false;

  if (result.ok) {
    showStatus('Connection successful. Chat ready.', 'success');
    setLockedState();
    setTimeout(() => dom.apiModal.classList.add('hidden'), 500);
  } else {
    showStatus(result.message || 'Connection failed.', 'error');
    setLockedState();
  }
}

// DEPRECATED: Use ExportUtils instead
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportData() {
  // Build full conversation data with messages
  const conversations = await Storage.getAllConversations();
  const archivedConversations = await Storage.getArchivedConversations();
  const allConversations = [...conversations, ...archivedConversations];
  
  // Attach messages to each conversation
  for (const conv of allConversations) {
    conv.messages = await Storage.getMessages(conv.id);
  }
  
  ExportUtils.exportAllConversationsAsJSON(allConversations);
}

async function clearAllData() {
  const ok = window.confirm('Clear all local conversations and memories? This cannot be undone.');
  if (!ok) return;
  await Storage.clearEverything();
  await ensureConversation();
}

function applySavedAppearance() {
  const theme = getSetting(LS.theme, DEFAULTS.theme);
  const font = getSetting(LS.font, DEFAULTS.font);
  const width = getSetting(LS.width, DEFAULTS.width);

  applyTheme(theme);
  applyFontSize(font);
  applyWidth(width);

  dom.themeSelect.value = theme;
  dom.fontSelect.value = font;
  dom.widthSelect.value = width;
  dom.timestampsToggle.checked = boolSetting(LS.showTimestamps, false);
}

function bindAppearanceEvents() {
  dom.themeSelect.addEventListener('change', () => {
    localStorage.setItem(LS.theme, dom.themeSelect.value);
    applyTheme(dom.themeSelect.value);
  });

  dom.fontSelect.addEventListener('change', () => {
    localStorage.setItem(LS.font, dom.fontSelect.value);
    applyFontSize(dom.fontSelect.value);
  });

  dom.widthSelect.addEventListener('change', () => {
    localStorage.setItem(LS.width, dom.widthSelect.value);
    applyWidth(dom.widthSelect.value);
  });

  dom.timestampsToggle.addEventListener('change', () => {
    localStorage.setItem(LS.showTimestamps, String(dom.timestampsToggle.checked));
    renderMessages();
  });
}

function typeDemoBubble(role, text, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const bubble = document.createElement('div');
      bubble.className = `demo-bubble ${role}`;
      dom.demoStage.appendChild(bubble);

      let idx = 0;
      const timer = setInterval(() => {
        bubble.textContent = text.slice(0, idx);
        idx += 1;
        if (idx > text.length) {
          clearInterval(timer);
          resolve();
        }
      }, 26);
    }, delay);
  });
}

async function runOnboardingDemo() {
  dom.demoStage.innerHTML = '';
  await typeDemoBubble('ai', 'Enter your API key');
  await typeDemoBubble('user', 'Run key test', 420);
  await typeDemoBubble('ai', 'Start chatting privately', 420);
  const glow = document.createElement('div');
  glow.className = 'demo-bubble ai';
  glow.textContent = 'Ready';
  glow.style.borderColor = 'rgba(112, 104, 255, 0.75)';
  glow.style.boxShadow = '0 0 0 1px rgba(112, 104, 255, 0.35), 0 0 24px rgba(112, 104, 255, 0.45)';
  dom.demoStage.appendChild(glow);

  setTimeout(() => {
    localStorage.setItem(LS.onboardingSeen, 'true');
    dom.onboardingOverlay.classList.add('hidden');
    if (!boolSetting(LS.apiValidated, false)) dom.apiModal.classList.remove('hidden');
  }, 700);
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    dom.installBtn.classList.remove('hidden');
  });

  dom.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    dom.installBtn.classList.add('hidden');
  });
}

function setupOfflineBanner() {
  const syncBanner = () => {
    dom.offlineBanner.classList.toggle('hidden', navigator.onLine);
  };
  window.addEventListener('online', syncBanner);
  window.addEventListener('offline', syncBanner);
  syncBanner();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

function bindUIEvents() {
  dom.newChatBtn.addEventListener('click', createNewChat);

  dom.sendBtn.addEventListener('click', () => {
    const text = dom.messageInput.value;
    dom.messageInput.value = '';
    autoResizeTextarea();
    sendMessage(text);
  });

  dom.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dom.sendBtn.click();
    }
  });

  dom.messageInput.addEventListener('input', autoResizeTextarea);

  dom.menuBtn.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    dom.sidebar.classList.toggle('open', state.sidebarOpen);
  });

  dom.startDemoBtn.addEventListener('click', runOnboardingDemo);

  dom.skipDemoBtn.addEventListener('click', () => {
    localStorage.setItem(LS.onboardingSeen, 'true');
    dom.onboardingOverlay.classList.add('hidden');
    if (!boolSetting(LS.apiValidated, false)) dom.apiModal.classList.remove('hidden');
  });

  dom.testConnectionBtn.addEventListener('click', runConnectionTest);

  dom.modelSelect.addEventListener('change', () => {
    localStorage.setItem(LS.model, dom.modelSelect.value);
  });

  dom.settingsBtn.addEventListener('click', () => {
    const model = getSetting(LS.model, DEFAULTS.model);
    syncModelInputs(model);
    dom.settingsModal.classList.remove('hidden');
  });
  
  dom.sidebarSettingsBtn.addEventListener('click', () => {
    const model = getSetting(LS.model, DEFAULTS.model);
    syncModelInputs(model);
    dom.settingsModal.classList.remove('hidden');
  });
  
  dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));

  dom.settingsExportBtn.addEventListener('click', exportData);
  dom.exportBtn.addEventListener('click', exportData);

  dom.clearApiKeyBtn.addEventListener('click', () => {
    ApiConfig.clearApiKey();
    dom.apiKeyInput.value = '';
    showStatus('Local key cleared.', '');
    setLockedState();
  });

  dom.clearDataBtn.addEventListener('click', clearAllData);

  dom.messages.addEventListener('click', (event) => {
    const button = event.target.closest('.code-copy');
    if (!button) return;
    const code = decodeURIComponent(button.dataset.code || '');
    navigator.clipboard.writeText(code);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy code'; }, 900);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dom.settingsModal.classList.add('hidden');
      if (window.innerWidth <= 860) {
        dom.sidebar.classList.remove('open');
        state.sidebarOpen = false;
      }
    }
  });
}

function cacheDom() {
  [
    'onboardingOverlay', 'demoStage', 'startDemoBtn', 'skipDemoBtn',
    'sidebar', 'newChatBtn', 'chatList', 'sidebarSettingsBtn', 'exportBtn',
    'activeTitle', 'menuBtn', 'installBtn', 'settingsBtn',
    'messages', 'messageInput', 'sendBtn', 'chatLockState',
    'rightPanel',
    'settingsModal', 'themeSelect', 'fontSelect', 'widthSelect', 'timestampsToggle',
    'clearApiKeyBtn', 'clearDataBtn', 'settingsExportBtn', 'closeSettingsBtn',
    'offlineBanner', 'modelSelect', 'apiKeyInput', 'testConnectionBtn', 'apiStatus'
  ].forEach((id) => {
    dom[id] = $(id);
  });
}

async function init() {
  cacheDom();
  applySavedAppearance();

  const key = getApiKey();
  const model = getSetting(LS.model, DEFAULTS.model);

  bindAppearanceEvents();
  bindUIEvents();
  setupInstallPrompt();
  setupOfflineBanner();
  registerServiceWorker();

  await Storage.init();
  await ensureConversation();

  // Everything stays hidden - just pure chat interface
  dom.onboardingOverlay.classList.add('hidden');
  
  // Populate API key field if exists (for settings modal)
  if (key) dom.apiKeyInput.value = key;

  setLockedState();
}

init();
