# API EduPilote v2

Toutes les routes sont sous `/api/v1`, en JSON. La session est un cookie `edupilot_session` (HttpOnly, Secure, SameSite=Lax). Toute requête qui modifie des données doit porter l'en-tête `X-EduPilot: 1` (protection CSRF). Les erreurs ont la forme `{"error": "message lisible"}` : 400 donnée refusée, 401 non connecté, 403 interdit, 404 introuvable, 409 doublon, 429 trop de tentatives.

Rôles : **A** admin, **R** responsable (ses classes uniquement), **E** étudiant (ses propres données), **P** public.

## Authentification

| Méthode et route | Qui | Rôle |
|---|---|---|
| `POST /auth/login` `{email, password}` | P | Ouvre une session (8 tentatives / 15 min par compte) |
| `POST /auth/logout` | tous | Ferme la session |
| `POST /auth/register` `{invite_code, full_name, matricule, email, phone, birth_date, password}` | P | Auto-inscription d'un étudiant |
| `GET /auth/me` | tous | Utilisateur courant |
| `POST /auth/password` `{current, next}` | tous | Change le mot de passe, ferme les autres sessions |

## Public

| Route | Rôle |
|---|---|
| `GET /public/school` | Nom de l'établissement |
| `GET /public/invite/{code}` | Classe d'un lien d'inscription |
| `GET /id/verify?e=&c=` | Vérifie une carte touchée (statut, identité publique ; infos réservées si le visiteur est du personnel de la classe ; jeton `proof` valable 10 min) |
| `GET /id/photo/{étudiant}?proof=` | Photo officielle, avec la preuve de vérification |
| `GET /public/profiles/{slug}` · `/photo` · `/vcard` | Profil pro (s'il est public) |

## Espace personnel

`GET /me/unread`, `GET /me/notifications`, `POST /me/notifications/read[?id=]`, `GET /me/student`, `GET /me/schedule?from&to`, `GET /me/attendance`, `GET|PUT /me/profile`, `POST /me/photo` (image brute : demande de nouvelle photo), `GET /me/photo`.

## Structure et personnel (A)

`GET|PUT /settings` · `GET|POST /years`, `PUT /years/{id}` · `GET|POST /filieres`, `PUT|DELETE /filieres/{id}` · `GET|POST /classes`, `GET|PUT|DELETE /classes/{id}`, `POST /classes/{id}/invite` (A, R), `PUT /classes/{id}/managers` · `GET|POST /staff`, `PUT /staff/{id}`, `POST /users/{id}/reset-password`.

## Pédagogie (A, R)

| Route | Rôle |
|---|---|
| `GET|POST /classes/{id}/modules`, `PUT|DELETE /modules/{id}` | Modules |
| `GET /classes/{id}/sessions?from&to`, `POST /sessions`, `GET|PUT|DELETE /sessions/{id}`, `POST /sessions/{id}/status` | Planning |
| `GET /classes/{id}/current-session` | Cours ouvert au pointage |
| `GET /sessions/{id}/roster` | Feuille de présence |
| `POST /sessions/{id}/attendance` `{student_ids, status, method, note}` | Saisie manuelle (présent, retard, excusé, absent) |
| `POST /scans` `{session_id, card_url \| card_uid \| proof, lat, lng}` | Pointage par carte |
| `GET /classes/{id}/stats`, `GET /classes/{id}/attendance.csv?from&to` | Statistiques et export |
| `GET /students?class_id&q`, `POST /students`, `GET|PUT /students/{id}`, `GET /students/{id}/attendance`, `GET /students/{id}/photo` | Étudiants |
| `POST /classes/{id}/students/import` (CSV `matricule;nom;email;téléphone;naissance` ou JSON) | Import |

## Cartes, photos, portes (A)

`GET /cards?status&student_id`, `POST /students/{id}/cards` `{uid, kind}` (renvoie les clés de programmation pour une NTAG 424 DNA), `POST /cards/{id}/revoke` `{reason: perdue|revoquee}` · `PUT /students/{id}/photo`, `GET /photo-requests`, `GET /photo-requests/{id}/image`, `POST /photo-requests/{id}/approve|reject` · `GET|POST /devices`, `PUT /devices/{id}[?rotate=1]`, `DELETE /devices/{id}`, `GET /door-events`.

`POST /devices/door/access` est appelé par l'ESP32, sans session : corps `{device_id, card_url|card_uid, ts, nonce}`, en-tête `X-Signature` = HMAC-SHA256 hexadécimal du corps avec le secret de la porte. Réponse `{allow, open_ms, name, reason, nonce, sig}` où `sig` = HMAC de `"1|nonce"` ou `"0|nonce"`.

Mode hors ligne (mêmes signatures) : `POST /devices/door/sync` renvoie, en texte, la liste des cartes actives et des cours des 24 h suivantes, signée dans l'en-tête `X-Signature` ; `POST /devices/door/events` `{events: [{id, uid, url, at, allowed, session_id, reason}]}` remonte les passages décidés sans réseau (doublons ignorés grâce à `id`).

## Communication, statistiques, journal

`GET|POST /announcements`, `DELETE /announcements/{id}`, `POST /announcements/{id}/read` · `POST /feedback` (tous), `GET /feedback` (A) · `GET /stats/overview` (A) · `GET /audit?type=&before=&limit=` (A).

## Temps réel

`GET /ws?class_id=` (WebSocket ; sans `class_id` pour l'admin = toute l'école). Messages `{type, at, data}` pour `attendance.recorded`, `attendance.departed`, `attendance.updated`.

## Technique

`GET /healthz`, `GET /readyz` (base joignable), `GET /metrics` (Prometheus : durées par route, pointages par résultat).
