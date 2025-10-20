const CACHE_NAME = 'abm-edupilote-cache-v1';
const urlsToCache = [
  '/',
  'index.html',
  'fonctionnement.html',
  'mentions-legales.html',
  'admin.html',
  'responsable.html',
  'etudiant.html',
  'config.js',
  'html2canvas.min.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://i.postimg.cc/5HMmW3HK/logo-abm-edu-pilote.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;500&display=swap'
];

// Étape 1: Installation du Service Worker et mise en cache des ressources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Étape 2: Interception des requêtes et service depuis le cache
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la ressource est dans le cache, on la retourne
        if (response) {
          return response;
        }
        // Sinon, on la récupère sur le réseau
        return fetch(event.request);
      })
  );
});

// Étape 3: Nettoyage des anciens caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});