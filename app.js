import { Storage } from './storage.js';
import { streamMessage, stopStreaming, nonStreamingGenerate } from './gemini.js';
import { renderMarkdown } from './markdown.js';
import {
  applyAccentColor,
  applyTheme,
  applyFontSize,
  applyWidth,
  getAccentPresets,
} from './themes.js';

const LS = {
  apiKey: 'privexai_openai_key',
  theme: 'privexai_theme',
  accent: 'privexai_accent_color',
  font: 'privexai_font_size',
  width: 'privexai_chat_width',
  sendOnEnter: 'privexai_send_on_enter',
  streaming: 'privexai_streaming',
  memoryEnabled: 'privexai_memory_enabled',
  activeConvId: 'privexai_active_conv_id',
  activePersonaId: 'privexai_active_persona_id',
  sidebarOpen: 'privexai_sidebar_open',
  showTimestamps: 'privexai_show_timestamps',
  model: 'privexai_model',
  temperature: 'privexai_temperature',
  maxTokens: 'privexai_max_tokens',
  userName: 'privexai_user_name',
  setupComplete: 'privexai_setup_complete',
  incognito: 'privexai_incognito',
  showToken: 'privexai_show_token_counter',
  autoDeleteDays: 'privexai_auto_delete_days',
  responseFormat: 'privexai_response_format',
  lastSeenVersion: 'privexai_last_seen_version',
  folderMap: 'privexai_folder_map',
  activeFolderFilter: 'privexai_active_folder_filter',
};

const APP_VERSION = '1.2.0';

const DEFAULTS = {
  theme: 'dark',
  accent: '#6366f1',
  font: 'md',
  width: 'normal',
  sendOnEnter: true,
  streaming: true,
  memoryEnabled: true,
  showTimestamps: false,
  model: 'gemini-2.0-flash',
  temperature: 0.9,
  maxTokens: 8192,
  incognito: false,
  showToken: true,
  autoDeleteDays: 'never',
  responseFormat: 'balanced',
};

const PROMPT_TEMPLATES = [
  {
    label: 'Template: Summarize This',
    value: 'Summarize the following content into concise bullet points and action items:\n\n',
  },
  {
    label: 'Template: Rewrite Professional',
    value: 'Rewrite the text below in a professional tone while preserving meaning:\n\n',
  },
  {
    label: 'Template: Explain Simply',
    value: 'Explain this in simple terms for a beginner, with one practical example:\n\n',
  },
  {
    label: 'Template: Debug Code',
    value: 'Debug this code. List likely causes, fixes, and a corrected version:\n\n```\n\n```',
  },
  {
    label: 'Template: Plan Project',
    value: 'Create a step-by-step project plan with milestones, risks, and timeline:\n\n',
  },
];

const state = {
  apiKey: '',
  conversations: [],
  activeConversationId: null,
  activeMessages: [],
  personas: [],
  memories: [],
  isStreaming: false,
  pendingAiMessageId: null,
  pendingAiNode: null,
  pendingAiText: '',
  lastUserText: '',
  commandItems: [],
  commandIndex: 0,
  settingsTrigger: null,
  memoryTrigger: null,
  conversationHistory: [],
  incognitoSession: {
    id: null,
    title: 'Incognito Conversation',
    messages: [],
    personaId: 'default',
  },
  menuActionMap: {},
  streamRenderScheduled: false,
  streamRenderTargetText: '',
  messageQueue: [],
  isProcessingQueue: false,
  hasIndexedDB: true,
  offlinePending: [],
  searchMatches: [],
  activeSearchIndex: 0,
  starredMessages: [],
  pinnedMessages: [],
  folderMap: {},
  activeFolderFilter: 'all',
  lastToastAt: new Map(),
  tabSync: null,
  newChatLock: false,
  lastConversationCreatedAt: 0,
};

const dom = {};

/*
DOM selector map for app.js (IDs from index.html must remain unchanged):
- Primary app IDs: #app, #sidebar, #collapseSidebarBtn, #expandSidebarBtn, #newChatBtn, #conversationList, #conversationSearch, #clearSearchBtn, #folderFilterSelect, #manageFoldersBtn, #openSettingsBtn, #openMemoryBtn, #exportAllBtn.
- Chat header/search IDs: #chat-header, #mobileMenuBtn, #conversationTitleInput, #conversationTitle, #conversationMeta, #chatSearchBtn, #chatSearchBar, #chatSearchInput, #chatSearchCount, #chatSearchPrev, #chatSearchNext, #chatSearchClose, #chatMenuBtn, #chatMenu.
- Chat/body/input IDs: #chatThread, #welcomeState, #welcomeHeading, #welcomeSubtitle, #jumpToBottomBtn, #chatInput, #sendBtn, #attachBtn, #voiceBtn, #fileInput, #memoryChip, #incognitoChip, #modelInfo, #tokenCount, #contextChips, #modelSelect, #personaPickerBtn.
- Panels/settings IDs: #settingsPanel, #closeSettingsBtn, #apiKeyInput, #toggleApiKeyBtn, #updateApiKeyBtn, #testApiBtn, #themeSegment, #accentSwatches, #fontSegment, #widthSegment, #showTimestampsToggle, #sendOnEnterToggle, #showTokenToggle, #settingsModelSelect, #tempSlider, #tempValue, #maxTokensSelect, #responseFormatSelect, #streamingToggle, #memoryEnabledToggle, #openMemoryManagerBtn, #clearMemoryBtn, #incognitoToggle, #storageStats, #importBtn, #importInput, #clearConversationsBtn, #resetAppBtn.
- Memory/starred/pinboard IDs: #memoryPanel, #closeMemoryBtn, #memoryMasterToggle, #memoryCount, #addMemoryBtn, #memoryList, #memoryUsage, #starredPanel, #closeStarredBtn, #starredList, #pinboardPanel, #closePinboardBtn, #pinboardList.
- Overlay/setup/utility IDs: #commandPaletteOverlay, #commandInput, #commandResults, #changelogOverlay, #closeChangelogBtn, #setupOverlay, #setupStep1, #setupStep2, #setupStep3, #setupNameInput, #setupThemeSegment, #setupFinish, #toastContainer.
- Dynamic IDs created in app.js: #uiDialogHost, #uiDialogTitle, #uiDialogMessage, #uiDialogInput, #uiDialogOk, #uiDialogCancel, [data-role="backdrop"], #toast-container.
- querySelector targets in app.js: .chat-messages, .toast, .conv-item-title, .conv-folder-badge, .conv-item-preview, .conv-item-time, .conv-item-menu, pre code, .code-copy, .message[data-id], .bubble, .streaming-cursor/.stream-cursor, [data-action="jump"], [data-action="unstar"], [data-action="unpin"], .bubble[data-search-original], mark.chat-mark, .message .bubble, .menu.
*/

let _streamBuffer = '';
let _rafPending = false;
let _activeBubble = null;

function $(id) {
  return document.getElementById(id);
}

function setVH() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

function boolSetting(key, fallback) {
  const val = localStorage.getItem(key);
  if (val == null) return fallback;
  return val === 'true';
}

function numSetting(key, fallback) {
  const val = Number(localStorage.getItem(key));
  return Number.isFinite(val) ? val : fallback;
}

function jsonSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function xorObfuscate(value) {
  const key = 'privex-ai-local';
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    out += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(out);
}

function xorDeobfuscate(value) {
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
  const configured = window.PRIVEX_CONFIG?.geminiApiKey || window.PRIVEX_CONFIG?.xaiApiKey || window.PRIVEX_CONFIG?.openaiApiKey;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  return xorDeobfuscate(localStorage.getItem(LS.apiKey) || '');
}

function setApiKey(raw) {
  localStorage.setItem(LS.apiKey, xorObfuscate(raw));
  state.apiKey = raw;
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function prettyModelName(model) {
  const val = String(model || '').toLowerCase();
  if (val.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (val.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
  if (val.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
  if (val.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
  if (val.includes('grok-2-latest')) return 'Grok 2 Latest';
  if (val.includes('grok-2')) return 'Grok 2';
  if (val.includes('grok-vision-beta')) return 'Grok Vision Beta';
  if (val.includes('grok-beta')) return 'Grok Beta';
  if (val.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (val.includes('gpt-4o')) return 'GPT-4o';
  if (val.includes('gpt-4.1-mini')) return 'GPT-4.1 Mini';
  if (val.includes('gpt-4.1')) return 'GPT-4.1';
  return 'Model';
}

function buildContextForAPI(fullHistory, maxMessages = 50) {
  if (fullHistory.length <= maxMessages) return fullHistory;
  return [...fullHistory.slice(0, 2), ...fullHistory.slice(-(maxMessages - 2))];
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`; 
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

function saveSetting(key, val) {
  localStorage.setItem(key, String(val));
}

function saveJsonSetting(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getConversationFolder(convId) {
  return state.folderMap[convId] || '';
}

function setConversationFolder(convId, folderName) {
  if (!convId) return;
  if (!folderName) {
    delete state.folderMap[convId];
  } else {
    state.folderMap[convId] = folderName;
  }
  saveJsonSetting(LS.folderMap, state.folderMap);
}

function getFolderNames() {
  const names = Object.values(state.folderMap).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function pruneFolderMap() {
  const valid = new Set(state.conversations.map((c) => c.id));
  let changed = false;
  for (const key of Object.keys(state.folderMap)) {
    if (!valid.has(key)) {
      delete state.folderMap[key];
      changed = true;
    }
  }
  if (changed) saveJsonSetting(LS.folderMap, state.folderMap);
}

function broadcastSync(type, payload = {}) {
  if (!state.tabSync) return;
  try {
    state.tabSync.postMessage({ type, ...payload });
  } catch {
    // no-op
  }
}

function loadSettingsToDom() {
  const theme = localStorage.getItem(LS.theme) || DEFAULTS.theme;
  const accent = localStorage.getItem(LS.accent) || DEFAULTS.accent;
  const font = localStorage.getItem(LS.font) || DEFAULTS.font;
  const width = localStorage.getItem(LS.width) || DEFAULTS.width;
  const sendOnEnter = boolSetting(LS.sendOnEnter, DEFAULTS.sendOnEnter);
  const showToken = boolSetting(LS.showToken, DEFAULTS.showToken);
  const showTimestamps = boolSetting(LS.showTimestamps, DEFAULTS.showTimestamps);
  const streaming = boolSetting(LS.streaming, DEFAULTS.streaming);
  const memoryEnabled = boolSetting(LS.memoryEnabled, DEFAULTS.memoryEnabled);
  const incognito = boolSetting(LS.incognito, DEFAULTS.incognito);
  const model = localStorage.getItem(LS.model) || DEFAULTS.model;
  const temp = numSetting(LS.temperature, DEFAULTS.temperature);
  const maxTokens = Number(localStorage.getItem(LS.maxTokens) || DEFAULTS.maxTokens);
  const responseFormat = localStorage.getItem(LS.responseFormat) || DEFAULTS.responseFormat;

  applyTheme(theme);
  applyAccentColor(accent);
  applyFontSize(font);
  applyWidth(width);

  dom.modelSelect.value = model;
  dom.settingsModelSelect.value = model;
  dom.tempSlider.value = String(temp);
  dom.tempValue.textContent = String(temp);
  dom.maxTokensSelect.value = String(maxTokens);
  dom.responseFormatSelect.value = responseFormat;

  dom.sendOnEnterToggle.checked = sendOnEnter;
  dom.showTokenToggle.checked = showToken;
  dom.showTimestampsToggle.checked = showTimestamps;
  dom.streamingToggle.checked = streaming;
  dom.memoryEnabledToggle.checked = memoryEnabled;
  dom.memoryMasterToggle.checked = memoryEnabled;
  dom.incognitoToggle.checked = incognito;
  setIncognitoButton(incognito);
  dom.memoryChip?.classList.toggle('active', memoryEnabled);
  dom.tokenCount.classList.toggle('hidden', !showToken);
  dom.modelInfo.textContent = prettyModelName(model);

  markSegment(dom.themeSegment, theme);
  markSegment(dom.fontSegment, font);
  markSegment(dom.widthSegment, width);
  buildAccentSwatches(accent);
}

function markSegment(segmentEl, value) {
  [...segmentEl.querySelectorAll('button')].forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function buildAccentSwatches(active) {
  dom.accentSwatches.innerHTML = '';
  for (const color of getAccentPresets()) {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.style.background = color;
    btn.type = 'button';
    btn.ariaLabel = `Use accent ${color}`;
    if (color.toLowerCase() === active.toLowerCase()) btn.classList.add('active');
    btn.addEventListener('click', () => {
      saveSetting(LS.accent, color);
      applyAccentColor(color);
      buildAccentSwatches(color);
    });
    dom.accentSwatches.appendChild(btn);
  }
}

function createToastContainer() {
  const existing = document.getElementById('toast-container') || dom.toastContainer;
  if (existing) return existing;
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function showToast(type, message, duration = 2800) {
  const container = document.getElementById('toast-container') || dom.toastContainer || createToastContainer();
  const icons = { success: '✓', error: '✗', info: 'ⓘ', warning: '⚠' };
  const key = `${type}:${message}`;
  const now = Date.now();
  const last = state.lastToastAt.get(key) || 0;
  if (now - last < 2000) return;
  state.lastToastAt.set(key, now);

  const existing = container.querySelectorAll('.toast');
  if (existing.length > 3) {
    existing[0].classList.add('exit');
    setTimeout(() => existing[0].remove(), 200);
  }

  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.innerHTML = `<span class="toast-icon">${icons[type] || 'ⓘ'}</span><span>${message}</span>`;

  const progress = document.createElement('div');
  progress.className = 'toast-progress';
  progress.style.transition = `transform ${duration}ms linear`;
  progress.style.transform = 'scaleX(1)';
  item.appendChild(progress);

  container.appendChild(item);
  requestAnimationFrame(() => {
    progress.style.transform = 'scaleX(0)';
  });

  setTimeout(() => {
    item.classList.add('exit');
    setTimeout(() => item.remove(), 200);
  }, duration);
}

function toast(message, timeout = 2400, type = 'info') {
  showToast(type, message, timeout);
}

function ensureUiDialogHost() {
  let host = document.getElementById('uiDialogHost');
  if (host) return host;

  host = document.createElement('div');
  host.id = 'uiDialogHost';
  host.className = 'ui-dialog-host hidden';
  host.innerHTML = `
    <div class="ui-dialog-backdrop" data-role="backdrop"></div>
    <div class="ui-dialog-card" role="dialog" aria-modal="true" aria-labelledby="uiDialogTitle">
      <h3 id="uiDialogTitle"></h3>
      <p id="uiDialogMessage"></p>
      <input id="uiDialogInput" class="hidden" type="text" maxlength="120" />
      <div class="ui-dialog-actions">
        <button id="uiDialogCancel" class="btn btn-outline" type="button">Cancel</button>
        <button id="uiDialogOk" class="btn" type="button">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  return host;
}

function showDialog({ title, message, withInput = false, defaultValue = '', okText = 'OK' }) {
  const host = ensureUiDialogHost();
  const titleEl = host.querySelector('#uiDialogTitle');
  const msgEl = host.querySelector('#uiDialogMessage');
  const inputEl = host.querySelector('#uiDialogInput');
  const okEl = host.querySelector('#uiDialogOk');
  const cancelEl = host.querySelector('#uiDialogCancel');
  const backdrop = host.querySelector('[data-role="backdrop"]');

  titleEl.textContent = title || 'Confirm';
  msgEl.textContent = message || '';
  okEl.textContent = okText || 'OK';
  inputEl.classList.toggle('hidden', !withInput);
  inputEl.value = defaultValue || '';
  host.classList.remove('hidden');

  return new Promise((resolve) => {
    const cleanup = (value) => {
      host.classList.add('hidden');
      okEl.removeEventListener('click', onOk);
      cancelEl.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onEsc);
      resolve(value);
    };

    const onOk = () => cleanup(withInput ? inputEl.value.trim() : true);
    const onCancel = () => cleanup(false);
    const onEsc = (e) => { if (e.key === 'Escape') onCancel(); };
    const onKeyDown = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };

    okEl.addEventListener('click', onOk);
    cancelEl.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onEsc);

    setTimeout(() => (withInput ? inputEl : okEl).focus(), 0);
  });
}

async function uiConfirm(message, title = 'Confirm', okText = 'OK') {
  const result = await showDialog({ title, message, withInput: false, okText });
  return result === true;
}

async function uiPrompt(message, defaultValue = '', title = 'Input', okText = 'Save') {
  const result = await showDialog({ title, message, withInput: true, defaultValue, okText });
  if (result === false) return null;
  return String(result || '').trim();
}

function getActivePersona() {
  const activeId = localStorage.getItem(LS.activePersonaId) || 'default';
  return state.personas.find((p) => p.id === activeId) || state.personas[0] || {
    id: 'default',
    name: 'Privex AI',
    systemPrompt: 'You are Privex AI, a helpful and accurate assistant.',
    emoji: 'AI',
  };
}

function buildSystemPrompt() {
  const persona = getActivePersona();
  const userName = localStorage.getItem(LS.userName) || '';
  const memoryEnabled = boolSetting(LS.memoryEnabled, DEFAULTS.memoryEnabled);

  let prompt = persona.systemPrompt;
  if (userName.trim()) prompt += `\n\nUser name: ${userName.trim()}.`;

  if (memoryEnabled) {
    const activeMem = state.memories.filter((m) => m.isActive);
    if (activeMem.length) {
      prompt += '\n\n---\nThings you know about the user:\n';
      for (const m of activeMem) prompt += `- ${m.content}\n`;
      prompt += '\nUse this context naturally without repeatedly confirming you remember it.';
    }
  }

  const responseFormat = localStorage.getItem(LS.responseFormat) || DEFAULTS.responseFormat;
  if (responseFormat === 'concise') {
    prompt += '\n\nResponse style: concise and direct. Prefer short bullets and avoid unnecessary explanation.';
  } else if (responseFormat === 'detailed') {
    prompt += '\n\nResponse style: detailed and structured. Include reasoning, examples, and clear step-by-step guidance where useful.';
  }

  return prompt;
}

function setIncognitoButton(on) {
  if (dom.incognitoChip) dom.incognitoChip.classList.toggle('active', on);
  document.body.classList.toggle('incognito', on);
}

function updateConversationMeta() {
  const model = localStorage.getItem(LS.model) || DEFAULTS.model;
  const prettyModel = prettyModelName(model);
  const count = state.activeMessages.length;
  if (dom.conversationMeta) dom.conversationMeta.textContent = `${prettyModel} · ${count} messages`;
  if (dom.modelInfo) dom.modelInfo.textContent = prettyModel;
}

function updateWelcomeHeading() {
  const headingEl = document.getElementById('welcomeHeading');
  const subtitleEl = document.getElementById('welcomeSubtitle');
  if (!headingEl) return;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = localStorage.getItem(LS.userName);
  headingEl.textContent = name ? `${greeting}, ${name} 👋` : "What's on your mind?";
  if (subtitleEl) subtitleEl.textContent = 'Powered by AI · Private by default.';
}

function currentConfig() {
  return {
    model: localStorage.getItem(LS.model) || DEFAULTS.model,
    temperature: numSetting(LS.temperature, DEFAULTS.temperature),
    maxTokens: Number(localStorage.getItem(LS.maxTokens) || DEFAULTS.maxTokens),
  };
}

function ensureChatMessagesContainer() {
  let container = dom.chatThread.querySelector('.chat-messages');
  if (!container) {
    container = document.createElement('div');
    container.className = 'chat-messages';
    dom.chatThread.appendChild(container);
  }
  return container;
}

function smartScrollToBottom() {
  const thread = dom.chatThread || document.getElementById('message-thread');
  if (!thread) return;
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 150;
  if (nearBottom) thread.scrollTop = thread.scrollHeight;
}

function forceScrollToBottom() {
  const thread = dom.chatThread || document.getElementById('message-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function shouldAutoScroll() {
  const el = dom.chatThread;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
}

function scrollToBottom(mode = 'auto') {
  dom.chatThread.scrollTo({ top: dom.chatThread.scrollHeight, behavior: mode });
}

function updateJumpButton() {
  const show = !shouldAutoScroll();
  dom.jumpToBottomBtn.classList.toggle('hidden', !show);
}

function updateTokenCounter() {
  const tokens = estimateTokens(dom.chatInput.value);
  dom.tokenCount.textContent = `~${tokens} tokens`;
  dom.tokenCount.classList.remove('warning', 'error');
  if (tokens >= 4000) dom.tokenCount.classList.add('error');
  else if (tokens >= 1000) dom.tokenCount.classList.add('warning');

  const maxTokens = Number(localStorage.getItem(LS.maxTokens) || DEFAULTS.maxTokens);
  if (tokens > Math.floor(maxTokens * 0.8)) {
    toast('Approaching token limit', 1800, 'warning');
  }
}

function updateSendButtonState() {
  if (state.isStreaming) {
    dom.sendBtn.innerHTML = '<span aria-hidden="true">■</span>';
    dom.sendBtn.setAttribute('aria-label', 'Stop generating');
    dom.sendBtn.classList.add('streaming');
    dom.sendBtn.removeAttribute('disabled');
    return;
  }

  dom.sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  dom.sendBtn.setAttribute('aria-label', 'Send message');
  dom.sendBtn.classList.remove('streaming');
  const disabled = !dom.chatInput.value.trim();
  if (disabled) dom.sendBtn.setAttribute('disabled', 'disabled');
  else dom.sendBtn.removeAttribute('disabled');
}

function resetComposerHeight() {
  dom.chatInput.style.height = 'auto';
}

function autoGrowInput() {
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = `${Math.min(dom.chatInput.scrollHeight, 200)}px`;
}

function groupNameForDate(ts) {
  const now = new Date();
  const date = new Date(ts);
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((new Date(now.toDateString()) - new Date(date.toDateString())) / dayMs);

  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 7) return 'This Week';
  if (diff <= 30) return 'This Month';
  return 'Older';
}

function renderConversationList(conversations = state.conversations) {
  const root = dom.conversationList;
  root.innerHTML = '';

  const folderFilter = state.activeFolderFilter || 'all';
  let filtered = conversations.slice();
  if (folderFilter === 'unfiled') {
    filtered = filtered.filter((c) => !getConversationFolder(c.id));
  } else if (folderFilter !== 'all') {
    filtered = filtered.filter((c) => getConversationFolder(c.id) === folderFilter);
  }

  if (state.starredMessages && state.starredMessages.length) {
    const starredHeader = document.createElement('div');
    starredHeader.className = 'group-title';
    starredHeader.textContent = 'Starred';
    root.appendChild(starredHeader);

    const starredBtn = document.createElement('div');
    starredBtn.className = 'conv-item';
    starredBtn.innerHTML = `
      <div class="conv-item-icon">⭐</div>
      <div class="conv-item-body"><div class="conv-item-title">Starred Messages</div><div class="conv-item-preview">${state.starredMessages.length} saved</div></div>
      <div class="conv-item-meta"><span class="conv-item-time">View</span></div>
    `;
    starredBtn.addEventListener('click', () => openStarred(dom.openStarredBtn));
    root.appendChild(starredBtn);
  }

  if (state.pinnedMessages && state.pinnedMessages.length) {
    const pinHeader = document.createElement('div');
    pinHeader.className = 'group-title';
    pinHeader.textContent = 'Pinboard';
    root.appendChild(pinHeader);

    const pinBtn = document.createElement('div');
    pinBtn.className = 'conv-item';
    pinBtn.innerHTML = `
      <div class="conv-item-icon">📌</div>
      <div class="conv-item-body"><div class="conv-item-title">Pinned Messages</div><div class="conv-item-preview">${state.pinnedMessages.length} pinned</div></div>
      <div class="conv-item-meta"><span class="conv-item-time">View</span></div>
    `;
    pinBtn.addEventListener('click', () => openPinboard(dom.openPinboardBtn));
    root.appendChild(pinBtn);
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'muted no-conv';
    empty.textContent = folderFilter === 'all'
      ? 'No conversations yet. Start a new chat!'
      : 'No conversations in this folder.';
    root.appendChild(empty);
    return;
  }

  const groups = new Map();
  groups.set('Pinned', filtered.filter((c) => c.isPinned));

  for (const conv of filtered.filter((c) => !c.isPinned)) {
    const g = groupNameForDate(conv.updatedAt);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(conv);
  }

  for (const [title, items] of groups.entries()) {
    if (!items.length) continue;
    const header = document.createElement('div');
    header.className = 'group-title';
    header.textContent = title;
    root.appendChild(header);

    for (const conv of items) {
      const item = document.createElement('div');
      item.className = `conv-item${conv.id === state.activeConversationId ? ' active' : ''}`;
      item.dataset.id = conv.id;
      item.innerHTML = `
        <div class="conv-item-icon">💬</div>
        <div class="conv-item-body">
          <div class="conv-item-title-row"><div class="conv-item-title"></div><span class="conv-folder-badge hidden"></span></div>
          <div class="conv-item-preview"></div>
        </div>
        <div class="conv-item-meta">
          <span class="conv-item-time"></span>
          <button class="conv-item-menu icon-btn" aria-label="Conversation menu">···</button>
        </div>
      `;

      item.querySelector('.conv-item-title').textContent = conv.title || 'New Conversation';
      const folder = getConversationFolder(conv.id);
      const folderBadge = item.querySelector('.conv-folder-badge');
      if (folder) {
        folderBadge.textContent = folder;
        folderBadge.classList.remove('hidden');
      }
      item.querySelector('.conv-item-preview').textContent = conv.lastPreview || '';
      item.querySelector('.conv-item-time').textContent = formatRelativeTime(conv.updatedAt);

      item.addEventListener('click', async (e) => {
        if (e.target.closest('.conv-item-menu')) return;
        await openConversation(conv.id);
      });

      item.querySelector('.conv-item-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        showConversationMenu(conv, item);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showConversationMenu(conv, item);
      });

      root.appendChild(item);
    }
  }
}

function showConversationMenu(conv, anchor) {
  const rect = anchor.getBoundingClientRect();
  const currentFolder = getConversationFolder(conv.id);
  openMenu(
    [
      {
        id: 'rename-conv',
        label: 'Rename',
        run: async () => {
          const next = await uiPrompt('Rename conversation', conv.title || 'Conversation', 'Rename conversation', 'Rename');
          if (!next?.trim()) return;
          await Storage.updateConversation(conv.id, { title: next.trim(), updatedAt: Date.now() });
          if (state.activeConversationId === conv.id) dom.conversationTitle.textContent = next.trim();
          await refreshConversations();
        },
      },
      {
        id: 'pin-conv',
        label: conv.isPinned ? 'Unpin' : 'Pin',
        run: async () => {
          await Storage.pinConversation(conv.id, !conv.isPinned);
          await refreshConversations();
        },
      },
      {
        id: 'move-to-folder',
        label: currentFolder ? `Move folder (${currentFolder})` : 'Move to folder',
        run: async () => {
          const next = await uiPrompt('Folder name (leave empty to remove)', currentFolder || '', 'Move to folder', 'Move');
          if (next == null) return;
          const clean = next.trim();
          setConversationFolder(conv.id, clean);
          renderFolderFilterOptions();
          renderConversationList();
          toast(clean ? `Moved to ${clean}` : 'Removed folder', 2200, 'success');
        },
      },
      {
        id: 'archive-conv',
        label: conv.isArchived ? 'Unarchive' : 'Archive',
        run: async () => {
          await Storage.updateConversation(conv.id, { isArchived: !conv.isArchived, updatedAt: Date.now() });
          if (state.activeConversationId === conv.id && !conv.isArchived) {
            state.activeConversationId = null;
            state.activeMessages = [];
            renderChatMessages();
          }
          await refreshConversations();
        },
      },
      {
        id: 'export-conv',
        label: 'Export as Markdown',
        run: () => exportConversationMarkdown(conv.id),
      },
      {
        id: 'delete-conv',
        label: 'Delete',
        run: async () => {
          if (!await uiConfirm('Delete this conversation?', 'Delete conversation', 'Delete')) return;
          await Storage.deleteConversation(conv.id);
          if (state.activeConversationId === conv.id) {
            state.activeConversationId = null;
            saveSetting(LS.activeConvId, '');
            state.activeMessages = [];
            renderChatMessages();
          }
          await refreshConversations();
        },
      },
    ],
    rect
  );
}

function openMenu(items, rect) {
  state.menuActionMap = {};
  dom.chatMenu.innerHTML = '';

  items.forEach((item) => {
    state.menuActionMap[item.id] = item.run;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = item.id;
    btn.textContent = item.label;
    dom.chatMenu.appendChild(btn);
  });

  dom.chatMenu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  dom.chatMenu.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 6)}px`;
  dom.chatMenu.classList.remove('hidden');
}

function closeMenus() {
  dom.chatMenu.classList.add('hidden');
  state.menuActionMap = {};
}

function renderDateSeparator(ts) {
  const sep = document.createElement('div');
  sep.className = 'date-separator';
  sep.textContent = `──────────── ${new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} ────────────`;
  return sep;
}

function messageToolbarFor(message) {
  const toolbar = document.createElement('div');
  toolbar.className = 'message-toolbar';
  if (message.role === 'user') {
    toolbar.innerHTML = `
      <button class="tool-btn" data-action="edit" aria-label="Edit message">✏️</button>
      <button class="tool-btn" data-action="copy" aria-label="Copy message">📋</button>
      <button class="tool-btn" data-action="star" aria-label="Star message">⭐</button>
      <button class="tool-btn" data-action="pin" aria-label="Pin message">📌</button>
      <button class="tool-btn" data-action="delete" aria-label="Delete message">🗑️</button>
    `;
  } else if (message.role === 'model') {
    toolbar.innerHTML = `
      <button class="tool-btn" data-action="up" aria-label="Thumbs up">👍</button>
      <button class="tool-btn" data-action="down" aria-label="Thumbs down">👎</button>
      <button class="tool-btn" data-action="copy" aria-label="Copy message">📋</button>
      <button class="tool-btn" data-action="regen" aria-label="Regenerate message">🔄</button>
      <button class="tool-btn" data-action="star" aria-label="Star message">⭐</button>
      <button class="tool-btn" data-action="pin" aria-label="Pin message">📌</button>
      <button class="tool-btn" data-action="delete" aria-label="Delete message">🗑️</button>
    `;
  } else {
    toolbar.innerHTML = '<button class="tool-btn" data-action="copy" aria-label="Copy message">📋</button>';
  }
  return toolbar;
}

function applyHighlighting(root) {
  if (!window.hljs) return;
  root.querySelectorAll('pre code').forEach((codeEl) => {
    try {
      window.hljs.highlightElement(codeEl);
    } catch {
      // no-op
    }
  });
}

function wireCodeCopy(root) {
  root.querySelectorAll('.code-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = decodeURIComponent(btn.dataset.code || '');
      await navigator.clipboard.writeText(code);
      showToast('success', 'Copied to clipboard');
    });
  });
}

function renderUserLightMarkdown(text) {
  const safe = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, lang, code) => `<pre><code class="language-${lang || 'text'}">${code}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

function renderMessage(message, opts = {}) {
  const row = document.createElement('div');
  const roleClass = message.role === 'user' ? 'message-user' : message.role === 'model' ? 'message-ai' : 'message-system message-ai';
  row.className = `message ${roleClass}`;
  row.dataset.id = message.id;
  if (message.role === 'user') {
    row.style.animation = 'userBubbleIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both';
  }
  if (message.role === 'model') {
    row.style.animation = 'aiBubbleIn 0.24s ease-out both';
  }

  const avatar = document.createElement('div');
  avatar.className = `avatar ${message.role === 'model' ? 'ai-avatar' : ''}`;
  if (message.role === 'user') {
    const name = localStorage.getItem(LS.userName) || 'U';
    avatar.textContent = name.slice(0, 1).toUpperCase();
  } else if (message.role === 'model') {
    avatar.textContent = 'AI';
  } else {
    avatar.textContent = '!';
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (message.role === 'model') {
    bubble.innerHTML = renderMarkdown(message.content || '');
  } else if (message.role === 'user') {
    bubble.innerHTML = renderUserLightMarkdown(message.content || '');
  } else {
    bubble.textContent = message.content || '';
  }

  if (message.status === 'pending') {
    row.classList.add('message-pending');
    const pending = document.createElement('div');
    pending.className = 'pending-note';
    pending.textContent = 'Waiting for connection...';
    bubble.appendChild(pending);
  }

  if (opts.streaming) {
    const cursor = document.createElement('span');
    cursor.className = 'stream-cursor';
    bubble.appendChild(cursor);
  }

  const toolbar = messageToolbarFor(message);
  row.appendChild(toolbar);
  row.appendChild(avatar);
  row.appendChild(bubble);

  toolbar.addEventListener('click', (e) => {
    const action = e.target?.dataset?.action;
    if (!action) return;
    handleMessageAction(action, message);
  });

  if (message.role === 'model') {
    applyHighlighting(bubble);
    wireCodeCopy(bubble);
  }

  return row;
}

async function handleMessageAction(action, message) {
  if (action === 'copy') {
    await navigator.clipboard.writeText(message.content || '');
    showToast('success', 'Copied to clipboard');
    return;
  }

  if (action === 'star') {
    const next = !message.isStarred;
    message.isStarred = next;
    if (!boolSetting(LS.incognito, false)) {
      await Storage.updateMessage(message.id, { isStarred: next });
      broadcastSync('msg_updated', { conversationId: state.activeConversationId });
      await refreshConversations();
      if (dom.starredPanel.classList.contains('open')) await renderStarredPanel();
    }
    toast(next ? 'Starred' : 'Unstarred', 2000, 'success');
    return;
  }

  if (action === 'pin') {
    const next = !message.isPinned;
    message.isPinned = next;
    if (!boolSetting(LS.incognito, false)) {
      await Storage.updateMessage(message.id, { isPinned: next });
      broadcastSync('msg_updated', { conversationId: state.activeConversationId });
      await refreshConversations();
      if (dom.pinboardPanel.classList.contains('open')) await renderPinboardPanel();
    }
    toast(next ? 'Pinned to pinboard' : 'Removed from pinboard', 2000, 'success');
    return;
  }

  if (action === 'delete') {
    if (!await uiConfirm('Delete this message?', 'Delete message', 'Delete')) return;
    if (boolSetting(LS.incognito, false)) {
      state.incognitoSession.messages = state.incognitoSession.messages.filter((m) => m.id !== message.id);
      state.activeMessages = state.incognitoSession.messages.slice();
      renderChatMessages();
      return;
    }
    await Storage.deleteMessage(message.id);
    state.activeMessages = state.activeMessages.filter((m) => m.id !== message.id);
    renderChatMessages();
    await refreshConversations();
    return;
  }

  if (action === 'up' || action === 'down') {
    const val = action === 'up' ? 'up' : 'down';
    const next = message.reaction === val ? null : val;
    message.reaction = next;
    if (!boolSetting(LS.incognito, false)) {
      await Storage.updateMessage(message.id, { reaction: next });
    }
    toast(next ? `Reaction: ${next}` : 'Reaction removed');
    return;
  }

  if (action === 'edit' && message.role === 'user') {
    beginEditMessage(message);
    return;
  }

  if (action === 'regen' && message.role === 'model') {
    if (!await uiConfirm('Regenerate this response? The current response will be replaced.', 'Regenerate response', 'Regenerate')) return;
    await regenerateMessage(message);
  }
}

function beginEditMessage(message) {
  const row = dom.chatThread.querySelector(`.message[data-id="${message.id}"]`);
  if (!row) return;
  const bubble = row.querySelector('.bubble');
  const original = message.content;

  bubble.innerHTML = '';
  const area = document.createElement('textarea');
  area.value = original;
  area.style.width = '100%';
  area.style.minHeight = '90px';
  const actions = document.createElement('div');
  actions.className = 'row';
  actions.innerHTML = '<button class="btn">Save & Resend</button><button class="btn btn-outline">Cancel</button>';
  bubble.appendChild(area);
  bubble.appendChild(actions);

  actions.children[0].addEventListener('click', async () => {
    const next = area.value.trim();
    if (!next) return;

    if (boolSetting(LS.incognito, false)) {
      const idx = state.incognitoSession.messages.findIndex((m) => m.id === message.id);
      if (idx >= 0) {
        state.incognitoSession.messages[idx] = {
          ...state.incognitoSession.messages[idx],
          content: next,
          isEdited: true,
          editHistory: [...(state.incognitoSession.messages[idx].editHistory || []), { content: original, timestamp: Date.now() }],
        };
        state.incognitoSession.messages = state.incognitoSession.messages.slice(0, idx + 1);
        state.activeMessages = state.incognitoSession.messages.slice();
      }
      renderChatMessages();
      await resendLastUser(next, message.timestamp);
      return;
    }

    const sourceConvId = state.activeConversationId;
    const sourceConv = await Storage.getConversation(sourceConvId);
    const allMessages = await Storage.getMessages(sourceConvId);
    const editIndex = allMessages.findIndex((m) => m.id === message.id);
    if (editIndex < 0) return;

    const branch = await Storage.createConversation({
      title: `${sourceConv?.title || 'Conversation'} (branch)`,
      model: sourceConv?.model || localStorage.getItem(LS.model) || DEFAULTS.model,
      systemPromptId: sourceConv?.systemPromptId || localStorage.getItem(LS.activePersonaId) || 'default',
    });

    const prefix = allMessages.slice(0, editIndex + 1);
    for (const m of prefix) {
      await Storage.addMessage(branch.id, {
        role: m.role,
        content: m.id === message.id ? next : m.content,
        reaction: m.reaction,
        isStarred: m.isStarred,
        isPinned: m.isPinned,
        isEdited: m.id === message.id ? true : m.isEdited,
        editHistory: m.id === message.id
          ? [...(m.editHistory || []), { content: original, timestamp: Date.now() }]
          : (m.editHistory || []),
        timestamp: m.timestamp,
      });
    }

    await Storage.addMessage(branch.id, {
      role: 'system',
      content: `↩ Edited from original branch: ${(sourceConv?.title || 'Conversation')}`,
      timestamp: Date.now(),
    });

    await refreshConversations();
    await openConversation(branch.id);
    await resendLastUser(next, message.timestamp);
  });

  actions.children[1].addEventListener('click', () => {
    bubble.textContent = original;
  });
}

async function regenerateMessage(aiMessage) {
  const idx = state.activeMessages.findIndex((m) => m.id === aiMessage.id);
  if (idx <= 0) return;
  const priorUser = [...state.activeMessages].slice(0, idx).reverse().find((m) => m.role === 'user');
  if (!priorUser) return;

  if (boolSetting(LS.incognito, false)) {
    state.incognitoSession.messages = state.activeMessages.filter((m) => m.id !== aiMessage.id);
    state.activeMessages = state.incognitoSession.messages.slice();
  } else {
    await Storage.deleteMessage(aiMessage.id);
    state.activeMessages = state.activeMessages.filter((m) => m.id !== aiMessage.id);
  }
  renderChatMessages();
  await resendLastUser(priorUser.content, priorUser.timestamp);
}

function renderThinking() {
  const container = ensureChatMessagesContainer();
  const row = document.createElement('div');
  row.className = 'message message-ai thinking';
  row.style.animation = 'aiBubbleIn 0.24s ease-out both';
  row.innerHTML = `
    <div class="avatar ai-avatar">AI</div>
    <div class="bubble"><div class="thinking-dots"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>
  `;
  container.appendChild(row);
  smartScrollToBottom();
  return row;
}

function handleStreamChunk(chunk) {
  _streamBuffer += chunk;
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    if (_activeBubble) {
      _activeBubble.innerHTML = renderMarkdown(_streamBuffer) + '<span class="stream-cursor"></span>';
      smartScrollToBottom();
    }
    _rafPending = false;
  });
}

function finalizeStreamingNode(finalText) {
  if (!_activeBubble) return;
  _activeBubble.innerHTML = renderMarkdown(finalText || _streamBuffer || '');
  applyHighlighting(_activeBubble);
  wireCodeCopy(_activeBubble);
  const cursor = _activeBubble.querySelector('.stream-cursor');
  if (cursor) cursor.remove();
  _streamBuffer = '';
  _activeBubble = null;
}

function renderChatMessages() {
  const container = ensureChatMessagesContainer();
  container.innerHTML = '';

  updateWelcomeHeading();
  dom.welcomeState.classList.toggle('hidden', state.activeMessages.length > 0);

  let lastDate = null;
  for (const message of state.activeMessages) {
    const date = new Date(message.timestamp).toDateString();
    if (date !== lastDate) {
      container.appendChild(renderDateSeparator(message.timestamp));
      lastDate = date;
    }
    container.appendChild(renderMessage(message));
  }

  if (state.activeMessages.length === 0) {
    dom.conversationTitle.textContent = boolSetting(LS.incognito, false) ? 'Incognito Conversation' : 'New Conversation';
  }

  updateConversationMeta();

  if (shouldAutoScroll()) forceScrollToBottom();
  updateJumpButton();
}

function rebuildConversationHistory() {
  state.conversationHistory = state.activeMessages
    .filter((m) => (m.role === 'user' || m.role === 'model') && m.status !== 'pending')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
}

async function refreshConversations() {
  if (boolSetting(LS.incognito, false)) return;
  const all = await Storage.getAllConversations();
  // Frontend safety dedupe against race conditions creating twin empty "New Conversation" rows.
  const seen = new Set();
  state.conversations = all.filter((c) => {
    const key = c.messageCount === 0
      ? `draft:${(c.title || '').trim().toLowerCase()}:${Math.floor((c.createdAt || c.updatedAt || 0) / 1000)}`
      : `id:${c.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  pruneFolderMap();
  state.starredMessages = await Storage.getStarredMessages();
  state.pinnedMessages = await Storage.getPinnedMessages();
  renderFolderFilterOptions();
  renderConversationList();
}

function renderFolderFilterOptions() {
  if (!dom.folderFilterSelect) return;
  const folders = getFolderNames();
  const options = [
    { value: 'all', label: 'All folders' },
    { value: 'unfiled', label: 'Unfiled' },
    ...folders.map((name) => ({ value: name, label: `Folder: ${name}` })),
  ];

  dom.folderFilterSelect.innerHTML = '';
  options.forEach((opt) => {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    dom.folderFilterSelect.appendChild(el);
  });

  if (!options.some((o) => o.value === state.activeFolderFilter)) {
    state.activeFolderFilter = 'all';
    saveSetting(LS.activeFolderFilter, 'all');
  }
  dom.folderFilterSelect.value = state.activeFolderFilter;
}

async function renderStarredPanel() {
  if (!state.hasIndexedDB) return;
  state.starredMessages = await Storage.getStarredMessages();
  dom.starredList.innerHTML = '';

  if (!state.starredMessages.length) {
    dom.starredList.innerHTML = '<p class="muted">No starred messages yet.</p>';
    return;
  }

  const convMap = new Map(state.conversations.map((c) => [c.id, c]));

  for (const msg of state.starredMessages) {
    const entry = document.createElement('div');
    entry.className = 'starred-entry';
    const conv = convMap.get(msg.conversationId);
    entry.innerHTML = `
      <div class="muted">From: ${conv?.title || 'Conversation'} · ${new Date(msg.timestamp).toLocaleDateString()}</div>
      <div>${(msg.content || '').slice(0, 320)}</div>
      <div class="row">
        <button class="btn btn-outline" data-action="jump">Jump to conversation</button>
        <button class="btn btn-outline" data-action="unstar">Unstar</button>
      </div>
    `;

    entry.querySelector('[data-action="jump"]').addEventListener('click', async () => {
      closeStarred();
      await openConversation(msg.conversationId);
      const row = dom.chatThread.querySelector(`.message[data-id="${msg.id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('pulse-highlight');
        setTimeout(() => row.classList.remove('pulse-highlight'), 1200);
      }
    });

    entry.querySelector('[data-action="unstar"]').addEventListener('click', async () => {
      await Storage.updateMessage(msg.id, { isStarred: false });
      if (state.activeMessages.some((m) => m.id === msg.id)) {
        const local = state.activeMessages.find((m) => m.id === msg.id);
        if (local) local.isStarred = false;
      }
      await refreshConversations();
      await renderStarredPanel();
    });

    dom.starredList.appendChild(entry);
  }
}

async function renderPinboardPanel() {
  if (!state.hasIndexedDB) return;
  state.pinnedMessages = await Storage.getPinnedMessages();
  dom.pinboardList.innerHTML = '';

  if (!state.pinnedMessages.length) {
    dom.pinboardList.innerHTML = '<p class="muted">No pinned messages yet.</p>';
    return;
  }

  const convMap = new Map(state.conversations.map((c) => [c.id, c]));

  for (const msg of state.pinnedMessages) {
    const entry = document.createElement('div');
    entry.className = 'starred-entry';
    const conv = convMap.get(msg.conversationId);
    entry.innerHTML = `
      <div class="muted">From: ${conv?.title || 'Conversation'} · ${new Date(msg.timestamp).toLocaleDateString()}</div>
      <div>${(msg.content || '').slice(0, 320)}</div>
      <div class="row">
        <button class="btn btn-outline" data-action="jump">Jump to conversation</button>
        <button class="btn btn-outline" data-action="unpin">Unpin</button>
      </div>
    `;

    entry.querySelector('[data-action="jump"]').addEventListener('click', async () => {
      closePinboard();
      await openConversation(msg.conversationId);
      const row = dom.chatThread.querySelector(`.message[data-id="${msg.id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('pulse-highlight');
        setTimeout(() => row.classList.remove('pulse-highlight'), 1200);
      }
    });

    entry.querySelector('[data-action="unpin"]').addEventListener('click', async () => {
      await Storage.updateMessage(msg.id, { isPinned: false });
      if (state.activeMessages.some((m) => m.id === msg.id)) {
        const local = state.activeMessages.find((m) => m.id === msg.id);
        if (local) local.isPinned = false;
      }
      await refreshConversations();
      await renderPinboardPanel();
    });

    dom.pinboardList.appendChild(entry);
  }
}

function openStarred(triggerEl) {
  state.memoryTrigger = triggerEl || document.activeElement;
  dom.starredPanel.classList.add('open');
  dom.starredPanel.focus();
  renderStarredPanel();
}

function closeStarred() {
  dom.starredPanel.classList.remove('open');
  state.memoryTrigger?.focus?.();
}

function openPinboard(triggerEl) {
  state.memoryTrigger = triggerEl || document.activeElement;
  dom.pinboardPanel.classList.add('open');
  dom.pinboardPanel.focus();
  renderPinboardPanel();
}

function closePinboard() {
  dom.pinboardPanel.classList.remove('open');
  state.memoryTrigger?.focus?.();
}

async function openConversation(id) {
  if (!id) return;
  state.activeConversationId = id;
  saveSetting(LS.activeConvId, id);

  const conv = await Storage.getConversation(id);
  state.activeMessages = await Storage.getMessages(id);
  dom.conversationTitle.textContent = conv?.title || 'Conversation';
  dom.modelSelect.value = conv?.model || localStorage.getItem(LS.model) || DEFAULTS.model;

  rebuildConversationHistory();
  renderChatMessages();
  renderConversationList();
  updateConversationMeta();
}

function useIncognitoSession() {
  state.activeConversationId = null;
  state.activeMessages = state.incognitoSession.messages.slice();
  dom.conversationTitle.textContent = state.incognitoSession.title;
  rebuildConversationHistory();
  renderChatMessages();
  updateConversationMeta();
}

async function createConversationForMessage(firstUserText) {
  if (boolSetting(LS.incognito, false)) {
    if (!state.incognitoSession.id) {
      state.incognitoSession.id = `incog_${Date.now()}`;
      state.incognitoSession.title = firstUserText.slice(0, 60) || 'Incognito Conversation';
    }
    return null;
  }

  const existing = state.activeConversationId && await Storage.getConversation(state.activeConversationId);
  if (existing) return existing;

  const conv = await Storage.createConversation({
    title: firstUserText.trim().slice(0, 45) || 'New Conversation',
    model: localStorage.getItem(LS.model) || DEFAULTS.model,
    systemPromptId: localStorage.getItem(LS.activePersonaId) || 'default',
  });

  state.activeConversationId = conv.id;
  saveSetting(LS.activeConvId, conv.id);
  await refreshConversations();
  return conv;
}

function createSystemErrorMessage(content, retryPayload = null) {
  return {
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'system',
    content,
    timestamp: Date.now(),
    retryPayload,
  };
}

function addSystemMessage(content, retryPayload = null) {
  const msg = createSystemErrorMessage(content, retryPayload);
  state.activeMessages.push(msg);
  renderChatMessages();

  const row = dom.chatThread.querySelector(`.message[data-id="${msg.id}"]`);
  if (row && retryPayload) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.textContent = 'Retry';
    const canRetryNow = !retryPayload.waitUntil || Date.now() >= retryPayload.waitUntil;
    if (!canRetryNow) btn.setAttribute('disabled', 'disabled');
    btn.addEventListener('click', () => resendLastUser(retryPayload.text, retryPayload.timestamp, true));

    let interval = null;
    if (retryPayload.waitUntil) {
      const countdown = document.createElement('span');
      countdown.className = 'muted';
      countdown.style.marginLeft = '8px';
      const tick = () => {
        const seconds = Math.max(0, Math.ceil((retryPayload.waitUntil - Date.now()) / 1000));
        countdown.textContent = seconds > 0 ? `Retry in ${seconds}s` : 'You can retry now';
        if (seconds <= 0) {
          btn.removeAttribute('disabled');
          if (interval) window.clearInterval(interval);
        }
      };
      tick();
      interval = window.setInterval(tick, 1000);
      row.querySelector('.bubble').appendChild(countdown);
    }

    row.querySelector('.bubble').appendChild(document.createElement('br'));
    row.querySelector('.bubble').appendChild(btn);
  }
}

async function extractMemory(userMessage, aiResponse) {
  const enabled = boolSetting(LS.memoryEnabled, DEFAULTS.memoryEnabled);
  if (!enabled || !state.apiKey || !aiResponse) return;

  const prompt = {
    role: 'user',
    parts: [{
      text: [
        'Review this exchange and extract important persistent facts about the user.',
        'Extract only concrete and long-term relevant facts.',
        'Return ONLY valid JSON: {"facts": ["fact 1", "fact 2"]}',
        `User: ${userMessage}`,
        `Assistant: ${(aiResponse || '').slice(0, 500)}`,
      ].join('\n'),
    }],
  };

  try {
    const text = await nonStreamingGenerate(
      state.apiKey,
      [prompt],
      'You extract user memory as strict JSON only.',
      {
        model: localStorage.getItem(LS.model) || DEFAULTS.model,
        temperature: 0,
        maxTokens: 512,
      }
    );

    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const facts = Array.isArray(parsed.facts) ? parsed.facts.map((f) => String(f).trim()).filter(Boolean) : [];
    if (!facts.length) return;

    const current = new Set(state.memories.map((m) => m.content.toLowerCase()));
    let added = 0;
    for (const fact of facts) {
      if (current.has(fact.toLowerCase())) continue;
      if (boolSetting(LS.incognito, false)) continue;
      await Storage.addMemory(fact, 'auto', state.activeConversationId);
      current.add(fact.toLowerCase());
      added += 1;
    }

    if (added > 0) {
      state.memories = await Storage.getAllMemories();
      renderMemoryPanel();
      renderContextChips();
      toast('Memory updated');
    }
  } catch {
    // Memory extraction should never break chat flow.
  }
}

function renderContextChips() {
  dom.contextChips.innerHTML = '';
  const persona = getActivePersona();

  if (persona.id !== 'default') {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${persona.emoji} ${persona.name}</span><button class="icon-btn" aria-label="Reset persona">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      saveSetting(LS.activePersonaId, 'default');
      renderContextChips();
      toast('Persona reset');
    });
    dom.contextChips.appendChild(chip);
  }
}

async function persistMessage(message) {
  if (boolSetting(LS.incognito, false)) {
    state.incognitoSession.messages.push(message);
    return message;
  }
  const saved = await Storage.addMessage(state.activeConversationId, message);
  broadcastSync('msg_updated', { conversationId: state.activeConversationId });
  return saved;
}

function makeMessage(role, content) {
  return {
    role,
    content,
    timestamp: Date.now(),
  };
}

async function resendLastUser(text, originalTimestamp = null, fromRetry = false) {
  if (!text?.trim() || state.isStreaming) return;

  if (!fromRetry) {
    state.lastUserText = text;
  }

  rebuildConversationHistory();
  await runModelForUserMessage(text, originalTimestamp);
}

async function generateAutoTitle(convId, userMsg, aiMsg) {
  if (!state.apiKey || !convId) return;
  const prompt = `Write a specific 3-6 word title for this conversation. Specific, not generic. No quotes. No period at end.\nUser: "${String(userMsg || '').slice(0, 200)}"\nAI: "${String(aiMsg || '').slice(0, 200)}"\nTitle:`;
  try {
    const title = await nonStreamingGenerate(
      state.apiKey,
      [{ role: 'user', parts: [{ text: prompt }] }],
      'You generate concise, specific conversation titles only.',
      {
        model: localStorage.getItem(LS.model) || DEFAULTS.model,
        maxTokens: 15,
        temperature: 0.2,
      }
    );
    const cleaned = (title || '').trim().replace(/^"|"$/g, '').replace(/\.$/, '').slice(0, 60);
    if (!cleaned) return;
    await Storage.updateConversation(convId, { title: cleaned, updatedAt: Date.now() });
    if (state.activeConversationId === convId) dom.conversationTitle.textContent = cleaned;
    await refreshConversations();
  } catch {
    // Keep fallback title silently.
  }
}

async function runModelForUserMessage(userText, originalTimestamp = null) {
  const cfg = currentConfig();
  const sendStreaming = boolSetting(LS.streaming, DEFAULTS.streaming);
  const systemPrompt = buildSystemPrompt();

  state.isStreaming = true;
  updateSendButtonState();
  const thinking = renderThinking();
  state.pendingAiNode = thinking;
  state.pendingAiText = '';
  _streamBuffer = '';
  _activeBubble = thinking.querySelector('.bubble');

  const callMessages = buildContextForAPI(
    state.conversationHistory.length
      ? state.conversationHistory
      : [{ role: 'user', parts: [{ text: userText }] }],
    50
  );

  return new Promise((resolve) => {

  const done = async (fullText, meta = {}) => {
    state.isStreaming = false;
    updateSendButtonState();

    if (meta.aborted) {
      finalizeStreamingNode(state.pendingAiText);
      if (!state.pendingAiText.trim()) {
        state.pendingAiNode?.remove();
      }
      if (state.pendingAiText.trim()) {
        const partialMsg = makeMessage('model', state.pendingAiText);
        const saved = await persistMessage(partialMsg);
        state.activeMessages.push({ ...partialMsg, id: saved.id || `temp_${Date.now()}` });
      }
      state.pendingAiNode = null;
      state.pendingAiText = '';
      rebuildConversationHistory();
      renderChatMessages();
      await refreshConversations();
      resolve();
      return;
    }

    const text = (fullText || state.pendingAiText || '').trim();
    if (!text) {
      state.pendingAiNode?.remove();
      state.pendingAiNode = null;
      _streamBuffer = '';
      _activeBubble = null;
      resolve();
      return;
    }

    finalizeStreamingNode(text);

    const aiMsg = makeMessage('model', text);
    const saved = await persistMessage(aiMsg);

    state.activeMessages.push({ ...aiMsg, id: saved.id || `temp_${Date.now()}` });
    state.pendingAiNode = null;
    state.pendingAiText = '';

    rebuildConversationHistory();
    renderChatMessages();
    await refreshConversations();

    extractMemory(userText, text);

    const nonSystemMessages = state.activeMessages.filter((m) => m.role === 'user' || m.role === 'model');
    if (!boolSetting(LS.incognito, false) && state.activeConversationId && nonSystemMessages.length === 2) {
      await generateAutoTitle(state.activeConversationId, userText, text);
    }

    resolve();
  };

  const err = async (status, message) => {
    state.isStreaming = false;
    updateSendButtonState();
    state.pendingAiNode?.remove();
    state.pendingAiNode = null;

    let text = message || 'Network error. Check your internet connection.';
    let waitUntil = null;
    if (status === 429) {
      const seconds = Number((message || '').match(/(\d+)\s*s/i)?.[1] || 10);
      waitUntil = Date.now() + (seconds * 1000);
      text = `Rate limit reached. You can retry in ${seconds} seconds.`;
    }

    addSystemMessage(text, {
      text: userText,
      timestamp: originalTimestamp || Date.now(),
      waitUntil,
    });
    resolve();
  };

  if (!sendStreaming) {
    nonStreamingGenerate(state.apiKey, callMessages, systemPrompt, cfg)
      .then((text) => done(text))
      .catch((error) => err(0, error.message));
    return;
  }

    streamMessage(
      state.apiKey,
      callMessages,
      systemPrompt,
      cfg,
      (chunk, full) => {
        state.pendingAiText = full;
        handleStreamChunk(chunk);
      },
      done,
      err
    );
  });
}

async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;

  if (!state.apiKey) {
    toast('API config missing. Add `window.PRIVEX_CONFIG.geminiApiKey` in config.js.', 4200, 'warning');
    return;
  }

  dom.chatInput.value = '';
  resetComposerHeight();
  updateTokenCounter();
  updateSendButtonState();

  if (!navigator.onLine) {
    await createConversationForMessage(text);
    const pendingMsg = makeMessage('user', text);
    pendingMsg.status = 'pending';
    const savedPending = await persistMessage(pendingMsg);
    const pendingWithId = { ...pendingMsg, id: savedPending.id || `pending_${Date.now()}` };
    state.activeMessages.push(pendingWithId);
    state.offlinePending.push({
      text,
      messageId: pendingWithId.id,
      conversationId: state.activeConversationId,
    });
    rebuildConversationHistory();
    renderChatMessages();
    toast('Offline: message queued for send', 2800, 'warning');
    return;
  }

  state.messageQueue.push(text);
  await processMessageQueue();
}

async function processMessageQueue() {
  if (state.isProcessingQueue) return;
  state.isProcessingQueue = true;
  while (state.messageQueue.length > 0) {
    const queued = state.messageQueue.shift();
    await createConversationForMessage(queued);

    const userMessage = makeMessage('user', queued);
    const saved = await persistMessage(userMessage);
    state.activeMessages.push({ ...userMessage, id: saved.id || `temp_${Date.now()}` });
    state.lastUserText = queued;

    rebuildConversationHistory();
    renderChatMessages();
    forceScrollToBottom();
    if (!boolSetting(LS.incognito, false) && state.hasIndexedDB) await refreshConversations();
    await runModelForUserMessage(queued);
  }
  state.isProcessingQueue = false;
}

async function flushOfflinePending() {
  if (!state.offlinePending.length || !navigator.onLine) return;
  toast('Back online: sending queued message...', 2400, 'info');

  while (state.offlinePending.length > 0) {
    const pending = state.offlinePending.shift();
    if (pending.conversationId && pending.conversationId !== state.activeConversationId) {
      await openConversation(pending.conversationId);
    }

    const local = state.activeMessages.find((m) => m.id === pending.messageId);
    if (local) local.status = 'sent';
    if (state.hasIndexedDB && pending.messageId && !boolSetting(LS.incognito, false)) {
      await Storage.updateMessage(pending.messageId, { status: 'sent' });
    }

    rebuildConversationHistory();
    renderChatMessages();
    await runModelForUserMessage(pending.text);
  }
}

async function exportConversationMarkdown(conversationId = state.activeConversationId) {
  if (!conversationId) {
    toast('No conversation selected');
    return;
  }
  const conv = await Storage.getConversation(conversationId);
  const messages = await Storage.getMessages(conversationId);
  const lines = [`# ${conv?.title || 'Conversation'}`, ''];
  for (const msg of messages) {
    const who = msg.role === 'user' ? 'User' : msg.role === 'model' ? 'Privex AI' : 'System';
    lines.push(`## ${who}`);
    lines.push(msg.content || '');
    lines.push('');
  }

  downloadText(`${(conv?.title || 'conversation').replace(/[^a-z0-9-_]+/gi, '_')}.md`, lines.join('\n'));
}

async function shareConversationAsText(conversationId = state.activeConversationId) {
  if (!conversationId) return;
  const conv = await Storage.getConversation(conversationId);
  const messages = await Storage.getMessages(conversationId);
  const lines = [
    '--- Privex AI Conversation ---',
    `Topic: ${conv?.title || 'Conversation'}`,
    `Date: ${new Date().toLocaleDateString()}`,
    '',
  ];

  for (const m of messages) {
    const who = m.role === 'user' ? 'You' : m.role === 'model' ? 'Privex AI' : 'System';
    lines.push(`${who}: ${m.content || ''}`);
    lines.push('');
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Conversation copied as text', 2200, 'success');
  } catch {
    toast('Clipboard blocked. Use Export instead.', 2800, 'warning');
  }
}

async function shareConversationAsHtml(conversationId = state.activeConversationId) {
  if (!conversationId) return;
  const conv = await Storage.getConversation(conversationId);
  const messages = await Storage.getMessages(conversationId);
  const body = messages.map((m) => {
    const who = m.role === 'user' ? 'You' : m.role === 'model' ? 'Privex AI' : 'System';
    const content = String(m.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return `<section><h3>${who}</h3><p>${content}</p></section>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${conv?.title || 'Privex Conversation'}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:840px;margin:24px auto;padding:0 16px;line-height:1.6}section{border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin:12px 0}h1,h3{margin:0 0 8px}h3{font-size:15px;color:#333}p{margin:0;white-space:normal;word-break:break-word}</style></head><body><h1>${conv?.title || 'Conversation'}</h1>${body}</body></html>`;
  try {
    await navigator.clipboard.writeText(html);
    toast('Conversation HTML copied', 2200, 'success');
  } catch {
    toast('Clipboard blocked. Use Export instead.', 2800, 'warning');
  }
}

function downloadText(name, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openSettings(triggerEl) {
  state.settingsTrigger = triggerEl || document.activeElement;
  dom.settingsPanel.classList.add('open');
  dom.settingsPanel.focus();
}

function closeSettings() {
  dom.settingsPanel.classList.remove('open');
  state.settingsTrigger?.focus?.();
}

function openMemory(triggerEl) {
  state.memoryTrigger = triggerEl || document.activeElement;
  dom.memoryPanel.classList.add('open');
  dom.memoryPanel.focus();
  renderMemoryPanel();
}

function closeMemory() {
  dom.memoryPanel.classList.remove('open');
  state.memoryTrigger?.focus?.();
}

async function renderMemoryPanel() {
  state.memories = await Storage.getAllMemories();
  dom.memoryCount.textContent = `${state.memories.length} items`;

  const activeTokens = state.memories.filter((m) => m.isActive).reduce((sum, m) => sum + estimateTokens(m.content), 0);
  dom.memoryUsage.textContent = `Total memory usage: ~${activeTokens} tokens per request`;

  dom.memoryList.innerHTML = '';
  for (const mem of state.memories) {
    const card = document.createElement('div');
    card.className = `memory-card ${mem.isActive ? '' : 'off'}`;
    card.innerHTML = `
      <div>${mem.content}</div>
      <div class="muted">From: ${mem.source || 'manual'} · ${new Date(mem.createdAt).toLocaleDateString()}</div>
      <div class="memory-actions">
        <button class="btn btn-outline" data-action="toggle">${mem.isActive ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-outline" data-action="edit">Edit</button>
        <button class="btn btn-danger" data-action="delete">Delete</button>
      </div>
    `;

    card.addEventListener('click', async (e) => {
      const action = e.target?.dataset?.action;
      if (!action) return;
      if (action === 'toggle') {
        await Storage.updateMemory(mem.id, { isActive: !mem.isActive });
      }
      if (action === 'edit') {
        const next = await uiPrompt('Edit memory', mem.content, 'Edit memory', 'Save');
        if (!next?.trim()) return;
        await Storage.updateMemory(mem.id, { content: next.trim() });
      }
      if (action === 'delete') {
        if (!await uiConfirm('Delete this memory?', 'Delete memory', 'Delete')) return;
        await Storage.deleteMemory(mem.id);
      }
      state.memories = await Storage.getAllMemories();
      renderMemoryPanel();
      renderContextChips();
    });

    dom.memoryList.appendChild(card);
  }
}

function wirePersonaPicker() {
  if (!dom.personaPickerBtn) return;
  dom.personaPickerBtn.addEventListener('click', async () => {
    const createHint = 'Type "new" to create a custom persona.';
    const list = state.personas
      .map((p, i) => `${i + 1}. ${p.emoji} ${p.name}`)
      .join('\n');
    const answer = await uiPrompt(`Select persona by number:\n${list}\n\n${createHint}`, '', 'Persona selection', 'Continue');
    if (!answer) return;

    if (answer.trim().toLowerCase() === 'new') {
      const name = await uiPrompt('Persona name', '', 'Create persona', 'Next');
      if (!name?.trim()) return;
      const emoji = ((await uiPrompt('Emoji (optional)', '🎭', 'Create persona', 'Next')) || '🎭').trim().slice(0, 2) || '🎭';
      const color = ((await uiPrompt('Color hex (optional)', '#6366f1', 'Create persona', 'Next')) || '#6366f1').trim() || '#6366f1';
      const systemPrompt = await uiPrompt('System prompt', '', 'Create persona', 'Create');
      if (!systemPrompt?.trim()) return;

      const created = await Storage.createPersona({
        name: name.trim(),
        emoji,
        color,
        systemPrompt: systemPrompt.trim(),
      });
      state.personas = await Storage.getPersonas();
      saveSetting(LS.activePersonaId, created.id);
      renderContextChips();
      toast(`Created persona: ${created.name}`);
      return;
    }

    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.personas.length) return;
    const persona = state.personas[idx];
    saveSetting(LS.activePersonaId, persona.id);
    if (!boolSetting(LS.incognito, false) && state.activeConversationId) {
      await Storage.updateConversation(state.activeConversationId, { systemPromptId: persona.id });
    }
    renderContextChips();
    toast(`Persona: ${persona.name}`);
  });
}

function openCommandPalette() {
  dom.commandPaletteOverlay.classList.remove('hidden');
  dom.commandInput.value = '';
  buildCommandItems('');
  renderCommandResults();
  dom.commandInput.focus();
}

function closeCommandPalette() {
  dom.commandPaletteOverlay.classList.add('hidden');
}

function maybeShowChangelog() {
  const lastSeen = localStorage.getItem(LS.lastSeenVersion) || '';
  if (lastSeen === APP_VERSION) {
    dom.changelogOverlay.classList.add('hidden');
    return;
  }
  dom.changelogOverlay.classList.remove('hidden');
}

function closeChangelog() {
  dom.changelogOverlay.classList.add('hidden');
  saveSetting(LS.lastSeenVersion, APP_VERSION);
}

function applyPromptTemplate(templateText) {
  dom.chatInput.value = templateText;
  updateTokenCounter();
  resetComposerHeight();
  dom.chatInput.focus();
}

function buildCommandItems(query) {
  const q = (query || '').trim().toLowerCase();
  const actions = [
    { type: 'action', label: 'New Chat', run: () => createNewConversationAndFocus() },
    { type: 'action', label: 'Open Settings', run: () => openSettings(dom.openSettingsBtn) },
    { type: 'action', label: 'Open Memory', run: () => openMemory(dom.openMemoryBtn) },
    { type: 'action', label: 'Open Pinboard', run: () => openPinboard(dom.openPinboardBtn) },
    { type: 'action', label: 'Export Current Conversation', run: () => exportConversationMarkdown() },
    { type: 'action', label: "What's New", run: () => dom.changelogOverlay.classList.remove('hidden') },
    { type: 'action', label: 'Toggle Theme', run: () => toggleThemeQuick() },
  ];

  const recents = state.conversations.slice(0, 5).map((c) => ({
    type: 'conversation',
    label: c.title,
    run: () => openConversation(c.id),
  }));

  const templates = PROMPT_TEMPLATES.map((tpl) => ({
    type: 'template',
    label: tpl.label,
    run: () => applyPromptTemplate(tpl.value),
  }));

  const all = [...actions, ...templates, ...recents];
  state.commandItems = q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all;
  state.commandIndex = 0;
}

function renderCommandResults() {
  dom.commandResults.innerHTML = '';
  state.commandItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = `command-item${index === state.commandIndex ? ' active' : ''}`;
    row.textContent = item.label;
    row.addEventListener('click', () => {
      item.run();
      closeCommandPalette();
    });
    dom.commandResults.appendChild(row);
  });
}

function toggleThemeQuick() {
  const current = localStorage.getItem(LS.theme) || DEFAULTS.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  saveSetting(LS.theme, next);
  applyTheme(next);
  markSegment(dom.themeSegment, next);
}

async function createNewConversationAndFocus() {
  if (state.newChatLock) return;
  state.newChatLock = true;
  try {
  if (boolSetting(LS.incognito, false)) {
    state.incognitoSession = {
      id: `incog_${Date.now()}`,
      title: 'Incognito Conversation',
      messages: [],
      personaId: localStorage.getItem(LS.activePersonaId) || 'default',
    };
    useIncognitoSession();
    dom.chatInput.focus();
    return;
  }

  if (Date.now() - state.lastConversationCreatedAt < 500) return;

  const conv = await Storage.createConversation({
    title: 'New Conversation',
    model: localStorage.getItem(LS.model) || DEFAULTS.model,
    systemPromptId: localStorage.getItem(LS.activePersonaId) || 'default',
  });
  state.lastConversationCreatedAt = Date.now();
  await refreshConversations();
  await openConversation(conv.id);
  dom.chatInput.focus();
  } finally {
    state.newChatLock = false;
  }
}

async function updateStorageStats() {
  const stats = await Storage.getStats();
  const allMessages = await Storage.getAllMessages();
  const convCount = Math.max(1, stats.convCount);
  const avgPerConversation = (stats.msgCount / convCount).toFixed(1);
  const starredCount = allMessages.filter((m) => m.isStarred).length;
  const pinnedCount = allMessages.filter((m) => m.isPinned).length;
  const pendingCount = allMessages.filter((m) => m.status === 'pending').length;
  const lastActivity = allMessages.length ? new Date(allMessages[allMessages.length - 1].timestamp).toLocaleString() : 'No activity yet';

  dom.storageStats.innerHTML = [
    `Conversations: ${stats.convCount}    Messages: ${stats.msgCount}    Memories: ${stats.memCount}`,
    `Avg messages/conversation: ${avgPerConversation}    Starred: ${starredCount}    Pinned: ${pinnedCount}`,
    `Pending queued messages: ${pendingCount}    Est. storage: ${stats.estimatedMB} MB`,
    `Last local activity: ${lastActivity}`,
    'Data stored locally: conversations, messages, memories.',
    'Data sent to Gemini API: conversation content for model processing only.',
    'Data sent to us: none (no analytics, no tracking, no servers).',
  ].map((line) => `<div>${line}</div>`).join('');
}

function bindEventListeners() {
  let _newChatCreating = false;
  dom.newChatBtn.addEventListener('click', async () => {
    if (_newChatCreating) return;
    _newChatCreating = true;
    try {
      await createNewConversationAndFocus();
    } finally {
      setTimeout(() => { _newChatCreating = false; }, 600);
    }
  });
  dom.sendBtn.addEventListener('click', () => {
    if (state.isStreaming) {
      stopStreaming();
      return;
    }
    sendMessage();
  });

  dom.chatInput.addEventListener('input', () => {
    autoGrowInput();
    updateTokenCounter();
    updateSendButtonState();
  });

  dom.chatInput.addEventListener('keydown', (e) => {
    const sendOnEnter = boolSetting(LS.sendOnEnter, DEFAULTS.sendOnEnter);
    if (e.key === 'Enter' && !e.shiftKey && sendOnEnter) {
      e.preventDefault();
      sendMessage();
      return;
    }

    if (e.key === 'ArrowUp' && !dom.chatInput.value.trim()) {
      const lastUser = [...state.activeMessages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        dom.chatInput.value = lastUser.content;
        autoGrowInput();
        updateTokenCounter();
        updateSendButtonState();
      }
    }
  });

  dom.attachBtn.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', async () => {
    const file = dom.fileInput.files?.[0];
    dom.fileInput.value = '';
    if (!file) return;
    if (file.size > 100 * 1024) {
      toast('File too large. Max 100KB.');
      return;
    }
    const text = await file.text();
    const ext = (file.name.split('.').pop() || 'txt').toLowerCase();
    const content = `[File: ${file.name}]\n\n\`\`\`${ext}\n${text}\n\`\`\`\n`;
    dom.chatInput.value = `${content}${dom.chatInput.value}`;
    dom.chatInput.focus();
    autoGrowInput();
    updateTokenCounter();
    updateSendButtonState();
  });

  dom.voiceBtn.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Voice input requires Chrome or Edge.');
      return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    dom.voiceBtn.classList.add('streaming');
    recognition.onresult = (ev) => {
      const transcript = [...ev.results].map((r) => r[0].transcript).join(' ');
      dom.chatInput.value = transcript;
      autoGrowInput();
      updateTokenCounter();
      updateSendButtonState();
    };
    recognition.onend = () => dom.voiceBtn.classList.remove('streaming');
    recognition.start();
  });

  dom.jumpToBottomBtn.addEventListener('click', () => {
    forceScrollToBottom();
    updateJumpButton();
  });

  dom.chatThread.addEventListener('scroll', updateJumpButton);

  dom.openSettingsBtn.addEventListener('click', () => openSettings(dom.openSettingsBtn));
  dom.closeSettingsBtn.addEventListener('click', closeSettings);
  dom.openMemoryBtn.addEventListener('click', () => openMemory(dom.openMemoryBtn));
  if (dom.openStarredBtn) dom.openStarredBtn.addEventListener('click', () => openStarred(dom.openStarredBtn));
  if (dom.openPinboardBtn) dom.openPinboardBtn.addEventListener('click', () => openPinboard(dom.openPinboardBtn));
  dom.openMemoryManagerBtn.addEventListener('click', () => openMemory(dom.openMemoryManagerBtn));
  dom.closeMemoryBtn.addEventListener('click', closeMemory);
  if (dom.closeStarredBtn) dom.closeStarredBtn.addEventListener('click', closeStarred);
  if (dom.closePinboardBtn) dom.closePinboardBtn.addEventListener('click', closePinboard);

  dom.folderFilterSelect.addEventListener('change', (e) => {
    state.activeFolderFilter = e.target.value;
    saveSetting(LS.activeFolderFilter, state.activeFolderFilter);
    renderConversationList();
  });

  dom.manageFoldersBtn.addEventListener('click', () => {
    if (!state.activeConversationId) {
      toast('Open a conversation first, then assign a folder.', 2400, 'info');
      return;
    }
    uiPrompt('Create folder name', '', 'Create folder', 'Create').then((next) => {
      if (!next?.trim()) return;
      const clean = next.trim();
      setConversationFolder(state.activeConversationId, clean);
      toast(`Current chat moved to ${clean}`, 2200, 'success');
      renderFolderFilterOptions();
      renderConversationList();
    });
  });

  dom.exportAllBtn.addEventListener('click', async () => {
    const json = await Storage.exportAll();
    downloadText(`privex-ai-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
  });

  dom.themeSegment.addEventListener('click', (e) => {
    const value = e.target?.dataset?.value;
    if (!value) return;
    saveSetting(LS.theme, value);
    applyTheme(value);
    markSegment(dom.themeSegment, value);
  });

  dom.fontSegment.addEventListener('click', (e) => {
    const value = e.target?.dataset?.value;
    if (!value) return;
    saveSetting(LS.font, value);
    applyFontSize(value);
    markSegment(dom.fontSegment, value);
  });

  dom.widthSegment.addEventListener('click', (e) => {
    const value = e.target?.dataset?.value;
    if (!value) return;
    saveSetting(LS.width, value);
    applyWidth(value);
    markSegment(dom.widthSegment, value);
  });

  dom.modelSelect.addEventListener('change', (e) => {
    saveSetting(LS.model, e.target.value);
    dom.settingsModelSelect.value = e.target.value;
    updateConversationMeta();
  });

  dom.settingsModelSelect.addEventListener('change', (e) => {
    saveSetting(LS.model, e.target.value);
    dom.modelSelect.value = e.target.value;
    updateConversationMeta();
  });

  dom.tempSlider.addEventListener('input', (e) => {
    saveSetting(LS.temperature, e.target.value);
    dom.tempValue.textContent = e.target.value;
  });

  dom.maxTokensSelect.addEventListener('change', (e) => saveSetting(LS.maxTokens, e.target.value));
  dom.responseFormatSelect.addEventListener('change', (e) => saveSetting(LS.responseFormat, e.target.value));
  dom.sendOnEnterToggle.addEventListener('change', (e) => saveSetting(LS.sendOnEnter, e.target.checked));
  dom.showTokenToggle.addEventListener('change', (e) => {
    saveSetting(LS.showToken, e.target.checked);
    dom.tokenCount.classList.toggle('hidden', !e.target.checked);
  });
  dom.showTimestampsToggle.addEventListener('change', (e) => saveSetting(LS.showTimestamps, e.target.checked));
  dom.streamingToggle.addEventListener('change', (e) => saveSetting(LS.streaming, e.target.checked));
  dom.memoryEnabledToggle.addEventListener('change', (e) => {
    saveSetting(LS.memoryEnabled, e.target.checked);
    dom.memoryMasterToggle.checked = e.target.checked;
    dom.memoryChip?.classList.toggle('active', e.target.checked);
    renderContextChips();
  });
  dom.memoryMasterToggle.addEventListener('change', (e) => {
    saveSetting(LS.memoryEnabled, e.target.checked);
    dom.memoryEnabledToggle.checked = e.target.checked;
    dom.memoryChip?.classList.toggle('active', e.target.checked);
    renderContextChips();
  });

  dom.clearMemoryBtn.addEventListener('click', async () => {
    if (!await uiConfirm('Clear all memories?', 'Clear memory', 'Clear')) return;
    await Storage.clearAllMemories();
    state.memories = [];
    renderMemoryPanel();
    renderContextChips();
  });

  dom.incognitoToggle.addEventListener('change', async (e) => {
    const next = e.target.checked;
    const current = boolSetting(LS.incognito, DEFAULTS.incognito);
    if (current && !next && state.incognitoSession.messages.length) {
      const shouldSave = await uiConfirm('Save this incognito conversation?', 'Exit incognito', 'Save');
      if (shouldSave) {
        const conv = await Storage.createConversation({
          title: state.incognitoSession.title,
          model: localStorage.getItem(LS.model) || DEFAULTS.model,
          systemPromptId: localStorage.getItem(LS.activePersonaId) || 'default',
        });
        for (const msg of state.incognitoSession.messages) {
          await Storage.addMessage(conv.id, {
            role: msg.role,
            content: msg.content,
            reaction: msg.reaction || null,
            isStarred: !!msg.isStarred,
            isPinned: !!msg.isPinned,
            isEdited: !!msg.isEdited,
            editHistory: msg.editHistory || [],
            timestamp: msg.timestamp,
          });
        }
        state.incognitoSession = { id: null, title: 'Incognito Conversation', messages: [], personaId: 'default' };
        await refreshConversations();
        await openConversation(conv.id);
      }
    }

    saveSetting(LS.incognito, next);
    setIncognitoButton(next);
    if (next) useIncognitoSession();
    else if (state.activeConversationId) await openConversation(state.activeConversationId);
    else await createNewConversationAndFocus();
  });

  dom.incognitoChip?.addEventListener('click', () => {
    dom.incognitoToggle.checked = !dom.incognitoToggle.checked;
    dom.incognitoToggle.dispatchEvent(new Event('change'));
  });

  dom.memoryChip?.addEventListener('click', () => {
    dom.memoryEnabledToggle.checked = !dom.memoryEnabledToggle.checked;
    dom.memoryEnabledToggle.dispatchEvent(new Event('change'));
  });

  dom.clearConversationsBtn.addEventListener('click', async () => {
    if (!await uiConfirm('Clear all conversations?', 'Clear conversations', 'Clear')) return;
    const all = await Storage.getAllConversations();
    for (const c of all) await Storage.deleteConversation(c.id);
    state.folderMap = {};
    saveJsonSetting(LS.folderMap, state.folderMap);
    state.activeConversationId = null;
    saveSetting(LS.activeConvId, '');
    state.activeMessages = [];
    renderChatMessages();
    await refreshConversations();
    await updateStorageStats();
  });

  dom.resetAppBtn.addEventListener('click', async () => {
    if (!await uiConfirm('Reset app? This clears local data.', 'Reset app', 'Reset')) return;
    await Storage.clearEverything();
    const preserve = ['privexai_theme', 'privexai_accent_color'];
    const keep = new Map();
    preserve.forEach((k) => keep.set(k, localStorage.getItem(k)));
    localStorage.clear();
    keep.forEach((v, k) => { if (v != null) localStorage.setItem(k, v); });
    window.location.reload();
  });

  dom.importBtn.addEventListener('click', () => dom.importInput.click());
  dom.importInput.addEventListener('change', async () => {
    const file = dom.importInput.files?.[0];
    dom.importInput.value = '';
    if (!file) return;
    const text = await file.text();
    const result = await Storage.importAll(text);
    toast(`Imported: ${result.imported}, skipped: ${result.skipped}`);
    await refreshConversations();
    await updateStorageStats();
  });

  dom.conversationTitle.addEventListener('click', () => {
    if (boolSetting(LS.incognito, false)) return;
    dom.conversationTitleInput.classList.remove('hidden');
    dom.conversationTitle.classList.add('hidden');
    dom.conversationTitleInput.value = dom.conversationTitle.textContent;
    dom.conversationTitleInput.focus();
  });

  async function commitTitleEdit() {
    const title = dom.conversationTitleInput.value.trim() || 'Conversation';
    dom.conversationTitle.textContent = title;
    dom.conversationTitle.classList.remove('hidden');
    dom.conversationTitleInput.classList.add('hidden');
    if (state.activeConversationId) {
      await Storage.updateConversation(state.activeConversationId, { title, updatedAt: Date.now() });
      await refreshConversations();
    }
  }

  dom.conversationTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitTitleEdit();
    if (e.key === 'Escape') {
      dom.conversationTitleInput.classList.add('hidden');
      dom.conversationTitle.classList.remove('hidden');
    }
  });
  dom.conversationTitleInput.addEventListener('blur', commitTitleEdit);

  dom.conversationSearch.addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    dom.clearSearchBtn.classList.toggle('hidden', !q);

    if (!q) {
      renderConversationList(state.conversations);
      return;
    }

    const quick = state.conversations.filter((c) =>
      (c.title || '').toLowerCase().includes(q.toLowerCase()) ||
      (c.lastPreview || '').toLowerCase().includes(q.toLowerCase())
    );
    renderConversationList(quick);

    clearTimeout(dom.conversationSearch._timer);
    dom.conversationSearch._timer = setTimeout(async () => {
      const deep = await Storage.searchConversations(q);
      renderConversationList(deep);
      if (!deep.length) {
        dom.conversationList.innerHTML = `<div class="muted" style="padding:10px;">No results for '${q}'</div>`;
      }
    }, 300);
  });

  dom.clearSearchBtn.addEventListener('click', () => {
    dom.conversationSearch.value = '';
    dom.clearSearchBtn.classList.add('hidden');
    renderConversationList(state.conversations);
  });

  dom.chatSearchBtn.addEventListener('click', () => {
    dom.chatSearchBar.classList.toggle('hidden');
    if (!dom.chatSearchBar.classList.contains('hidden')) dom.chatSearchInput.focus();
  });

  function clearChatSearchHighlights() {
    state.searchMatches = [];
    state.activeSearchIndex = 0;
    dom.chatThread.querySelectorAll('.bubble[data-search-original]').forEach((bubble) => {
      bubble.innerHTML = bubble.dataset.searchOriginal;
      delete bubble.dataset.searchOriginal;
      applyHighlighting(bubble);
      wireCodeCopy(bubble);
    });
  }

  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightBubbleText(bubble, query) {
    if (!bubble.dataset.searchOriginal) bubble.dataset.searchOriginal = bubble.innerHTML;
    const original = bubble.dataset.searchOriginal;
    const replaced = original.replace(new RegExp(escapeRegex(query), 'gi'), (match) => `<mark class="chat-mark">${match}</mark>`);
    bubble.innerHTML = replaced;
    const marks = [...bubble.querySelectorAll('mark.chat-mark')];
    return marks;
  }

  function runChatSearch(step = 0) {
    const q = dom.chatSearchInput.value.trim().toLowerCase();
    clearChatSearchHighlights();
    if (!q) {
      dom.chatSearchCount.textContent = '';
      return;
    }

    const bubbles = [...dom.chatThread.querySelectorAll('.message .bubble')];
    for (const bubble of bubbles) {
      const marks = highlightBubbleText(bubble, q);
      for (const mark of marks) state.searchMatches.push(mark);
    }

    const total = state.searchMatches.length;
    if (!total) {
      dom.chatSearchCount.textContent = '0 matches';
      return;
    }

    state.activeSearchIndex = (state.activeSearchIndex + step + total) % total;
    const current = state.searchMatches[state.activeSearchIndex];
    current.classList.add('search-hit');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    dom.chatSearchCount.textContent = `${state.activeSearchIndex + 1} of ${total} matches`;
  }

  dom.chatSearchInput.addEventListener('input', () => {
    state.activeSearchIndex = 0;
    runChatSearch(0);
  });
  dom.chatSearchNext.addEventListener('click', () => runChatSearch(1));
  dom.chatSearchPrev.addEventListener('click', () => runChatSearch(-1));
  dom.chatSearchClose.addEventListener('click', () => {
    dom.chatSearchBar.classList.add('hidden');
    dom.chatSearchInput.value = '';
    clearChatSearchHighlights();
    dom.chatSearchCount.textContent = '';
  });

  dom.chatMenuBtn.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const model = localStorage.getItem(LS.model) || DEFAULTS.model;
    openMenu(
      [
        {
          id: 'persona-open',
          label: 'Persona',
          run: () => dom.personaPickerBtn?.click(),
        },
        {
          id: 'model-mini',
          label: `${model === 'gemini-2.0-flash' ? '✓ ' : ''}Model: Gemini 2.0 Flash`,
          run: () => {
            dom.modelSelect.value = 'gemini-2.0-flash';
            dom.modelSelect.dispatchEvent(new Event('change'));
          },
        },
        {
          id: 'model-4o',
          label: `${model === 'gemini-2.5-pro' ? '✓ ' : ''}Model: Gemini 2.5 Pro`,
          run: () => {
            dom.modelSelect.value = 'gemini-2.5-pro';
            dom.modelSelect.dispatchEvent(new Event('change'));
          },
        },
        {
          id: 'model-41-mini',
          label: `${model === 'gemini-1.5-pro' ? '✓ ' : ''}Model: Gemini 1.5 Pro`,
          run: () => {
            dom.modelSelect.value = 'gemini-1.5-pro';
            dom.modelSelect.dispatchEvent(new Event('change'));
          },
        },
        {
          id: 'model-41',
          label: `${model === 'gemini-1.5-flash' ? '✓ ' : ''}Model: Gemini 1.5 Flash`,
          run: () => {
            dom.modelSelect.value = 'gemini-1.5-flash';
            dom.modelSelect.dispatchEvent(new Event('change'));
          },
        },
        {
          id: 'copy-current-conv-text',
          label: 'Copy as plain text',
          run: () => shareConversationAsText(),
        },
        {
          id: 'copy-current-conv-html',
          label: 'Copy as HTML',
          run: () => shareConversationAsHtml(),
        },
        {
          id: 'export-current-conv',
          label: 'Export conversation',
          run: () => exportConversationMarkdown(),
        },
        {
          id: 'clear-current-conv',
          label: 'Clear conversation',
          run: async () => {
            if (!state.activeConversationId) return;
            if (!await uiConfirm('Clear all messages in this conversation?', 'Clear conversation', 'Clear')) return;
            const msgs = await Storage.getMessages(state.activeConversationId);
            for (const m of msgs) await Storage.deleteMessage(m.id);
            await Storage.updateConversation(state.activeConversationId, { messageCount: 0, lastPreview: '', updatedAt: Date.now() });
            await openConversation(state.activeConversationId);
            await refreshConversations();
          },
        },
        {
          id: 'duplicate-current-conv',
          label: 'Duplicate conversation',
          run: async () => {
            if (!state.activeConversationId) return;
            const conv = await Storage.getConversation(state.activeConversationId);
            if (!conv) return;
            const messages = await Storage.getMessages(conv.id);
            const copy = await Storage.createConversation({
              title: `${conv.title} (copy)`,
              model: conv.model,
              systemPromptId: conv.systemPromptId,
            });
            for (const m of messages) {
              await Storage.addMessage(copy.id, {
                role: m.role,
                content: m.content,
                reaction: m.reaction,
                isStarred: m.isStarred,
                isPinned: m.isPinned,
                isEdited: m.isEdited,
                editHistory: m.editHistory,
              });
            }
            await refreshConversations();
            await openConversation(copy.id);
            toast('Conversation duplicated');
          },
        },
        {
          id: 'new-chat-from-header',
          label: 'New chat',
          run: () => createNewConversationAndFocus(),
        },
      ],
      rect
    );
  });

  dom.chatMenu.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.action;
    if (!action) return;
    const fn = state.menuActionMap[action];
    closeMenus();
    if (fn) await fn();
  });

  dom.closeChangelogBtn?.addEventListener('click', closeChangelog);
  dom.changelogOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.changelogOverlay) closeChangelog();
  });

  dom.collapseSidebarBtn.addEventListener('click', () => {
    dom.sidebar.classList.add('collapsed');
    dom.expandSidebarBtn.classList.remove('hidden');
    saveSetting(LS.sidebarOpen, false);
  });

  dom.expandSidebarBtn.addEventListener('click', () => {
    dom.sidebar.classList.remove('collapsed');
    dom.expandSidebarBtn.classList.add('hidden');
    saveSetting(LS.sidebarOpen, true);
  });

  dom.mobileMenuBtn.addEventListener('click', () => {
    dom.sidebar.classList.add('mobile-open');
    dom.mobileBackdrop.classList.remove('hidden');
  });

  dom.mobileBackdrop.addEventListener('click', () => {
    dom.sidebar.classList.remove('mobile-open');
    dom.mobileBackdrop.classList.add('hidden');
  });

  dom.commandInput.addEventListener('input', () => {
    buildCommandItems(dom.commandInput.value);
    renderCommandResults();
  });

  dom.commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.commandIndex = Math.min(state.commandItems.length - 1, state.commandIndex + 1);
      renderCommandResults();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.commandIndex = Math.max(0, state.commandIndex - 1);
      renderCommandResults();
    }
    if (e.key === 'Enter') {
      const item = state.commandItems[state.commandIndex];
      if (!item) return;
      item.run();
      closeCommandPalette();
    }
    if (e.key === 'Escape') closeCommandPalette();
  });

  dom.commandPaletteOverlay.addEventListener('click', (e) => {
    if (e.target === dom.commandPaletteOverlay) closeCommandPalette();
  });

  window.addEventListener('online', () => {
    flushOfflinePending();
  });

  window.addEventListener('offline', () => {
    toast('You are offline. Messages will be queued.', 2600, 'warning');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu') && !e.target.closest('.conv-item-menu') && e.target !== dom.chatMenuBtn) closeMenus();
  });

  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      closeSettings();
      closeMemory();
      closeStarred();
      closePinboard();
      closeCommandPalette();
      closeMenus();
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createNewConversationAndFocus();
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      const target = e.target;
      const insideChat = target === dom.chatInput || dom.chatThread.contains(target) || target.closest?.('.chat-panel');
      if (insideChat) {
        e.preventDefault();
        dom.chatSearchBar.classList.remove('hidden');
        dom.chatSearchInput.focus();
      }
    }

    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      openSettings(dom.openSettingsBtn);
    }

    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleThemeQuick();
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      exportConversationMarkdown();
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      const lastAi = [...state.activeMessages].reverse().find((m) => m.role === 'model');
      if (lastAi) regenerateMessage(lastAi);
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      const lastAi = [...state.activeMessages].reverse().find((m) => m.role === 'model');
      if (lastAi) {
        await navigator.clipboard.writeText(lastAi.content || '');
        showToast('success', 'Copied to clipboard');
      }
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const lastAi = [...state.activeMessages].reverse().find((m) => m.role === 'model');
      if (lastAi) handleMessageAction('star', lastAi);
    }

    if (e.ctrlKey && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      const idx = Number(e.key) - 1;
      if (state.personas[idx]) {
        saveSetting(LS.activePersonaId, state.personas[idx].id);
        renderContextChips();
        toast(`Persona: ${state.personas[idx].name}`);
      }
    }
  });
}

function collectDomRefs() {
  Object.assign(dom, {
    sidebar: $('sidebar'),
    collapseSidebarBtn: $('collapseSidebarBtn'),
    expandSidebarBtn: $('expandSidebarBtn'),
    newChatBtn: $('newChatBtn'),
    conversationList: $('conversationList'),
    conversationSearch: $('conversationSearch'),
    clearSearchBtn: $('clearSearchBtn'),
    folderFilterSelect: $('folderFilterSelect'),
    manageFoldersBtn: $('manageFoldersBtn'),
    openSettingsBtn: $('openSettingsBtn'),
    openMemoryBtn: $('openMemoryBtn'),
    openStarredBtn: $('openStarredBtn'),
    openPinboardBtn: $('openPinboardBtn'),
    exportAllBtn: $('exportAllBtn'),
    chatThread: $('chatThread'),
    welcomeState: $('welcomeState'),
    jumpToBottomBtn: $('jumpToBottomBtn'),
    chatInput: $('chatInput'),
    sendBtn: $('sendBtn'),
    attachBtn: $('attachBtn'),
    voiceBtn: $('voiceBtn'),
    fileInput: $('fileInput'),
    tokenCount: $('tokenCount'),
    memoryChip: $('memoryChip'),
    incognitoChip: $('incognitoChip'),
    modelInfo: $('modelInfo'),
    contextChips: $('contextChips'),
    modelSelect: $('modelSelect'),
    personaPickerBtn: $('personaPickerBtn'),
    conversationTitle: $('conversationTitle'),
    conversationMeta: $('conversationMeta'),
    conversationTitleInput: $('conversationTitleInput'),
    chatSearchBtn: $('chatSearchBtn'),
    chatSearchBar: $('chatSearchBar'),
    chatSearchInput: $('chatSearchInput'),
    chatSearchCount: $('chatSearchCount'),
    chatSearchPrev: $('chatSearchPrev'),
    chatSearchNext: $('chatSearchNext'),
    chatSearchClose: $('chatSearchClose'),
    chatMenuBtn: $('chatMenuBtn'),
    chatMenu: $('chatMenu'),
    mobileMenuBtn: $('mobileMenuBtn'),
    mobileBackdrop: $('mobileBackdrop'),

    settingsPanel: $('settingsPanel'),
    closeSettingsBtn: $('closeSettingsBtn'),
    apiKeyInput: $('apiKeyInput'),
    toggleApiKeyBtn: $('toggleApiKeyBtn'),
    updateApiKeyBtn: $('updateApiKeyBtn'),
    testApiBtn: $('testApiBtn'),
    themeSegment: $('themeSegment'),
    accentSwatches: $('accentSwatches'),
    fontSegment: $('fontSegment'),
    widthSegment: $('widthSegment'),
    showTimestampsToggle: $('showTimestampsToggle'),
    sendOnEnterToggle: $('sendOnEnterToggle'),
    showTokenToggle: $('showTokenToggle'),
    settingsModelSelect: $('settingsModelSelect'),
    tempSlider: $('tempSlider'),
    tempValue: $('tempValue'),
    maxTokensSelect: $('maxTokensSelect'),
    responseFormatSelect: $('responseFormatSelect'),
    streamingToggle: $('streamingToggle'),
    memoryEnabledToggle: $('memoryEnabledToggle'),
    openMemoryManagerBtn: $('openMemoryManagerBtn'),
    clearMemoryBtn: $('clearMemoryBtn'),
    incognitoToggle: $('incognitoToggle'),
    storageStats: $('storageStats'),
    importBtn: $('importBtn'),
    importInput: $('importInput'),
    clearConversationsBtn: $('clearConversationsBtn'),
    resetAppBtn: $('resetAppBtn'),

    memoryPanel: $('memoryPanel'),
    closeMemoryBtn: $('closeMemoryBtn'),
    memoryMasterToggle: $('memoryMasterToggle'),
    memoryCount: $('memoryCount'),
    addMemoryBtn: $('addMemoryBtn'),
    memoryList: $('memoryList'),
    memoryUsage: $('memoryUsage'),

    starredPanel: $('starredPanel'),
    closeStarredBtn: $('closeStarredBtn'),
    starredList: $('starredList'),

    pinboardPanel: $('pinboardPanel'),
    closePinboardBtn: $('closePinboardBtn'),
    pinboardList: $('pinboardList'),

    commandPaletteOverlay: $('commandPaletteOverlay'),
    commandInput: $('commandInput'),
    commandResults: $('commandResults'),

    changelogOverlay: $('changelogOverlay'),
    closeChangelogBtn: $('closeChangelogBtn'),

    setupOverlay: $('setupOverlay'),
    setupStep1: $('setupStep1'),
    setupStep2: $('setupStep2'),
    setupStep3: $('setupStep3'),
    setupNameInput: $('setupNameInput'),
    setupThemeSegment: $('setupThemeSegment'),
    setupFinish: $('setupFinish'),

    toastContainer: $('toastContainer'),
  });
}

function showSetupStep(step) {
  if (dom.setupStep1) dom.setupStep1.classList.toggle('hidden', step !== 1);
  if (dom.setupStep2) dom.setupStep2.classList.toggle('hidden', step !== 2);
  if (dom.setupStep3) dom.setupStep3.classList.toggle('hidden', step !== 3);
}

function bindSetupFlow() {
  dom.setupThemeSegment?.addEventListener('click', (e) => {
    const value = e.target?.dataset?.value;
    if (!value) return;
    saveSetting(LS.theme, value);
    applyTheme(value);
    [...dom.setupThemeSegment.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b.dataset.value === value));
  });

  dom.setupFinish?.addEventListener('click', () => {
    const name = dom.setupNameInput.value.trim();
    if (name) saveSetting(LS.userName, name);
    saveSetting(LS.setupComplete, true);
    dom.setupOverlay.classList.add('hidden');
    updateWelcomeHeading();
    toast('Welcome to Privex AI');
  });
}

async function initData() {
  try {
    await Storage.init();
    state.hasIndexedDB = true;
  } catch (error) {
    state.hasIndexedDB = false;
    saveSetting(LS.incognito, true);
    setIncognitoButton(true);
    toast('Private browsing detected. Conversations will not be persisted in this session.');
  }

  const autoDelete = localStorage.getItem(LS.autoDeleteDays) || DEFAULTS.autoDeleteDays;
  if (autoDelete !== 'never') {
    const days = Number(autoDelete);
    if (Number.isFinite(days) && days > 0) await Storage.deleteConversationsOlderThan(days);
  }

  state.personas = state.hasIndexedDB ? await Storage.getPersonas() : [{
    id: 'default',
    name: 'Privex AI',
    emoji: '🤖',
    color: '#6366f1',
    isBuiltIn: true,
    systemPrompt: 'You are Privex AI, a helpful, accurate, and thoughtful AI assistant.',
  }];
  state.memories = state.hasIndexedDB ? await Storage.getAllMemories() : [];

  if (!boolSetting(LS.incognito, false) && state.hasIndexedDB) {
    await refreshConversations();
    const active = localStorage.getItem(LS.activeConvId);
    if (active && state.conversations.some((c) => c.id === active)) {
      await openConversation(active);
    }
  } else {
    useIncognitoSession();
  }

  renderContextChips();
  if (state.hasIndexedDB) await updateStorageStats();
}

async function init() {
  collectDomRefs();
  setVH();
  window.addEventListener('resize', setVH);

  state.apiKey = getApiKey();
  state.folderMap = jsonSetting(LS.folderMap, {});
  state.activeFolderFilter = localStorage.getItem(LS.activeFolderFilter) || 'all';
  if (dom.apiKeyInput) dom.apiKeyInput.value = state.apiKey;

  loadSettingsToDom();
  updateWelcomeHeading();
  bindSetupFlow();
  bindEventListeners();
  wirePersonaPicker();

  dom.addMemoryBtn.addEventListener('click', async () => {
    const content = await uiPrompt('Add memory', '', 'Memory', 'Add');
    if (!content?.trim()) return;
    await Storage.addMemory(content.trim(), 'manual', state.activeConversationId);
    state.memories = await Storage.getAllMemories();
    renderMemoryPanel();
    renderContextChips();
  });

  updateTokenCounter();
  updateSendButtonState();

  await initData();

  if ('BroadcastChannel' in window) {
    state.tabSync = new BroadcastChannel('privex_ai_sync');
    state.tabSync.addEventListener('message', async (event) => {
      const data = event.data || {};
      if (data.type === 'msg_updated' || data.type === 'conv_updated') {
        if (!boolSetting(LS.incognito, false) && state.hasIndexedDB) {
          await refreshConversations();
          if (state.activeConversationId) {
            const stillExists = state.conversations.some((c) => c.id === state.activeConversationId);
            if (stillExists) await openConversation(state.activeConversationId);
          }
        }
      }
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    });
  }

  const sidebarOpen = boolSetting(LS.sidebarOpen, true);
  dom.sidebar.classList.toggle('collapsed', !sidebarOpen);
  dom.expandSidebarBtn.classList.toggle('hidden', sidebarOpen);

  if (localStorage.getItem(LS.setupComplete) !== 'true') {
    dom.setupOverlay.classList.remove('hidden');
    showSetupStep(1);
  } else {
    dom.setupOverlay.classList.add('hidden');
  }

  if (!state.apiKey && localStorage.getItem(LS.setupComplete) === 'true') {
    toast('Admin API config missing. Add Gemini key via config.js or deployment env.', 4200, 'warning');
  }

  maybeShowChangelog();
}

init().catch((error) => {
  const msg = error?.message || 'Privex AI failed to initialize.';
  const node = document.createElement('div');
  node.style.cssText = 'position:absolute;top:20px;right:20px;z-index:3000;background:#20202f;border:1px solid rgba(248,113,113,0.35);color:#eeeef5;padding:10px 12px;border-radius:10px;max-width:380px;';
  node.textContent = msg;
  document.body.appendChild(node);
});
