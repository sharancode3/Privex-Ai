import { getOrCreateCryptoKey, encryptData, decryptData, isEncryptedValue } from './crypto.js';

const DB_NAME = 'PrivexAI_DB';
const DB_VERSION = 1;

const BUILTIN_PERSONAS = [
  {
    id: 'default',
    name: 'Privex AI',
    emoji: '🤖',
    color: '#6366f1',
    isBuiltIn: true,
    systemPrompt: 'You are Privex AI, a helpful, accurate, and thoughtful AI assistant. Be concise when the question is simple, detailed when complexity demands it. Always be direct and clear.',
  },
  {
    id: 'persona_code_expert',
    name: 'Code Expert',
    emoji: '💻',
    color: '#6366f1',
    isBuiltIn: true,
    systemPrompt: "You are a senior software engineer and architect. Provide precise technical guidance, working code examples, and explain the 'why' behind your recommendations. Default to industry best practices.",
  },
  {
    id: 'persona_writing_coach',
    name: 'Writing Coach',
    emoji: '✍️',
    color: '#a855f7',
    isBuiltIn: true,
    systemPrompt: 'You are an expert writer and editor. Help craft clear, compelling content for any audience. Provide specific, actionable feedback. Ask about tone and audience before suggesting major rewrites.',
  },
  {
    id: 'persona_research_analyst',
    name: 'Research Analyst',
    emoji: '🔬',
    color: '#06b6d4',
    isBuiltIn: true,
    systemPrompt: 'You are a thorough research assistant. Provide structured, well-organized information. Clearly distinguish between facts and your analysis. Acknowledge the limits of your knowledge.',
  },
  {
    id: 'persona_calm_companion',
    name: 'Calm Companion',
    emoji: '🧘',
    color: '#22c55e',
    isBuiltIn: true,
    systemPrompt: 'You are a warm, empathetic conversational partner. Listen thoughtfully, respond with understanding, and offer grounded perspective. You do not give medical or therapeutic advice.',
  },
  {
    id: 'persona_creative_partner',
    name: 'Creative Partner',
    emoji: '😄',
    color: '#f97316',
    isBuiltIn: true,
    systemPrompt: 'You are an imaginative creative collaborator. Embrace unconventional ideas, make unexpected connections, and enthusiastically explore possibilities. Think expansively.',
  }
];

let dbPromise;
let cryptoKeyPromise;

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getCryptoKey() {
  if (!cryptoKeyPromise) cryptoKeyPromise = getOrCreateCryptoKey();
  return cryptoKeyPromise;
}

async function maybeEncrypt(value) {
  if (value == null) return value;
  const key = await getCryptoKey();
  return encryptData(key, value);
}

async function maybeDecrypt(value) {
  if (value == null) return value;
  if (!isEncryptedValue(value)) return value;
  const key = await getCryptoKey();
  return decryptData(key, value);
}

async function encodeConversation(row) {
  return {
    ...row,
    title: await maybeEncrypt(row.title || ''),
    lastPreview: await maybeEncrypt(row.lastPreview || ''),
  };
}

async function decodeConversation(row) {
  if (!row) return row;
  return {
    ...row,
    title: await maybeDecrypt(row.title),
    lastPreview: await maybeDecrypt(row.lastPreview),
  };
}

async function encodeMessage(row) {
  return {
    ...row,
    content: await maybeEncrypt(row.content || ''),
  };
}

async function decodeMessage(row) {
  if (!row) return row;
  return {
    ...row,
    content: await maybeDecrypt(row.content),
  };
}

async function encodePersona(row) {
  return {
    ...row,
    systemPrompt: await maybeEncrypt(row.systemPrompt || ''),
  };
}

async function decodePersona(row) {
  if (!row) return row;
  return {
    ...row,
    systemPrompt: await maybeDecrypt(row.systemPrompt),
  };
}

async function encodeMemory(row) {
  return {
    ...row,
    content: await maybeEncrypt(row.content || ''),
  };
}

async function decodeMemory(row) {
  if (!row) return row;
  return {
    ...row,
    content: await maybeDecrypt(row.content),
  };
}

async function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('conversations')) {
        const conversations = db.createObjectStore('conversations', { keyPath: 'id' });
        conversations.createIndex('updatedAt', 'updatedAt');
        conversations.createIndex('isPinned', 'isPinned');
        conversations.createIndex('isArchived', 'isArchived');
      }

      if (!db.objectStoreNames.contains('messages')) {
        const messages = db.createObjectStore('messages', { keyPath: 'id' });
        messages.createIndex('conversationId', 'conversationId');
        messages.createIndex('isStarred', 'isStarred');
        messages.createIndex('timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('personas')) {
        db.createObjectStore('personas', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('userMemory')) {
        db.createObjectStore('userMemory', { keyPath: 'id' });
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      try {
        await seedPersonas(db);
      } catch {
        // no-op
      }
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function seedPersonas(existingDb) {
  const db = existingDb || await openDB();
  const tx = db.transaction('personas', 'readwrite');
  const store = tx.objectStore('personas');

  for (const persona of BUILTIN_PERSONAS) {
    const existing = await reqToPromise(store.get(persona.id));
    if (!existing) {
      const encoded = await encodePersona({ ...persona, createdAt: Date.now() });
      store.put(encoded);
    }
  }

  await transactionComplete(tx);
}

async function withStore(storeNames, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(storeNames, mode);
  const result = await fn(tx);
  await transactionComplete(tx);
  return result;
}

export const Storage = {
  async init() {
    await openDB();
    await getCryptoKey();
  },

  async createConversation(data = {}) {
    const now = Date.now();
    const plain = {
      id: randomId('conv'),
      title: data.title || 'New Conversation',
      createdAt: now,
      updatedAt: now,
      model: data.model || 'gemini-2.0-flash',
      messageCount: 0,
      isPinned: false,
      isArchived: false,
      systemPromptId: data.systemPromptId || 'default',
      lastPreview: ''
    };

    const encoded = await encodeConversation(plain);
    await withStore(['conversations'], 'readwrite', async (tx) => {
      tx.objectStore('conversations').put(encoded);
    });

    return plain;
  },

  async getConversation(id) {
    if (!id) return null;
    const db = await openDB();
    const tx = db.transaction('conversations', 'readonly');
    const row = await reqToPromise(tx.objectStore('conversations').get(id));
    return decodeConversation(row);
  },

  async getAllConversations() {
    const db = await openDB();
    const tx = db.transaction('conversations', 'readonly');
    const rows = await reqToPromise(tx.objectStore('conversations').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeConversation(r)));
    return decoded
      .filter((row) => !row.isArchived)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  },

  async getArchivedConversations() {
    const db = await openDB();
    const tx = db.transaction('conversations', 'readonly');
    const rows = await reqToPromise(tx.objectStore('conversations').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeConversation(r)));
    return decoded.filter((row) => row.isArchived).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async updateConversation(id, updates) {
    await withStore(['conversations'], 'readwrite', async (tx) => {
      const store = tx.objectStore('conversations');
      const current = await reqToPromise(store.get(id));
      if (!current) return;
      const plain = await decodeConversation(current);
      const merged = { ...plain, ...updates, id: plain.id };
      const encoded = await encodeConversation(merged);
      store.put(encoded);
    });
  },

  async deleteConversation(id) {
    await withStore(['conversations', 'messages'], 'readwrite', async (tx) => {
      const convStore = tx.objectStore('conversations');
      const msgStore = tx.objectStore('messages');
      convStore.delete(id);

      const allMessages = await reqToPromise(msgStore.getAll());
      for (const msg of allMessages) {
        if (msg.conversationId === id) msgStore.delete(msg.id);
      }
    });
  },

  async pinConversation(id, bool) {
    await this.updateConversation(id, { isPinned: !!bool, updatedAt: Date.now() });
  },

  async searchConversations(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return this.getAllConversations();

    const db = await openDB();
    const tx = db.transaction(['conversations', 'messages'], 'readonly');
    const conversationsRaw = await reqToPromise(tx.objectStore('conversations').getAll());
    const messagesRaw = await reqToPromise(tx.objectStore('messages').getAll());

    const conversations = await Promise.all(conversationsRaw.map((c) => decodeConversation(c)));
    const messages = await Promise.all(messagesRaw.map((m) => decodeMessage(m)));

    const messageMap = new Map();
    for (const msg of messages) {
      if (!messageMap.has(msg.conversationId)) messageMap.set(msg.conversationId, []);
      messageMap.get(msg.conversationId).push(msg);
    }

    return conversations
      .filter((conv) => !conv.isArchived)
      .filter((conv) => {
        if ((conv.title || '').toLowerCase().includes(q)) return true;
        if ((conv.lastPreview || '').toLowerCase().includes(q)) return true;
        const convMsgs = messageMap.get(conv.id) || [];
        return convMsgs.some((msg) => (msg.content || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  },

  async addMessage(conversationId, data) {
    const plain = {
      id: randomId('msg'),
      conversationId,
      role: data.role || 'user',
      content: data.content || '',
      timestamp: data.timestamp || Date.now(),
      status: data.status || 'sent',
      isEdited: !!data.isEdited,
      editHistory: data.editHistory || [],
      reaction: data.reaction || null,
      isStarred: !!data.isStarred,
      isPinned: !!data.isPinned,
      tokenEstimate: data.tokenEstimate || Math.ceil((data.content || '').length / 4)
    };

    const encodedMessage = await encodeMessage(plain);

    await withStore(['messages', 'conversations'], 'readwrite', async (tx) => {
      const msgStore = tx.objectStore('messages');
      const convStore = tx.objectStore('conversations');

      msgStore.put(encodedMessage);

      const convRaw = await reqToPromise(convStore.get(conversationId));
      if (convRaw) {
        const conv = await decodeConversation(convRaw);
        conv.messageCount = (conv.messageCount || 0) + 1;
        conv.updatedAt = plain.timestamp;
        if (plain.role === 'model') conv.lastPreview = (plain.content || '').split('\n')[0].slice(0, 160);
        if ((conv.title === 'New Conversation' || !conv.title) && plain.role === 'user') {
          conv.title = plain.content.trim().slice(0, 45) || 'New Conversation';
        }
        convStore.put(await encodeConversation(conv));
      }
    });

    return plain;
  },

  async getMessages(conversationId) {
    const db = await openDB();
    const tx = db.transaction('messages', 'readonly');
    const rows = await reqToPromise(tx.objectStore('messages').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeMessage(r)));
    return decoded
      .filter((row) => row.conversationId === conversationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  async updateMessage(id, updates) {
    await withStore(['messages'], 'readwrite', async (tx) => {
      const store = tx.objectStore('messages');
      const raw = await reqToPromise(store.get(id));
      if (!raw) return;
      const plain = await decodeMessage(raw);
      const merged = { ...plain, ...updates, id: plain.id };
      store.put(await encodeMessage(merged));
    });
  },

  async deleteMessage(id) {
    await withStore(['messages'], 'readwrite', async (tx) => {
      tx.objectStore('messages').delete(id);
    });
  },

  async deleteMessagesAfter(conversationId, timestamp) {
    await withStore(['messages'], 'readwrite', async (tx) => {
      const store = tx.objectStore('messages');
      const rows = await reqToPromise(store.getAll());
      for (const msg of rows) {
        if (msg.conversationId === conversationId && msg.timestamp > timestamp) {
          store.delete(msg.id);
        }
      }
    });
  },

  async getStarredMessages() {
    const db = await openDB();
    const tx = db.transaction('messages', 'readonly');
    const rows = await reqToPromise(tx.objectStore('messages').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeMessage(r)));
    return decoded.filter((row) => row.isStarred).sort((a, b) => b.timestamp - a.timestamp);
  },

  async getPinnedMessages() {
    const db = await openDB();
    const tx = db.transaction('messages', 'readonly');
    const rows = await reqToPromise(tx.objectStore('messages').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeMessage(r)));
    return decoded.filter((row) => row.isPinned).sort((a, b) => b.timestamp - a.timestamp);
  },

  async getAllMessages() {
    const db = await openDB();
    const tx = db.transaction('messages', 'readonly');
    const rows = await reqToPromise(tx.objectStore('messages').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeMessage(r)));
    return decoded.sort((a, b) => a.timestamp - b.timestamp);
  },

  async getPersonas() {
    const db = await openDB();
    const tx = db.transaction('personas', 'readonly');
    const rows = await reqToPromise(tx.objectStore('personas').getAll());
    const decoded = await Promise.all(rows.map((r) => decodePersona(r)));
    return decoded.sort((a, b) => (a.isBuiltIn === b.isBuiltIn ? a.name.localeCompare(b.name) : a.isBuiltIn ? -1 : 1));
  },

  async createPersona(data) {
    const plain = {
      id: randomId('persona'),
      name: data.name,
      emoji: data.emoji || '🎭',
      systemPrompt: data.systemPrompt || '',
      color: data.color || '#6366f1',
      isBuiltIn: false,
      createdAt: Date.now()
    };

    await withStore(['personas'], 'readwrite', async (tx) => {
      tx.objectStore('personas').put(await encodePersona(plain));
    });

    return plain;
  },

  async updatePersona(id, updates) {
    await withStore(['personas'], 'readwrite', async (tx) => {
      const store = tx.objectStore('personas');
      const raw = await reqToPromise(store.get(id));
      if (!raw) return;
      const plain = await decodePersona(raw);
      const merged = { ...plain, ...updates, id: plain.id };
      store.put(await encodePersona(merged));
    });
  },

  async deletePersona(id) {
    await withStore(['personas'], 'readwrite', async (tx) => {
      const store = tx.objectStore('personas');
      const raw = await reqToPromise(store.get(id));
      if (!raw) return;
      const persona = await decodePersona(raw);
      if (persona.isBuiltIn) return;
      store.delete(id);
    });
  },

  async addMemory(content, source = 'manual', conversationId = null) {
    const plain = {
      id: randomId('mem'),
      content,
      source,
      conversationId,
      isActive: true,
      createdAt: Date.now()
    };

    await withStore(['userMemory'], 'readwrite', async (tx) => {
      tx.objectStore('userMemory').put(await encodeMemory(plain));
    });

    return plain;
  },

  async getAllMemories() {
    const db = await openDB();
    const tx = db.transaction('userMemory', 'readonly');
    const rows = await reqToPromise(tx.objectStore('userMemory').getAll());
    const decoded = await Promise.all(rows.map((r) => decodeMemory(r)));
    return decoded.sort((a, b) => (a.isActive === b.isActive ? b.createdAt - a.createdAt : a.isActive ? -1 : 1));
  },

  async updateMemory(id, updates) {
    await withStore(['userMemory'], 'readwrite', async (tx) => {
      const store = tx.objectStore('userMemory');
      const raw = await reqToPromise(store.get(id));
      if (!raw) return;
      const plain = await decodeMemory(raw);
      const merged = { ...plain, ...updates, id: plain.id };
      store.put(await encodeMemory(merged));
    });
  },

  async deleteMemory(id) {
    await withStore(['userMemory'], 'readwrite', async (tx) => {
      tx.objectStore('userMemory').delete(id);
    });
  },

  async clearAllMemories() {
    await withStore(['userMemory'], 'readwrite', async (tx) => {
      tx.objectStore('userMemory').clear();
    });
  },

  async exportAll() {
    const db = await openDB();
    const tx = db.transaction(['conversations', 'messages', 'personas', 'userMemory'], 'readonly');

    const conversations = await Promise.all((await reqToPromise(tx.objectStore('conversations').getAll())).map((r) => decodeConversation(r)));
    const messages = await Promise.all((await reqToPromise(tx.objectStore('messages').getAll())).map((r) => decodeMessage(r)));
    const personas = await Promise.all((await reqToPromise(tx.objectStore('personas').getAll())).map((r) => decodePersona(r)));
    const userMemory = await Promise.all((await reqToPromise(tx.objectStore('userMemory').getAll())).map((r) => decodeMemory(r)));

    const payload = {
      version: 1,
      exportedAt: Date.now(),
      conversations,
      messages,
      personas,
      userMemory,
    };

    return JSON.stringify(payload, null, 2);
  },

  async importAll(jsonString) {
    const parsed = JSON.parse(jsonString);
    const stores = ['conversations', 'messages', 'personas', 'userMemory'];
    let imported = 0;
    let skipped = 0;

    await withStore(stores, 'readwrite', async (tx) => {
      for (const storeName of stores) {
        const rows = Array.isArray(parsed[storeName]) ? parsed[storeName] : [];
        const store = tx.objectStore(storeName);

        for (const row of rows) {
          const existing = await reqToPromise(store.get(row.id));
          if (existing) {
            skipped += 1;
            continue;
          }

          let encoded = row;
          if (storeName === 'conversations') encoded = await encodeConversation(row);
          if (storeName === 'messages') encoded = await encodeMessage(row);
          if (storeName === 'personas') encoded = await encodePersona(row);
          if (storeName === 'userMemory') encoded = await encodeMemory(row);

          store.put(encoded);
          imported += 1;
        }
      }
    });

    return { imported, skipped };
  },

  async clearEverything() {
    const db = await openDB();
    const tx = db.transaction(['conversations', 'messages', 'personas', 'userMemory'], 'readwrite');
    tx.objectStore('conversations').clear();
    tx.objectStore('messages').clear();
    tx.objectStore('personas').clear();
    tx.objectStore('userMemory').clear();
    await transactionComplete(tx);
    await seedPersonas(db);
  },

  async getStats() {
    const db = await openDB();
    const tx = db.transaction(['conversations', 'messages', 'userMemory'], 'readonly');
    const conv = await reqToPromise(tx.objectStore('conversations').count());
    const msg = await reqToPromise(tx.objectStore('messages').count());
    const mem = await reqToPromise(tx.objectStore('userMemory').count());
    const roughBytes = (conv * 450) + (msg * 900) + (mem * 260);
    return {
      convCount: conv,
      msgCount: msg,
      memCount: mem,
      estimatedMB: +(roughBytes / (1024 * 1024)).toFixed(2)
    };
  },

  async deleteConversationsOlderThan(days) {
    if (!days || days <= 0) return;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    await withStore(['conversations', 'messages'], 'readwrite', async (tx) => {
      const convStore = tx.objectStore('conversations');
      const msgStore = tx.objectStore('messages');
      const conversations = await reqToPromise(convStore.getAll());
      const oldIds = conversations.filter((c) => c.updatedAt < cutoff).map((c) => c.id);

      for (const id of oldIds) convStore.delete(id);

      const messages = await reqToPromise(msgStore.getAll());
      for (const message of messages) {
        if (oldIds.includes(message.conversationId)) msgStore.delete(message.id);
      }
    });
  }
};
