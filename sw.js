const CACHE_NAME = 'abm-edupilote-cache-v2'; // IMPORTANT: Changez ce numéro de version à chaque mise à jour (v3, v4, etc.)
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
 
// Étape 1: Installation - Mise en cache des ressources statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Mise en cache des fichiers de l\'application');
        return cache.addAll(urlsToCache);
      })
  );
});
 
// Étape 2: Activation - Nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Suppression de l\'ancien cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
 
// Étape 3: Fetch - Servir les ressources depuis le cache (stratégie "Cache First")
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la ressource est dans le cache, on la retourne.
        if (response) {
          return response;
        }
        // Sinon, on effectue la requête réseau.
        // Important: Ne pas mettre en cache les requêtes API (POST) ou autres domaines.
        if (event.request.method === 'POST' || !event.request.url.startsWith(self.location.origin)) {
            return fetch(event.request);
        }
        // Pour les autres requêtes GET, on les récupère et on les sert.
        return fetch(event.request); 
      }
    )
  );
});