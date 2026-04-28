import { ApiConfig } from '../services/apiConfig.js';
import { ApiClient } from '../services/apiClient.js';
import { applyTheme, applyFontSize, applyWidth } from '../themes.js';

const LS = {
  model: 'privexai_model',
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

const dom = {
  apiKeyInput: document.getElementById('apiKeyInput'),
  saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  clearApiKeyBtn: document.getElementById('clearApiKeyBtn'),
  apiStatus: document.getElementById('apiStatus'),
  themeSelect: document.getElementById('themeSelect'),
  fontSelect: document.getElementById('fontSelect'),
  widthSelect: document.getElementById('widthSelect'),
  timestampsToggle: document.getElementById('timestampsToggle')
};

function getSetting(key, fallback = '') {
  const raw = localStorage.getItem(key);
  return raw == null ? fallback : raw;
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
  dom.timestampsToggle.checked = getSetting(LS.showTimestamps, 'false') === 'true';
}

function setStatus(text, type = '') {
  dom.apiStatus.textContent = text;
  dom.apiStatus.classList.remove('success', 'error');
  if (type) dom.apiStatus.classList.add(type);
}

function loadApiKey() {
  const key = ApiConfig.getApiKey();
  dom.apiKeyInput.value = key || '';
  if (!key) {
    setStatus('Not set', '');
  } else {
    setStatus('Key loaded', 'success');
  }
}

async function testConnection() {
  const key = dom.apiKeyInput.value.trim();
  if (!key) {
    setStatus('Not set', 'error');
    return;
  }

  setStatus('Testing connection...', '');
  dom.testConnectionBtn.disabled = true;

  const model = getSetting(LS.model, DEFAULTS.model);
  const result = await ApiClient.testConnection(key, model);

  dom.testConnectionBtn.disabled = false;

  if (result.ok) {
    setStatus('Connected', 'success');
  } else {
    setStatus(result.message || 'Failed', 'error');
  }
}

function saveApiKey() {
  const key = dom.apiKeyInput.value.trim();
  if (!key) {
    setStatus('Not set', 'error');
    return;
  }
  ApiConfig.setApiKey(key);
  setStatus('Saved', 'success');
}

function clearApiKey() {
  ApiConfig.clearApiKey();
  dom.apiKeyInput.value = '';
  setStatus('Not set', '');
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
  });
}

function init() {
  applySavedAppearance();
  loadApiKey();

  dom.saveApiKeyBtn.addEventListener('click', saveApiKey);
  dom.testConnectionBtn.addEventListener('click', testConnection);
  dom.clearApiKeyBtn.addEventListener('click', clearApiKey);

  bindAppearanceEvents();
}

init();
