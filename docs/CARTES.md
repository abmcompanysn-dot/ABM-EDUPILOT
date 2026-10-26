# Cartes d'identité NFC

EduPilote accepte deux types de puces :

| Type | Sécurité | Usage |
|---|---|---|
| **NTAG 424 DNA** (`sun`) | Lien signé à usage unique à chaque passage, puce non clonable | Carte d'identité officielle (recommandé) |
| Puce simple (`uid`) : Mifare, NTAG 213… | Identifiée par son numéro de série, copiable | Transition, ou cartes déjà achetées |

Une carte sécurisée lue par son seul numéro de série est refusée : sans la signature, ce pourrait être un clone.

## Clés

Tout dérive de `EDUPILOT_CARD_MASTER_KEY` (16 octets) par AES-CMAC :

- clé de lecture des métadonnées SDM : commune à toutes les cartes (l'UID n'est connu qu'après déchiffrement) ;
- clé de lecture du fichier SDM (signature) et clé maîtresse d'application : propres à chaque carte (dérivées de son UID).

**Sauvegardez la clé maître hors ligne, en deux exemplaires.** Si elle est perdue, toutes les cartes doivent être reprogrammées. Si elle fuit, changez-la et reprogrammez les cartes.

## Émettre une carte

1. Admin → Cartes → « Émettre une carte ». Choisissez l'étudiant (sa photo officielle doit être posée).
2. Saisissez l'UID de la puce (7 octets pour une NTAG 424 DNA), ou appuyez sur « Lire » avec Chrome Android et posez la carte au dos du téléphone.
3. Pour une NTAG 424 DNA, l'écran affiche les paramètres de programmation :
   - **modèle de lien** à écrire dans le fichier NDEF : `https://<domaine>/id?e=000…&c=000…` ;
   - **positions** (offsets) du PICCData chiffré (`e`) et du SDMMAC (`c`) dans ce lien ;
   - **clé 0** (application), **clé de lecture SDM des métadonnées**, **clé de lecture SDM du fichier**.
4. Programmez la puce avec un outil NTAG 424 DNA, par exemple NXP TagXplorer sur PC avec un lecteur USB PC/SC (type ACR1252U) :
   - changer la clé 0 et les clés SDM avec les valeurs affichées ;
   - écrire le modèle de lien dans le fichier NDEF (E104) ;
   - activer le SDM avec mirroring chiffré de l'UID et du compteur (PICCData) à la position `e`, et du SDMMAC à la position `c`, avec une entrée MAC vide (SDMMACInputOffset = SDMMACOffset) ;
   - lecture du fichier NDEF libre (accès « E »), écriture protégée par la clé 0.
5. Vérifiez : touchez la carte avec un téléphone, la page d'identité doit afficher « Carte valide ». Touchez-la une seconde fois et rechargez l'ancienne page : elle doit afficher « Lien déjà utilisé ».

Un programmateur automatique (commande Go sur PC/SC, une carte en 2 secondes) est la prochaine étape prévue ; il n'est pas encore écrit.

## Tester sans matériel

```sh
cd backend
go run ./cmd/cardsim -uid 04A1B2C3D4E5F6 -counter 1 -base https://<domaine> -master <clé maître>
```

La commande affiche le lien exact que produirait la carte ; augmentez `-counter` à chaque essai.

## Cycle de vie

`active` → `perdue` / `revoquee` (désactivation immédiate partout) → nouvelle carte émise (l'ancienne passe `remplacee`). Une carte expire automatiquement à la date de fin de son année académique.

## Carte imprimée

Cartes → icône imprimante : format CR80 (85,6 × 54 mm), photo, nom, filière, classe, matricule, année. Volontairement **sans QR code d'identité** : l'identité ne se vérifie que par la puce.
