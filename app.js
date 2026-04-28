import { Storage } from './storage.js';
import { renderMarkdown } from './markdown.js';
import { applyTheme, applyFontSize, applyWidth } from './themes.js';
import { ApiConfig } from './services/apiConfig.js';
import ChatEngine from './core/chatEngine.js';
import { ExportUtils } from './utils/export.js';

const LS = {
  model: 'privexai_model',
  activeConversationId: 'privexai_active_conv_id',
  theme: 'privexai_theme',
  font: 'privexai_font_size',
  width: 'privexai_chat_width',
  showTimestamps: 'privexai_show_timestamps'
};

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

function nowTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  const hasApiKey = ApiConfig.isApiKeyAvailable();
  dom.messageInput.disabled = state.isStreaming;
  dom.sendBtn.disabled = state.isStreaming;
  
  if (state.isStreaming) {
    dom.chatLockState.textContent = 'Streaming response...';
  } else if (hasApiKey) {
    dom.chatLockState.textContent = 'Ready to chat privately';
  } else {
    dom.chatLockState.textContent = 'Add API key in Settings to chat';
  }
}

function autoResizeTextarea() {
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = `${Math.min(dom.messageInput.scrollHeight, 180)}px`;
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

async function addInlineApiKeyNotice() {
  const content = 'API key not configured. Please add your API key in Settings to continue.\n\n[Go to Settings](/settings/)';
  const notice = await Storage.addMessage(state.activeConversationId, {
    role: 'model',
    content,
    timestamp: Date.now()
  });
  state.messages.push(notice);
  renderMessages();
}

async function sendMessage(text) {
  if (!text.trim() || state.isStreaming) return;
  
  // Check if API key is present BEFORE allowing send
  if (!ApiConfig.isApiKeyAvailable()) {
    await addInlineApiKeyNotice();
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

  if (!ApiConfig.isApiKeyAvailable()) {
    await addInlineApiKeyNotice();
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
  dom.settingsBtn.addEventListener('click', () => {
    window.location.href = './settings/';
  });

  dom.sidebarSettingsBtn.addEventListener('click', () => {
    window.location.href = './settings/';
  });

  dom.exportBtn.addEventListener('click', exportData);

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
      if (window.innerWidth <= 860) {
        dom.sidebar.classList.remove('open');
        state.sidebarOpen = false;
      }
    }
  });
}

function cacheDom() {
  [
    'sidebar', 'newChatBtn', 'chatList', 'sidebarSettingsBtn', 'exportBtn',
    'activeTitle', 'menuBtn', 'installBtn', 'settingsBtn',
    'messages', 'messageInput', 'sendBtn', 'chatLockState',
    'offlineBanner'
  ].forEach((id) => {
    dom[id] = $(id);
  });
}

async function init() {
  cacheDom();
  applySavedAppearance();
  bindUIEvents();
  setupInstallPrompt();
  setupOfflineBanner();
  registerServiceWorker();

  await Storage.init();
  await ensureConversation();

  setLockedState();
}

init();
