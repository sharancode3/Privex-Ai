(function () {
  const LS = {
    model: 'privexai_model',
    memory: 'privexai_memory',
    sidebar: 'privexai_sidebar',
    userName: 'privexai_user_name',
  };

  function ensurePanel() {
    if (document.getElementById('settings-panel')) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      #settings-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(7,7,12,0.55);
        backdrop-filter: blur(4px);
        z-index: 1600;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      #settings-backdrop.open {
        opacity: 1;
        pointer-events: auto;
      }
      #settings-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: min(92vw, 360px);
        height: 100vh;
        background: #12121c;
        border-left: 1px solid rgba(255,255,255,0.08);
        box-shadow: -24px 0 70px rgba(0,0,0,0.5);
        z-index: 1700;
        transform: translateX(100%);
        transition: transform 0.24s ease;
        display: flex;
        flex-direction: column;
      }
      #settings-panel.open {
        transform: translateX(0);
      }
      .sp-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .sp-title {
        font-size: 16px;
        font-weight: 700;
        color: #eeeef5;
      }
      .sp-close {
        width: 32px;
        height: 32px;
        border: 1px solid rgba(255,255,255,0.1);
        background: #1a1a28;
        color: #eeeef5;
        border-radius: 8px;
        cursor: pointer;
      }
      .sp-body {
        padding: 16px;
        overflow-y: auto;
        display: grid;
        gap: 14px;
      }
      .sp-item {
        display: grid;
        gap: 6px;
      }
      .sp-label {
        font-size: 12px;
        color: #8888a8;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .sp-input,
      .sp-select {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.1);
        background: #1a1a28;
        color: #eeeef5;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
      }
      .sp-check {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(255,255,255,0.1);
        background: #1a1a28;
        color: #eeeef5;
        border-radius: 10px;
      }
      .sp-help {
        font-size: 12px;
        color: #8888a8;
        line-height: 1.5;
      }
      .sp-row {
        display: flex;
        gap: 8px;
      }
      .sp-btn {
        border: 1px solid rgba(255,255,255,0.12);
        background: #1a1a28;
        color: #eeeef5;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      .sp-btn.primary {
        background: linear-gradient(135deg, #7c6bff, #a855f7);
        border-color: transparent;
      }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'settings-backdrop';

    const panel = document.createElement('aside');
    panel.id = 'settings-panel';
    panel.setAttribute('aria-label', 'Settings panel');

    panel.innerHTML = `
      <div class="sp-head">
        <div class="sp-title">Settings</div>
        <button class="sp-close" id="sp-close" aria-label="Close settings">x</button>
      </div>
      <div class="sp-body">
        <div class="sp-item">
          <label class="sp-label" for="sp-name">Display Name</label>
          <input id="sp-name" class="sp-input" type="text" maxlength="32" placeholder="Your name">
        </div>

        <div class="sp-item">
          <label class="sp-label" for="sp-model">Model</label>
          <select id="sp-model" class="sp-select">
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
            <option value="gpt-4.1">GPT-4.1</option>
          </select>
        </div>

        <div class="sp-check">
          <span>Memory enabled</span>
          <input id="sp-memory" type="checkbox">
        </div>

        <div class="sp-check">
          <span>Sidebar open on launch</span>
          <input id="sp-sidebar" type="checkbox">
        </div>

        <div class="sp-row">
          <button class="sp-btn" id="sp-reset-chat">Reset current chat view</button>
          <button class="sp-btn primary" id="sp-save">Save</button>
        </div>

        <p class="sp-help">Changes are saved locally and applied immediately where possible.</p>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('#sp-close');
    const saveBtn = panel.querySelector('#sp-save');
    const resetChatBtn = panel.querySelector('#sp-reset-chat');

    function closePanel() {
      backdrop.classList.remove('open');
      panel.classList.remove('open');
    }

    function openPanel() {
      const nameInput = panel.querySelector('#sp-name');
      const modelSelect = panel.querySelector('#sp-model');
      const memoryToggle = panel.querySelector('#sp-memory');
      const sidebarToggle = panel.querySelector('#sp-sidebar');

      nameInput.value = localStorage.getItem(LS.userName) || '';
      modelSelect.value = localStorage.getItem(LS.model) || 'gpt-4o-mini';
      memoryToggle.checked = localStorage.getItem(LS.memory) !== 'false';
      sidebarToggle.checked = localStorage.getItem(LS.sidebar) !== '0';

      backdrop.classList.add('open');
      panel.classList.add('open');
      setTimeout(() => nameInput.focus(), 0);
    }

    function saveAndApply() {
      const nameInput = panel.querySelector('#sp-name');
      const modelSelect = panel.querySelector('#sp-model');
      const memoryToggle = panel.querySelector('#sp-memory');
      const sidebarToggle = panel.querySelector('#sp-sidebar');

      localStorage.setItem(LS.userName, nameInput.value.trim());
      localStorage.setItem(LS.model, modelSelect.value);
      localStorage.setItem(LS.memory, String(memoryToggle.checked));
      localStorage.setItem(LS.sidebar, sidebarToggle.checked ? '1' : '0');

      const modelLabel = document.getElementById('model-label');
      if (modelLabel) {
        const map = {
          'gpt-4o-mini': 'GPT-4o Mini',
          'gpt-4o': 'GPT-4o',
          'gpt-4.1-mini': 'GPT-4.1 Mini',
          'gpt-4.1': 'GPT-4.1',
        };
        modelLabel.textContent = map[modelSelect.value] || modelSelect.value;
      }

      const chipMemory = document.getElementById('chip-memory');
      if (chipMemory) {
        chipMemory.classList.toggle('on', memoryToggle.checked);
      }

      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.toggle('collapsed', !sidebarToggle.checked);
      }

      const title = document.getElementById('es-greeting');
      if (title) {
        const name = nameInput.value.trim();
        const h = new Date().getHours();
        const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
        title.textContent = `${greet}${name ? `, ${name}` : ''} ` + String.fromCodePoint(0x1F44B);
      }

      window.dispatchEvent(new CustomEvent('privex:settings-updated', {
        detail: {
          model: modelSelect.value,
          memoryOn: memoryToggle.checked,
        }
      }));

      closePanel();
    }

    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);
    saveBtn.addEventListener('click', saveAndApply);

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveAndApply();
    });

    resetChatBtn.addEventListener('click', () => {
      const threadInner = document.getElementById('thread-inner');
      const emptyState = document.getElementById('empty-state');
      if (threadInner) threadInner.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      closePanel();
    });

    window.PrivexSettings = {
      open: openPanel,
      close: closePanel,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }
})();
