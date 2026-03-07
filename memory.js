(function () {
  const MEM_KEY = 'privexai_memories';

  function loadMemories() {
    try {
      const raw = localStorage.getItem(MEM_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((m) => ({
          id: m.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          content: String(m.content || '').trim(),
          active: m.active !== false,
          ts: Number(m.ts) || Date.now(),
        }))
        .filter((m) => m.content.length > 0);
    } catch {
      return [];
    }
  }

  function saveMemories(memories) {
    localStorage.setItem(MEM_KEY, JSON.stringify(memories));
    window.dispatchEvent(new CustomEvent('privex:memory-updated', { detail: { memories } }));
  }

  function ensurePanel() {
    if (document.getElementById('memory-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #memory-backdrop {
        position: fixed; inset: 0; z-index: 1600;
        background: rgba(7,7,12,0.55);
        backdrop-filter: blur(4px);
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s ease;
      }
      #memory-backdrop.open { opacity: 1; pointer-events: auto; }
      #memory-panel {
        position: fixed; top: 0; right: 0; z-index: 1700;
        width: min(94vw, 420px); height: 100vh;
        background: #12121c;
        border-left: 1px solid rgba(255,255,255,0.08);
        box-shadow: -24px 0 70px rgba(0,0,0,0.5);
        transform: translateX(100%);
        transition: transform 0.24s ease;
        display: flex; flex-direction: column;
      }
      #memory-panel.open { transform: translateX(0); }
      .mp-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .mp-title { font-size: 16px; font-weight: 700; color: #eeeef5; }
      .mp-close {
        width: 32px; height: 32px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #1a1a28; color: #eeeef5; cursor: pointer;
      }
      .mp-body { padding: 16px; overflow-y: auto; display: grid; gap: 12px; }
      .mp-row { display: flex; gap: 8px; }
      .mp-input {
        flex: 1; border: 1px solid rgba(255,255,255,0.1);
        background: #1a1a28; color: #eeeef5; border-radius: 10px;
        padding: 10px 12px; font-size: 14px; outline: none;
      }
      .mp-btn {
        border: 1px solid rgba(255,255,255,0.12);
        background: #1a1a28; color: #eeeef5;
        border-radius: 10px; padding: 9px 12px; font-size: 13px; cursor: pointer;
      }
      .mp-btn.primary { background: linear-gradient(135deg, #7c6bff, #a855f7); border-color: transparent; }
      .mp-btn.danger { border-color: rgba(248,113,113,0.35); color: #fda4af; }
      .mp-list { display: grid; gap: 8px; }
      .mp-empty { font-size: 13px; color: #8888a8; }
      .mp-item {
        border: 1px solid rgba(255,255,255,0.09);
        background: #171724; border-radius: 10px; padding: 10px;
      }
      .mp-item.off { opacity: 0.6; }
      .mp-item-content { color: #eeeef5; font-size: 13px; line-height: 1.55; margin-bottom: 8px; }
      .mp-item-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .mp-footnote { font-size: 12px; color: #8888a8; line-height: 1.5; }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'memory-backdrop';

    const panel = document.createElement('aside');
    panel.id = 'memory-panel';
    panel.innerHTML = `
      <div class="mp-head">
        <div class="mp-title">Memory Manager</div>
        <button class="mp-close" id="mp-close" aria-label="Close memory panel">x</button>
      </div>
      <div class="mp-body">
        <div class="mp-row">
          <input id="mp-input" class="mp-input" type="text" maxlength="240" placeholder="Add a memory...">
          <button id="mp-add" class="mp-btn primary">Add</button>
        </div>
        <div class="mp-row">
          <button id="mp-clear" class="mp-btn danger">Clear all</button>
        </div>
        <div id="mp-list" class="mp-list"></div>
        <p class="mp-footnote">Memories are stored locally and used for context when memory is enabled.</p>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    const listEl = panel.querySelector('#mp-list');
    const inputEl = panel.querySelector('#mp-input');
    const addBtn = panel.querySelector('#mp-add');
    const clearBtn = panel.querySelector('#mp-clear');

    function renderList() {
      const memories = loadMemories().sort((a, b) => b.ts - a.ts);
      listEl.innerHTML = '';

      if (!memories.length) {
        const empty = document.createElement('div');
        empty.className = 'mp-empty';
        empty.textContent = 'No memories yet.';
        listEl.appendChild(empty);
        return;
      }

      memories.forEach((mem) => {
        const card = document.createElement('div');
        card.className = `mp-item ${mem.active ? '' : 'off'}`;
        card.innerHTML = `
          <div class="mp-item-content"></div>
          <div class="mp-item-actions">
            <button class="mp-btn" data-action="toggle">${mem.active ? 'Disable' : 'Enable'}</button>
            <button class="mp-btn" data-action="edit">Edit</button>
            <button class="mp-btn danger" data-action="delete">Delete</button>
          </div>
        `;
        card.querySelector('.mp-item-content').textContent = mem.content;

        card.addEventListener('click', () => {
          // no-op: click handled by buttons
        });

        card.querySelector('[data-action="toggle"]').addEventListener('click', () => {
          const next = loadMemories().map((m) => m.id === mem.id ? { ...m, active: !m.active } : m);
          saveMemories(next);
          renderList();
        });

        card.querySelector('[data-action="edit"]').addEventListener('click', () => {
          const current = card.querySelector('.mp-item-content');
          if (!current) return;
          const input = document.createElement('input');
          input.className = 'mp-input';
          input.value = mem.content;
          current.replaceWith(input);
          input.focus();
          input.select();

          const commit = () => {
            const val = String(input.value || '').trim();
            if (!val) {
              renderList();
              return;
            }
            const next = loadMemories().map((m) => m.id === mem.id ? { ...m, content: val } : m);
            saveMemories(next);
            renderList();
          };

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') renderList();
          });
          input.addEventListener('blur', commit);
        });

        card.querySelector('[data-action="delete"]').addEventListener('click', () => {
          const next = loadMemories().filter((m) => m.id !== mem.id);
          saveMemories(next);
          renderList();
        });

        listEl.appendChild(card);
      });
    }

    function closePanel() {
      backdrop.classList.remove('open');
      panel.classList.remove('open');
    }

    function openPanel() {
      renderList();
      backdrop.classList.add('open');
      panel.classList.add('open');
      setTimeout(() => inputEl.focus(), 0);
    }

    function addMemory() {
      const value = inputEl.value.trim();
      if (!value) return;
      const memories = loadMemories();
      memories.unshift({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        content: value,
        active: true,
        ts: Date.now(),
      });
      saveMemories(memories);
      inputEl.value = '';
      renderList();
      inputEl.focus();
    }

    addBtn.addEventListener('click', addMemory);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addMemory();
      if (e.key === 'Escape') closePanel();
    });

    let clearArmed = false;
    clearBtn.addEventListener('click', () => {
      if (!clearArmed) {
        clearArmed = true;
        clearBtn.textContent = 'Click again to clear';
        setTimeout(() => {
          clearArmed = false;
          clearBtn.textContent = 'Clear all';
        }, 2200);
        return;
      }
      clearArmed = false;
      clearBtn.textContent = 'Clear all';
      saveMemories([]);
      renderList();
    });

    panel.querySelector('#mp-close').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    window.PrivexMemory = {
      open: openPanel,
      close: closePanel,
      refresh: renderList,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePanel);
  } else {
    ensurePanel();
  }
})();
