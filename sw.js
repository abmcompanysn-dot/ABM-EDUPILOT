const CACHE_NAME = 'abm-edupilote-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/etudiant.html',
  '/responsable.html',
  '/fonctionnement.html',
  '/mentions-legales.html',
  '/config.js',
  'https://i.postimg.cc/5HMmW3HK/logo-abm-edu-pilote.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Installation du Service Worker et mise en cache des ressources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interception des requêtes réseau
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la ressource est dans le cache, on la retourne
        if (response) {
          return response;
        }
        // Sinon, on effectue la requête réseau
        return fetch(event.request);
      }
    )
  );
});