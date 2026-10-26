# Porte ou barrière connectée

La barrière se lève seulement si l'étudiant a un cours en ce moment ; sa présence est enregistrée au passage. Code : [`firmware/door_nfc/door_nfc.ino`](../firmware/door_nfc/door_nfc.ino).

> Le firmware n'a pas encore été compilé ni testé sur le matériel : faites la recette ci-dessous avant la mise en service.

Pour un vrai portique, voir le tourniquet tripode EduPilote : dossier de fabrication dans [`hardware/tourniquet`](../hardware/tourniquet/README.md) et vue 3D en ligne : [https://abmedupilote.abmcy.com/tourniquet](https://abmedupilote.abmcy.com/tourniquet).

## Trois réglages en haut du programme

| Réglage | 1 | 0 |
|---|---|---|
| `USE_ETHERNET` | WT32-ETH01, **câble réseau** (conseillé si le Wi-Fi est instable) | ESP32 DevKit en Wi-Fi |
| `USE_SERVO` | **Barrière** levée par un servomoteur | Relais qui commande une gâche ou un vrai tourniquet |
| `USE_PASS_SENSOR` | Capteur infrarouge : la barrière reste levée tant que quelqu'un passe, puis se baisse | Fermeture après le délai réglé dans l'admin |

## Matériel (budget de démonstration, environ 40 à 50 $)

| Pièce | Prix approximatif |
|---|---|
| WT32-ETH01 (ESP32 + prise RJ45) | 8 à 12 $ |
| Lecteur PN532 (mode I2C) | 5 à 8 $ |
| Servomoteur 20 à 35 kg·cm (type DS3218) + bras léger (tube PVC ou alu, environ 80 cm) | 12 à 15 $ |
| Capteur infrarouge de passage E18-D80NK | 4 à 6 $ |
| Alimentation 6 V 3 A pour le servo + alimentation 5 V pour la carte | 5 à 7 $ |
| LED, buzzer, résistances 10 kΩ et 220 Ω, bouton, fils, câble réseau, boîtier | 5 $ |

Le servo doit avoir **sa propre alimentation** ; reliez les masses (GND) du servo et de la carte. Cette barrière est une démonstration : elle peut être poussée. Pour un vrai portique, mettez `USE_SERVO 0` et reliez le relais à l'entrée « ouverture » du tourniquet.

## Câblage du WT32-ETH01

| Composant | Broche |
|---|---|
| PN532 SDA / SCL (interrupteurs en I2C) | GPIO 33 / GPIO 32 |
| PN532 VCC / GND | 3,3 V / GND |
| Servo (fil de signal) ou relais IN | GPIO 4 |
| LED verte / rouge (+ 220 Ω) | GPIO 2 / GPIO 15 |
| Buzzer | GPIO 14 |
| Capteur de passage (sortie) | GPIO 35, avec résistance 10 kΩ vers 3,3 V |
| Bouton de configuration (vers GND) | GPIO 36, avec résistance 10 kΩ vers 3,3 V |
| Câble réseau | prise RJ45, vers le routeur ou le switch de l'école |

Pour programmer le WT32-ETH01, il faut un adaptateur USB-série 3,3 V (TX, RX, GND, et IO0 relié à GND pendant le téléversement).

## Installation

1. Arduino IDE, carte « WT32-ETH01 Ethernet Module » (ou « ESP32 Dev Module » pour le DevKit), schéma de partition avec LittleFS.
2. Bibliothèques : **Adafruit PN532**, **ArduinoJson** (v7), **WiFiManager** (tzapu), **ESP32Servo**.
3. Téléversez `door_nfc.ino`. Aucun secret n'est écrit dans le code.

## Configuration

1. Admin → Portes → « Ajouter une porte » : notez l'identifiant et le **secret** (affiché une seule fois).
2. Au premier démarrage (ou bouton maintenu 5 s), la carte ouvre le Wi-Fi **EduPilote-Porte** : connectez-vous avec un téléphone et saisissez l'adresse du serveur, l'identifiant et le secret. En version câble, ce Wi-Fi sert seulement à la configuration.

## Quand le réseau coupe (mode hors ligne)

- Toutes les 5 minutes, la porte télécharge une **liste signée** : cartes actives et cours des prochaines 24 h. Une liste modifiée ou tronquée est rejetée.
- Si le serveur ne répond pas, la porte décide seule : carte connue et cours de sa classe en ce moment = ouverture. Chaque passage est noté.
- Au retour du réseau, les passages sont envoyés ; le serveur enregistre la présence à l'**heure réelle** du passage et ignore les doublons. Admin → Portes les marque « Hors ligne ».
- Limites assumées : pendant la coupure, une carte déclarée perdue après la dernière synchronisation est encore acceptée, et l'anti-rejeu des liens n'est contrôlé qu'au retour du réseau (un faux lien est alors signalé dans le journal). Au-delà de 24 h sans réseau, la porte refuse tout le monde.

## Sécurité

- Chaque demande porte l'heure (NTP), un nonce unique et une signature HMAC-SHA256 ; chaque réponse et chaque liste sont signées à leur tour.
- Le canal TLS n'est pas authentifié par défaut (`setInsecure`). Pour le verrouiller, ajoutez le certificat racine de votre autorité (Let's Encrypt : ISRG Root X1) avec `tls.setCACert()`.
- **La sortie doit toujours rester libre de l'intérieur**, surtout sur une issue de secours.

## Recette

| Essai | Résultat attendu |
|---|---|
| Carte d'un étudiant qui a cours, réseau branché | Barrière levée, 2 bips, présence « porte » |
| Même étudiant, aucun cours | Refus, 3 bips |
| Carte déclarée perdue | Refus |
| Quelqu'un reste sous la barrière | Elle ne se baisse pas tant qu'il est là |
| Câble réseau débranché, carte valide, cours en cours | Barrière levée (bip court « hors ligne » en plus) |
| Câble rebranché | Dans les 15 s, le passage apparaît dans Admin → Portes avec la mention « Hors ligne » |
| Coupure de courant | La barrière ou la gâche reste fermée |
