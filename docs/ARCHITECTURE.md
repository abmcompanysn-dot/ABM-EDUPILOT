# Architecture d'EduPilote v2

```
 Téléphones (PWA React)              Porte ESP32 + PN532
     │ HTTPS · WebSocket                 │ HTTPS, requête et réponse signées HMAC
     ▼                                   ▼
 Caddy (HTTPS automatique, répartition de charge)
     │
     ▼
 API Go ×N (sans état) ───────────── Redis : sessions, anti-doublon, anti-rejeu,
     │            │                          limitation des tentatives, cache des statistiques
     │ SQL +      │ scan.received
     │ outbox     ▼
     ▼          Kafka ◄── relais outbox
 PostgreSQL ◄── Worker Go : écriture des scans par lots · journal · alertes d'absence
```

Un seul binaire (`cmd/server`) joue le rôle `api`, `worker` ou les deux (`EDUPILOT_ROLES`). Sans Kafka ni Redis, il bascule sur un bus et un cache en mémoire : c'est le mode développement, limité à une instance.

## Paquets

| Paquet | Rôle |
|---|---|
| `internal/app` | Toute la logique métier, indépendante du HTTP |
| `internal/api` | Routes JSON `/api/v1`, cookies, CSRF, traduction des erreurs |
| `internal/events` | Enveloppe des événements, bus Kafka (franz-go) ou mémoire, relais outbox |
| `internal/cache` | Redis ou mémoire (même interface) |
| `internal/sun` | AES-CMAC et vérification des liens SUN des NTAG 424 DNA (testé sur les vecteurs NXP AN12196) |
| `internal/realtime` | Diffusion WebSocket des présences |
| `internal/db` | Pool PostgreSQL et migrations embarquées |
| `migrations/` | Schéma SQL |

## Événements (Kafka)

Chaque écriture produit un événement, écrit dans la table `outbox` **dans la même transaction** que la donnée, puis publié par le relais. Si Kafka est indisponible, rien n'est perdu : les événements attendent dans l'outbox.

| Topic | Types principaux | Clé de partition |
|---|---|---|
| `edupilot.scans` | `scan.received` | cours |
| `edupilot.attendance` | `attendance.recorded`, `attendance.departed`, `attendance.updated`, `absence.threshold_reached` | cours |
| `edupilot.identity` | `user.*`, `student.*`, `card.*`, `photo.*` | étudiant |
| `edupilot.academic` | `session.*`, `module.*`, `class.*`, `filiere.*`, `year.saved`, `settings.updated` | objet |
| `edupilot.access` | `door.opened`, `door.denied`, `device.*` | porte |
| `edupilot.messaging` | `announcement.*`, `feedback.submitted` | objet |

Consommateurs :

- `scan-writer` (worker) : écrit les présences par lots de 500 (`INSERT … ON CONFLICT DO NOTHING`, clé primaire cours + étudiant : aucun doublon possible).
- `audit` (worker) : range tous les événements dans `audit_log`, affiché dans « Journal ».
- un groupe par instance d'API : pousse les présences aux WebSockets et rafraîchit l'annuaire en mémoire.

## Chemin d'un pointage

1. Le téléphone envoie le lien lu sur la carte (`POST /api/v1/scans`).
2. L'API vérifie la signature de la puce (AES, environ 1 ms), retrouve la carte, l'étudiant et le cours dans son **annuaire en mémoire** (rechargé toutes les 20 s ou dès qu'un événement signale un changement), sans requête SQL.
3. Redis garantit l'anti-rejeu (compteur de la puce strictement croissant) et l'anti-doublon entre instances : premier passage = arrivée, passage au moins 10 min plus tard = départ.
4. L'événement part dans Kafka ; le téléphone reçoit aussitôt nom, photo et statut (présent, retard, déjà pointé, départ, refus).
5. Le worker écrit en base par lots ; l'écran du responsable se met à jour en direct.

## Mesure de charge

`go run ./cmd/loadtest -students 10000 -concurrency 1000`, sur un PC Windows, bus et cache en mémoire, PostgreSQL embarqué :

| Mesure | Objectif | Mesuré |
|---|---|---|
| 10 000 pointages simultanés acceptés | < 10 s | 0,94 s (10 678 / s) |
| Latence p95 | < 500 ms | 434 ms |
| Pointages perdus | 0 | 0 |
| Doublons en base | 0 | 0 |
| Rejeu des 10 000 liens | tous refusés | 10 000 / 10 000 |
| Tout écrit en base | — | 4,6 s |

À refaire sur le serveur de production (Kafka et Redis réels) avec `-url` et `-database-url`. Sous Windows, la file d'attente TCP limite les connexions simultanées ; l'outil réessaie la connexion comme le fait un client sous Linux.

## Règles de cohérence (leçons du pilote)

- Un cours finit après son début, dure au plus 12 h, commence entre 6 h et 23 h, et ne chevauche pas un autre cours de la classe.
- Les absences ne sont pas stockées : un étudiant est absent à un cours **tenu** (au moins une présence) s'il n'a pas de ligne de présence. Un cours sans aucune présence est considéré comme non tenu : pas de fausse alerte.
- Un étudiant n'est attendu qu'aux cours terminés après son inscription.
