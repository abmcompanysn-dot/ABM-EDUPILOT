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
 
// Étape 3: Fetch - Servir les ressources avec la stratégie "Stale-While-Revalidate"
self.addEventListener('fetch', event => {
  // On ignore les requêtes qui ne sont pas des GET (ex: POST vers l'API)
  // et les requêtes vers des extensions Chrome, qui peuvent causer des erreurs.
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // 1. On lance la requête réseau en parallèle
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Si la requête réussit, on met à jour le cache
          // On clone la réponse car elle ne peut être consommée qu'une seule fois
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(error => {
          // Gérer les erreurs réseau (ex: mode hors ligne)
          console.warn('Service Worker: La requête réseau a échoué.', error);
          // Si une réponse en cache existe, on l'a déjà renvoyée.
          // Sinon, on pourrait renvoyer une page hors ligne personnalisée ici.
        });

        // 2. On renvoie la réponse du cache si elle existe (instantané)
        if (cachedResponse) {
          console.log('Service Worker: Ressource servie depuis le cache:', event.request.url);
          return cachedResponse;
        }

        // 3. Si la ressource n'est pas dans le cache, on attend la réponse réseau
        return fetchPromise;
      });
    })
  );
});