# ABM EduPilote

Suivi des présences, planning et carte d'identité étudiante NFC pour un établissement.

Ce dépôt contient deux générations :

| Dossier | Contenu |
|---|---|
| `backend/`, `frontend/`, `firmware/`, `deploy/`, `docs/` | **EduPilote v2** : Go + PostgreSQL + Kafka + Redis, React, carte NTAG 424 DNA, porte ESP32 + PN532 |
| fichiers à la racine (`*.html`, `appscipt.js`, `*.ino`) | v1 (Google Apps Script), conservée jusqu'à la bascule |

## v2 en un coup d'œil

- **Pointage NFC par téléphone** : le smartphone du responsable lit les cartes (Chrome Android). Sur iPhone, toucher la carte ouvre la page d'identité avec un bouton « Pointer présent ».
- **Carte d'identité infalsifiable** : chaque passage d'une carte NTAG 424 DNA produit un lien signé à usage unique ; une capture ou un lien copié est refusé.
- **Temps réel** : les présences s'affichent en direct (WebSocket) ; l'heure d'arrivée, l'heure de départ et le lieu sont enregistrés.
- **Tenue en charge** : un pointage est validé en mémoire et passe par Kafka ; mesuré à 10 000 pointages simultanés acceptés en moins d'une seconde, sans perte ni doublon (voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- **Suivi total** : chaque action est un événement Kafka, rangé dans un journal consultable par l'administration.
- **Alertes** : étudiant et responsable sont prévenus dès 3 absences d'affilée (seuil réglable).

## Démarrer en local (sans Docker)

```sh
# 1. Interface
cd frontend && npm install && npm run build && cd ..

# 2. Serveur avec PostgreSQL embarqué, bus et cache en mémoire, école de démonstration
cd backend
EDUPILOT_DEV_PG=.devdb EDUPILOT_DEMO_SEED=1 EDUPILOT_STATIC_DIR=../frontend/dist \
EDUPILOT_COOKIE_SECURE=false EDUPILOT_PUBLIC_URL=http://localhost:8080 \
go run ./cmd/server
```

Ouvrez http://localhost:8080 et connectez-vous avec `admin@demo.edupilote.sn`, `responsable@demo.edupilote.sn` ou `etudiant@demo.edupilote.sn` (mot de passe `Demo-2026!`).

Pour développer l'interface avec rechargement à chaud : `cd frontend && npm run dev` (http://localhost:5173, l'API est relayée vers le port 8080).

Simuler une carte sécurisée sans matériel : `go run ./cmd/cardsim -uid <UID d'une carte de la démo> -counter 1`.

## Tests

```sh
cd backend && go test ./...                        # crypto des cartes + intégration complète sur PostgreSQL
go run ./cmd/loadtest -students 10000 -concurrency 1000   # test de charge
cd ../frontend && npx tsc --noEmit -p . && npm run build
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — composants, événements, tenue en charge
- [API](docs/API.md) — routes HTTP
- [Cartes](docs/CARTES.md) — émission et programmation des NTAG 424 DNA
- [Porte](docs/PORTE.md) — câblage et configuration de l'ESP32
- [Exploitation](docs/EXPLOITATION.md) — déploiement, sauvegardes, supervision
- [Tourniquet](hardware/tourniquet/README.md) — prototype de tourniquet tripode ; vue 3D en ligne : [https://abmedupilote.abmcy.com/tourniquet](https://abmedupilote.abmcy.com/tourniquet) (liens directs : [passage](https://abmedupilote.abmcy.com/tourniquet#passage), [carte refusée](https://abmedupilote.abmcy.com/tourniquet#refus), [montage](https://abmedupilote.abmcy.com/tourniquet#montage))
