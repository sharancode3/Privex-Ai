const CACHE_NAME = 'privex-ai-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './gemini.js',
  './storage.js',
  './markdown.js',
  './themes.js',
  './crypto.js',
  './assets/logo.svg',
  './assets/favicon.ico'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('generativelanguage.googleapis.com') || e.request.url.includes('api.openai.com')) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
