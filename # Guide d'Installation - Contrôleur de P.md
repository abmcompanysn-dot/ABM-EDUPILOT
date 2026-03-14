# Guide d'Installation - Contrôleur de Porte RFID pour ABM EduPilote

Ce guide explique comment installer et configurer le système de contrôle d'accès par carte RFID avec un ESP32, un module RC522 et un buzzer.

## 1. Prérequis Matériels

-   Un microcontrôleur **ESP32**.
-   Un **module RFID-RC522** (Interface SPI).
-   Un **module relais 5V** compatible avec l'ESP32.
-   Un **Buzzer actif** (3.3V ou 5V).
-   Une **gâche électrique** (12V ou autre, selon votre modèle).
-   Une **alimentation externe** pour la gâche électrique (ex: adaptateur 12V).
-   **2 LEDs** (ex: Verte pour la connexion WiFi, Bleue pour le passage de carte).
-   **2 Résistances** (220Ω ou 330Ω) pour les LEDs.
-   Des fils de connexion (type Dupont).

## 2. Schéma de Câblage

**ATTENTION : Manipulez les connexions électriques avec précaution. Débranchez toutes les alimentations avant de faire des modifications.**

### a) Connexion du Module RC522 (SPI) à l'ESP32

| Broche RC522 | Broche ESP32 | Description |
| :--- | :--- | :--- |
| SDA (SS) | **GPIO 5** | Slave Select |
| SCK | **GPIO 18** | Horloge SPI |
| MOSI | **GPIO 23** | Master Out Slave In |
| MISO | **GPIO 19** | Master In Slave Out |
| RST | **GPIO 26** | Reset |
| 3.3V | **3.3V** | Alimentation (IMPORTANT: utiliser 3.3V, pas 5V) |
| GND | **GND** | Masse |

**Note sur les autres broches :** La broche `IRQ` du module RC522 n'est pas utilisée dans cette configuration et peut être laissée **déconnectée**.

### b) Connexion des LEDs, du Buzzer et du Relais

| Composant | Broche ESP32 | Description |
| :--- | :--- | :--- |
| **LED Connexion** (Anode +) | **GPIO 21** | S'allume quand le WiFi est connecté |
| **LED Scan** (Anode +) | **GPIO 22** | S'allume lors d'un scan de carte |
| **Buzzer** (Anode +) | **GPIO 27** | Signal sonore |
| **Relais** (IN) | **GPIO 4** | Commande d'ouverture de porte |

*Note : N'oubliez pas de placer une résistance en série avec chaque LED (entre la cathode - et le GND).*

### c) Connexion de la Gâche Électrique au Relais

La gâche électrique est alimentée par son propre adaptateur secteur (ex: 12V). Le relais agit comme un interrupteur.

1.  Connectez le pôle **positif (+)** de votre alimentation 12V à la borne **COM** (Commun) du relais.
2.  Connectez la borne **NO** (Normally Open / Normalement Ouvert) du relais à l'une des bornes de la gâche électrique.
3.  Connectez l'autre borne de la gâche électrique au pôle **négatif (-)** de votre alimentation 12V.

*Pourquoi `NO` ?* En utilisant `NO`, la gâche n'est alimentée (et donc déverrouillée) que lorsque l'ESP32 active le relais. En cas de coupure de courant, la porte reste verrouillée (sécurité "fail-secure").

## 3. Configuration Logicielle

### a) Google Apps Script

1.  **Mise à jour du script** : Copiez le contenu du fichier `appscript.js` modifié et collez-le dans votre projet Google Apps Script.
2.  **Déploiement** :
    *   Cliquez sur **Déployer > Nouveau déploiement**.
    *   Sélectionnez le type "Application Web".
    *   Dans "Qui a accès", choisissez **"Tout le monde"**.
    *   Cliquez sur **Déployer**.
    *   **IMPORTANT** : Copiez l'URL de l'application web. Vous en aurez besoin pour l'ESP32.

### b) Arduino IDE pour l'ESP32

1.  **Installer l'IDE Arduino** si ce n'est pas déjà fait.
2.  **Installer le support ESP32** :
    *   Allez dans `Fichier > Préférences`.
    *   Dans "URL de gestionnaire de cartes supplémentaires", ajoutez : `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
    *   Allez dans `Outils > Type de carte > Gestionnaire de cartes`, cherchez "esp32" et installez le paquet par Espressif Systems.
3.  **Installer les bibliothèques** :
    *   Allez dans `Croquis > Inclure une bibliothèque > Gérer les bibliothèques`.
    *   Cherchez et installez :
        *   `MFRC522` par `GitHubCommunity`
        *   `ArduinoJson` par Benoit Blanchon
4.  **Configurer et Téléverser le code** :
    *   Copiez le code ci-dessous dans l'IDE Arduino (remplacez tout le contenu existant).
    *   Modifiez les variables `ssid`, `password` et `scriptUrl` avec vos informations.
    *   Branchez votre ESP32 à votre ordinateur.
    *   Dans `Outils`, sélectionnez la bonne carte (ex: "ESP32 Dev Module") et le bon port COM.
    *   Cliquez sur le bouton **Téléverser**.

```cpp
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
const char* ssid = "NOM_DE_VOTRE_WIFI";
const char* password = "MOT_DE_PASSE_WIFI";
String scriptUrl = "VOTRE_URL_APPS_SCRIPT_ICI";

// --- PINOUT (RC522) ---
#define SS_PIN    5   // RC522 SDA/SS
#define SCK_PIN   18  // RC522 SCK
#define MOSI_PIN  23  // RC522 MOSI
#define MISO_PIN  19  // RC522 MISO
#define RST_PIN   26  // RC522 RST

#define PIN_RELAY    (4)
#define PIN_LED_WIFI (21) // LED Connexion
#define PIN_LED_SCAN (22) // LED Passage Carte
#define PIN_BUZZER   (27) // Buzzer

MFRC522 mfrc522(SS_PIN, RST_PIN); // Create MFRC522 instance

void beep(int duration, int count = 1) {
  for (int i = 0; i < count; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(duration);
    digitalWrite(PIN_BUZZER, LOW);
    if (count > 1 && i < count - 1) delay(100);
  }
}

void setup() {
  Serial.begin(115200);
  
  pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, LOW);
  pinMode(PIN_LED_WIFI, OUTPUT); digitalWrite(PIN_LED_WIFI, LOW);
  pinMode(PIN_LED_SCAN, OUTPUT); digitalWrite(PIN_LED_SCAN, LOW);
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, LOW);

  // Test Buzzer au démarrage
  beep(100, 2);

  // Connexion WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connexion au WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
    digitalWrite(PIN_LED_WIFI, !digitalRead(PIN_LED_WIFI)); // Clignote
  }
  Serial.println(" Connecté !");
  digitalWrite(PIN_LED_WIFI, HIGH); // Fixe quand connecté
  beep(500); // Bip long connexion OK

  // Init SPI bus and MFRC522
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN); // Init SPI bus
  mfrc522.PCD_Init();   // Init MFRC522 card
  mfrc522.PCD_DumpVersionToSerial();  // Show details of PCD - MFRC522 Card Reader details
  Serial.println("Prêt à scanner...");
}

void loop() {
  // Look for new cards
  if ( ! mfrc522.PICC_IsNewCardPresent() || ! mfrc522.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // A card has been detected
    digitalWrite(PIN_LED_SCAN, HIGH); // Allumer LED Scan
    beep(50); // Bip court scan
    String rfidId = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      rfidId += String(mfrc522.uid.uidByte[i]);
    }
    Serial.println("ID: " + rfidId);

    if(WiFi.status() == WL_CONNECTED){
      HTTPClient http;
      http.begin(scriptUrl);
      http.addHeader("Content-Type", "application/json");
      String payload = "{\"action\":\"requestDoorAccess\", \"data\":{\"rfidId\":\"" + rfidId + "\"}}";
      int httpCode = http.POST(payload);
      
      if (httpCode > 0) {
        String response = http.getString();
        if (response.indexOf("\"success\":true") >= 0) {
           Serial.println("ACCÈS AUTORISÉ");
           beep(100, 2); // 2 bips succès
           digitalWrite(PIN_RELAY, HIGH); delay(3000); digitalWrite(PIN_RELAY, LOW);
        } else {
           Serial.println("ACCÈS REFUSÉ");
           // Clignotement rapide pour erreur
           for(int i=0; i<3; i++) { 
             digitalWrite(PIN_LED_SCAN, LOW); 
             digitalWrite(PIN_BUZZER, HIGH);
             delay(100); 
             digitalWrite(PIN_LED_SCAN, HIGH); 
             digitalWrite(PIN_BUZZER, LOW);
             delay(100); 
           }
        }
      }
      http.end();
    }
    
    digitalWrite(PIN_LED_SCAN, LOW);
    mfrc522.PICC_HaltA(); // Halt PICC
    mfrc522.PCD_StopCrypto1(); // Stop encryption on PCD
    delay(1000); // Wait a bit before next scan
}
```

## 4. Test du Système

1.  Ouvrez le **Moniteur Série** dans l'IDE Arduino (vitesse 115200 bauds).
2.  Vérifiez que l'ESP32 se connecte bien au Wi-Fi (la **LED Connexion** doit devenir fixe).
3.  Scannez une carte RFID (la **LED Scan** doit s'allumer).
4.  **Cas 1 (Accès autorisé)** :
    *   Assurez-vous qu'un cours est planifié et **confirmé** pour la classe de cet étudiant à l'heure actuelle.
    *   Le moniteur série devrait afficher "Accès autorisé".
    *   Vous devriez entendre le relais cliquer et la gâche électrique se déverrouiller pendant 3 secondes.
5.  **Cas 2 (Accès refusé)** :
    *   Assurez-vous qu'aucun cours n'est planifié pour l'étudiant.
    *   Le moniteur série devrait afficher "Accès refusé. Raison: Aucun cours en ce moment."
    *   Le relais ne doit pas s'activer.

## 5. En Cas d'Erreur de Compilation (Dépannage)

Si le module PN532 n'est pas détecté ("Module PN53x non trouvé !"), vérifiez vos connexions SPI (SCK, MISO, MOSI, SS) et assurez-vous que les petits interrupteurs (DIP switches) sur le module PN532 sont bien réglés en mode SPI (généralement : 0 bas, 1 haut).

Félicitations, votre système de contrôle d'accès est maintenant intégré à ABM EduPilote !
