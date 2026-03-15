#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
const char* ssid = "abmcy";
const char* password = "test1234v";
String scriptUrl = "https://script.google.com/macros/s/AKfycbyXFSa8oS36xe6fNpNn1W6kWJz7TkZf2wK1XvgdCeaFj6sXveZIiLDHCJuO-tVTvkMctA/exec";

// --- PINOUT (RC522) ---
#define SS_PIN    5   // RC522 SDA/SS
#define SCK_PIN   18  // RC522 SCK
#define MOSI_PIN  23  // RC522 MOSI
#define MISO_PIN  19  // RC522 MISO
#define RST_PIN   26  // RC522 RST

#define PIN_RELAY    4

// --- CONFIGURATION RELAIS ---
// Mettre 'true' si le relais s'active avec un signal LOW (0V) - Cas fréquent
// Mettre 'false' si le relais s'active avec un signal HIGH (3.3V/5V)
#define RELAY_ACTIVE_LOW  false 

#if RELAY_ACTIVE_LOW
  #define RELAY_OPEN   LOW
  #define RELAY_CLOSE  HIGH
#else
  #define RELAY_OPEN   HIGH
  #define RELAY_CLOSE  LOW
#endif

#define PIN_LED_WIFI (21) // LED Connexion (Verte)
#define PIN_LED_SCAN (22) // LED Passage Carte (Bleue)
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
  
  pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, RELAY_CLOSE);
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
      WiFiClientSecure client;
      client.setInsecure(); // Nécessaire pour HTTPS sur Google Script sans certificat complexe

      HTTPClient http;
      // Construction de l'URL avec l'ID en paramètre (GET)
      String url = scriptUrl + "?rfidId=" + rfidId;
      http.begin(client, url);
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS); // CRUCIAL : suit la redirection Google
      
      // Requête GET (plus fiable pour Google Script que POST)
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        String response = http.getString();
        Serial.println("Réponse : " + response);

        // Analyse JSON propre
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, response);

        if (!error && doc["success"] == true) {
           Serial.println("ACCÈS AUTORISÉ");
           beep(100, 2); // 2 bips succès
           digitalWrite(PIN_RELAY, RELAY_OPEN); delay(15000); digitalWrite(PIN_RELAY, RELAY_CLOSE);
        } else {
           String errorMsg = doc["error"] | "Raison inconnue";
           Serial.println("ACCÈS REFUSÉ : " + errorMsg);
           // Clignotement rapide + Bips erreur
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