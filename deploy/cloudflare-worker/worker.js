// Worker Cloudflare pour edu.abmcy.com.
//
// Le frontend (React, build statique) est servi par Cloudflare Pages.
// Ce Worker relaie uniquement /api/*, /healthz, /readyz et /ws vers l'API Go
// sur diarra-vps, pour que le navigateur voie une seule et meme origine
// (edu.abmcy.com) et que le cookie de session "same-origin" continue de
// fonctionner sans aucun changement cote backend.
//
// Tout le reste (/, /etudiant, /resp, etc.) est laisse passer vers
// Cloudflare Pages, qui sert le frontend.

const API_ORIGIN = 'https://edu-api.abmcy.com' // sous-domaine interne pointant sur diarra-vps:8088/8089 via Caddy

const API_PATHS = ['/api/', '/healthz', '/readyz', '/ws']

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isApi = API_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p))

    if (!isApi) {
      // Laisse Cloudflare Pages gerer le frontend (routage par defaut du projet).
      return env.ASSETS.fetch(request)
    }

    const target = new URL(url.pathname + url.search, API_ORIGIN)
    const headers = new Headers(request.headers)
    headers.set('X-Forwarded-Host', url.hostname)
    headers.set('X-Forwarded-Proto', 'https')

    // Le websocket (/ws) a besoin de l'en-tete Upgrade transmis tel quel ;
    // fetch() le relaie correctement du moment que la requete d'origine en
    // porte un (cas standard du navigateur ouvrant un WebSocket).
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    })
  },
}
