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

function setSelectedThemeCard(theme) {
  document.querySelectorAll('.theme-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.themeChoice === theme);
  });
}

function applySavedAppearance() {
  const theme = getStoredTheme();
  const font = getSetting(LS.font, DEFAULTS.font);
  const width = getSetting(LS.width, DEFAULTS.width);

  migrateThemeKeyIfNeeded(theme);
  applyTheme(theme);
  applyFontSize(font);
  applyWidth(width);

  dom.themeSelect.value = theme;
  dom.fontSelect.value = font;
  dom.widthSelect.value = width;
  dom.timestampsToggle.checked = getSetting(LS.showTimestamps, 'false') === 'true';

  setSelectedThemeCard(theme);
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
    localStorage.setItem(THEME_LS.current, dom.themeSelect.value);
    localStorage.setItem(THEME_LS.legacy, dom.themeSelect.value);
    applyTheme(dom.themeSelect.value);
    setSelectedThemeCard(dom.themeSelect.value);
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

function bindTabs() {
  const tabs = Array.from(document.querySelectorAll('.settings-tab'));
  const panels = Array.from(document.querySelectorAll('.settings-panel'));
  if (!tabs.length || !panels.length) return;

  const setActive = (name) => {
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setActive(tab.dataset.tab));
  });
}

function bindThemeCards() {
  document.querySelectorAll('.theme-card').forEach((card) => {
    card.addEventListener('click', () => {
      const choice = card.dataset.themeChoice;
      if (!choice) return;
      dom.themeSelect.value = choice;
      dom.themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function init() {
  applySavedAppearance();
  loadApiKey();

  dom.saveApiKeyBtn.addEventListener('click', saveApiKey);
  dom.testConnectionBtn.addEventListener('click', testConnection);
  dom.clearApiKeyBtn.addEventListener('click', clearApiKey);

  bindAppearanceEvents();
  bindTabs();
  bindThemeCards();
}

init();
