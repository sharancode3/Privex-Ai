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

const THEME_LS = {
  current: 'privex-theme',
  legacy: LS.theme
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

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStoredTheme() {
  const preferred = getSetting(THEME_LS.current, '');
  if (preferred) return preferred;
  return getSetting(THEME_LS.legacy, DEFAULTS.theme);
}

function migrateThemeKeyIfNeeded(theme) {
  if (!localStorage.getItem(THEME_LS.current) && theme) {
    localStorage.setItem(THEME_LS.current, theme);
  }
}

function syncSendButtonState() {
  const hasApiKey = ApiConfig.isApiKeyAvailable();
  const hasText = !!(dom.messageInput.value || '').trim();
  const isActive = !state.isStreaming && hasApiKey && hasText;
  dom.sendBtn.disabled = !isActive;
  dom.sendBtn.classList.toggle('active', isActive);
}

function boolSetting(key, fallback = false) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

function setLockedState() {
  const hasApiKey = ApiConfig.isApiKeyAvailable();
  dom.messageInput.disabled = state.isStreaming;
  document.documentElement.classList.toggle('is-streaming', state.isStreaming);
  if (state.isStreaming) {
    dom.chatLockState.textContent = 'Streaming response...';
  } else if (hasApiKey) {
    dom.chatLockState.textContent = 'Privex AI uses your API key directly. No data leaves your device.';
  } else {
    dom.chatLockState.textContent = 'Add API key in Settings to chat';
  }

  syncSendButtonState();
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
    const pre = codeEl.parentElement;
    if (!pre) return;
    pre.style.position = 'relative';

    const copy = document.createElement('button');
    copy.className = 'code-copy';
    copy.type = 'button';
    copy.dataset.code = encodeURIComponent(codeEl.textContent || '');
    copy.innerHTML = `
      <svg class="icon" width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="5" width="9" height="9" rx="1.5"></rect>
        <rect x="2" y="2" width="9" height="9" rx="1.5"></rect>
      </svg>
      <span class="sr-only">Copy</span>
    `;

    pre.appendChild(copy);
  });

  return holder.innerHTML;
}

function renderMessages() {
  const showTimes = boolSetting(LS.showTimestamps, false);
  if (!state.messages.length) {
    const hasApiKey = ApiConfig.isApiKeyAvailable();
    dom.messages.innerHTML = `
      <div id="welcome-state">
        <div class="welcome-mark" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 28 28" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="14" cy="14" r="12"></circle>
            <path d="M12 19V9h4a3 3 0 0 1 0 6h-4"></path>
          </svg>
        </div>
        <div class="welcome-title">Privex AI</div>
        <div class="welcome-sub">${hasApiKey ? 'Start a conversation when you’re ready.' : 'Add an API key in Settings to begin'}</div>
        <div class="welcome-pills" aria-label="Capabilities">
          <span class="welcome-pill">Local only</span>
          <span class="welcome-pill">Streaming</span>
          <span class="welcome-pill">BYOK</span>
        </div>
      </div>
    `;
    return;
  }

  const stack = document.createElement('div');
  stack.className = 'message-stack';

  state.messages.forEach((msg) => {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${isUser ? 'user' : 'ai'}`;

    if (!isUser) {
      const avatar = document.createElement('div');
      avatar.className = 'ai-avatar';
      avatar.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M10 17V7h4a3 3 0 0 1 0 6h-4"></path>
        </svg>
      `;
      wrapper.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const content = document.createElement('div');
    content.className = 'message-content';
    if (!isUser) {
      if (state.isStreaming && !msg.content) {
        content.innerHTML = '<span class="typing" aria-label="Typing"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
      } else {
        content.innerHTML = markdownWithCodeCopy(msg.content || '');
      }
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
    copyBtn.className = 'btn btn-icon';
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', 'Copy');
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = `
      <svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="10" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h7"/></svg>
    `;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(msg.content || '');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span style="font-size:11px">Copied!</span>';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 1500);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });
    actions.appendChild(copyBtn);

    if (!isUser) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-icon';
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', 'Edit');
      editBtn.title = 'Edit';
      editBtn.innerHTML = `
        <svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z"/><path d="M9.5 4l2.5 2.5"/></svg>
      `;
      editBtn.addEventListener('click', () => {
        console.log('Edit message:', msg.id);
      });
      actions.appendChild(editBtn);
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
  document.querySelectorAll('.chat-item[data-menu-open="true"]').forEach((el) => {
    el.dataset.menuOpen = 'false';
  });

  for (const conv of state.conversations) {
    const item = document.createElement('div');
    item.className = `chat-item ${conv.id === state.activeConversationId ? 'active' : ''}`;
    item.dataset.convId = conv.id;
    item.dataset.menuOpen = 'false';

    item.innerHTML = `
      <button type="button" class="chat-item-main" aria-label="Open conversation">
        <span class="chat-item-title">${escapeHtml(conv.title || 'New Chat')}</span>
      </button>
      <button type="button" class="chat-item-menu-btn" aria-label="Conversation menu" aria-haspopup="menu" aria-expanded="false">
        <svg class="icon" width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="3" cy="8" r="1.5"></circle>
          <circle cx="8" cy="8" r="1.5"></circle>
          <circle cx="13" cy="8" r="1.5"></circle>
        </svg>
      </button>
      <div class="chat-item-menu" role="menu">
        <button type="button" role="menuitem" data-action="rename">Rename</button>
        <button type="button" role="menuitem" data-action="export">Export</button>
        <button type="button" role="menuitem" data-action="delete">Delete</button>
      </div>
    `;

    const mainBtn = item.querySelector('.chat-item-main');
    const menuBtn = item.querySelector('.chat-item-menu-btn');
    const menu = item.querySelector('.chat-item-menu');

    const openConversation = async () => {
      state.activeConversationId = conv.id;
      localStorage.setItem(LS.activeConversationId, conv.id);
      await loadMessages(conv.id);
      dom.activeTitle.textContent = conv.title || 'New Chat';
      renderConversationList();
      if (window.innerWidth <= 860) {
        dom.sidebar.classList.remove('open');
        dom.sidebarBackdrop.classList.remove('is-active');
        state.sidebarOpen = false;
      }
    };

    mainBtn.addEventListener('click', openConversation);
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      menuBtn.click();
    });

    menuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = item.dataset.menuOpen === 'true';
      document.querySelectorAll('.chat-item[data-menu-open="true"]').forEach((el) => {
        if (el !== item) el.dataset.menuOpen = 'false';
      });
      item.dataset.menuOpen = isOpen ? 'false' : 'true';
      menuBtn.setAttribute('aria-expanded', item.dataset.menuOpen);
    });

    menu.addEventListener('click', async (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.stopPropagation();
      item.dataset.menuOpen = 'false';
      menuBtn.setAttribute('aria-expanded', 'false');

      const action = btn.dataset.action;
      if (action === 'rename') {
        const next = window.prompt('Rename chat', conv.title || 'New Chat');
        if (!next) return;
        await Storage.updateConversation(conv.id, { title: next.trim(), updatedAt: Date.now() });
        await ensureConversation();
      }

      if (action === 'delete') {
        const ok = window.confirm('Delete this chat? This cannot be undone.');
        if (!ok) return;
        await Storage.deleteConversation(conv.id);
        await ensureConversation();
      }

      if (action === 'export') {
        const conversation = await Storage.getConversation(conv.id);
        const messages = await Storage.getMessages(conv.id);
        ExportUtils.exportChatAsPDF(conversation.title || 'Chat', messages);
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
  const content = 'API key not configured. Please add your API key in Settings to continue.\n\n[Go to Settings](./settings/settings.html)';
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
  
  // Combine all conversations into one PDF
  if (allConversations.length === 0) {
    alert('No conversations to export');
    return;
  }

  // Flatten all messages with conversation context
  const allMessages = [];
  for (const conv of allConversations) {
    if (conv.messages && conv.messages.length > 0) {
      allMessages.push({
        role: 'model',
        content: `\n\n--- ${conv.title || 'Chat'} ---\n`,
        timestamp: conv.createdAt || Date.now()
      });
      allMessages.push(...conv.messages);
    }
  }
  
  ExportUtils.exportChatAsPDF('All Conversations', allMessages);
}

async function clearAllData() {
  const ok = window.confirm('Clear all local conversations and memories? This cannot be undone.');
  if (!ok) return;
  await Storage.clearEverything();
  await ensureConversation();
}

function applySavedAppearance() {
  const theme = getStoredTheme();
  const font = getSetting(LS.font, DEFAULTS.font);
  const width = getSetting(LS.width, DEFAULTS.width);

  migrateThemeKeyIfNeeded(theme);
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
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }
}

function bindUIEvents() {
  dom.newChatBtn.addEventListener('click', createNewChat);

  dom.sendBtn.addEventListener('click', () => {
    const text = dom.messageInput.value;
    dom.messageInput.value = '';
    autoResizeTextarea();
    syncSendButtonState();

    dom.sendBtn.classList.remove('is-pulsing');
    // reflow to restart animation reliably
    void dom.sendBtn.offsetWidth;
    dom.sendBtn.classList.add('is-pulsing');
    setTimeout(() => dom.sendBtn.classList.remove('is-pulsing'), 180);

    sendMessage(text);
  });

  dom.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dom.sendBtn.click();
    }
  });

  dom.messageInput.addEventListener('input', autoResizeTextarea);
  dom.messageInput.addEventListener('input', syncSendButtonState);

  dom.menuBtn.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    dom.sidebar.classList.toggle('open', state.sidebarOpen);
    dom.sidebarBackdrop.classList.toggle('is-active', state.sidebarOpen);
  });

  dom.sidebarBackdrop.addEventListener('click', () => {
    dom.sidebar.classList.remove('open');
    dom.sidebarBackdrop.classList.remove('is-active');
    state.sidebarOpen = false;
  });

  dom.activeTitle.addEventListener('click', async () => {
    const active = state.conversations.find((c) => c.id === state.activeConversationId);
    if (!active) return;
    const next = window.prompt('Rename chat', active.title || 'New Chat');
    if (!next) return;
    await Storage.updateConversation(active.id, { title: next.trim(), updatedAt: Date.now() });
    await ensureConversation();
  });
  dom.settingsBtn.addEventListener('click', () => {
    window.location.href = './settings/settings.html';
  });

  dom.settingsBtn?.addEventListener('click', () => {
    window.location.href = './settings/settings.html';
  });

  dom.exportBtn.addEventListener('click', exportData);

  dom.messages.addEventListener('click', (event) => {
    const button = event.target.closest('.code-copy');
    if (!button) return;
    const code = decodeURIComponent(button.dataset.code || '');
    navigator.clipboard.writeText(code);
    button.dataset.copied = 'true';
    setTimeout(() => { delete button.dataset.copied; }, 900);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (window.innerWidth <= 860) {
        dom.sidebar.classList.remove('open');
        dom.sidebarBackdrop.classList.remove('is-active');
        state.sidebarOpen = false;
      }
    }
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.chat-item[data-menu-open="true"]').forEach((el) => {
      el.dataset.menuOpen = 'false';
      const btn = el.querySelector('.chat-item-menu-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  });
}

function cacheDom() {
  [
    'sidebar', 'newChatBtn', 'chatList', 'sidebarSettingsBtn', 'exportBtn',
    'activeTitle', 'menuBtn', 'installBtn', 'settingsBtn',
    'messages', 'messageInput', 'sendBtn', 'chatLockState',
    'offlineBanner', 'sidebarBackdrop'
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
