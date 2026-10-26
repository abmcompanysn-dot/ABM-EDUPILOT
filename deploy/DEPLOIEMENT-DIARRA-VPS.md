# Déploiement EduPilote v2 sur diarra-vps — préparé, pas encore déployé

Architecture retenue (frontend séparé, cookies same-origin préservés via un
Worker Cloudflare) :

```
navigateur → edu.abmcy.com (Cloudflare Pages + Worker)
                 ├─ / , /etudiant, /resp, ...  → fichiers statiques (frontend/dist)
                 └─ /api/*, /healthz, /readyz, /ws  → Worker relaie vers
                        edu-api.abmcy.com → Caddy diarra-vps → 127.0.0.1:8088/8089
                                                                (2 instances API Go)
```

## Pourquoi cette architecture

Le docker-compose original réservait les ports 80/443 avec son propre Caddy
et installait Postgres + Redis + Kafka sur un serveur dédié. diarra-vps
héberge déjà Caddy (ports 80/443 pris) et un cluster k3s proche de sa limite
CPU (4 cœurs, voir l'audit du 26 octobre 2026) — un second Caddy sur les
mêmes ports aurait été un conflit direct, pas un simple ajustement.

Le frontend passe sur Cloudflare Pages : zéro charge supplémentaire sur
diarra-vps pour servir du HTML/JS/CSS à 400 utilisateurs, CDN mondial
gratuit. Seule l'API Go (légère) et ses dépendances (Postgres, Redis, Kafka)
tournent sur diarra-vps, en local uniquement (`127.0.0.1`), jamais exposées
directement — le Caddy existant du serveur fait la façade publique.

## Ce qui a été préparé (ce commit)

- `docker-compose.yml` : plus de service `caddy`, plus de port 80/443 ouvert.
  Deux instances d'API (`api`, `api2`) liées uniquement sur
  `127.0.0.1:8088` et `127.0.0.1:8089`. `EDUPILOT_STATIC_DIR` vidé (le
  frontend n'est plus servi par Go).
- `diarra-vps.Caddyfile.snippet` : bloc à coller dans le Caddyfile existant
  de diarra-vps pour `edu-api.abmcy.com` (domaine interne, jamais vu du
  navigateur).
- `cloudflare-worker/worker.js` + `wrangler.toml` : Worker qui sert le
  frontend (Cloudflare Pages) et relaie `/api/*`, `/healthz`, `/readyz`,
  `/ws` vers `edu-api.abmcy.com`, pour que le navigateur ne voie qu'une
  seule origine (`edu.abmcy.com`) — nécessaire pour que le cookie de session
  `same-origin` du frontend continue de fonctionner sans toucher au backend.
- `.env.example` : `DOMAIN=edu.abmcy.com` (le domaine public, gravé dans les
  cartes NFC).

## Ce qu'il reste à faire pour déployer réellement (pas fait, en attente)

1. **DNS Cloudflare** : créer `edu.abmcy.com` (Pages) et `edu-api.abmcy.com`
   (A/AAAA vers l'IP de diarra-vps, proxy Cloudflare désactivé — Caddy gère
   déjà le TLS).
2. **Sur diarra-vps** : coller `diarra-vps.Caddyfile.snippet` dans
   `/etc/caddy/Caddyfile`, `caddy validate` puis `systemctl reload caddy`.
3. **Sur diarra-vps** : copier `backend/`, `deploy/` (sans
   `cloudflare-worker/`), remplir un `.env` réel à partir de
   `.env.example` (mots de passe générés avec `openssl rand -hex ...`),
   `docker compose up -d --build`.
4. **Cloudflare Pages** : créer le projet à partir de `frontend/` (commande
   de build `npm run build`, dossier de sortie `dist`).
5. **Worker** : `cd deploy/cloudflare-worker && wrangler deploy` (après
   `wrangler login`).
6. **Vérifier la capacité** : le README du projet annonce 10 000 pointages
   simultanés testés en local — à re-tester en conditions réelles
   (`go run ./cmd/loadtest -students 10000 -concurrency 1000`) une fois
   déployé, avant la mise en service pour les 400 utilisateurs.

## Sauvegardes

`backup.sh` existant dans ce dossier sauvegarde Postgres seul. Le script de
sauvegarde générale de diarra-vps (`/usr/local/bin/backup-to-gdrive.sh`, cron
quotidien 4h30) couvre déjà tout `/opt` et les volumes Docker locaux — à
vérifier que le volume `pgdata` d'EduPilote y est bien inclus une fois
déployé (il l'est automatiquement, le script sauvegarde tous les volumes
Docker du serveur).
