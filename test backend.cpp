#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
const char* ssid = "abmcy";
const char* password = "test1234v";
String scriptUrl = "https://script.google.com/macros/s/AKfycbzs_EEZt_v59JNqwwTPdrDfu-nYgId4Ae4YYp-EhyYlhbsqHqC8JIltSI9W6fsRHjC1Pw/exec";

// --- PINOUT ---
#define SS_PIN    5   
#define RST_PIN   26  
#define SCK_PIN   18  
#define MISO_PIN  19  
#define MOSI_PIN  23  
#define PIN_LED_WIFI 21 
#define PIN_LED_SCAN 22 
#define PIN_BUZZER   27 
#define PIN_RELAY    4   // Définition du Pin pour le Relais

// --- CONFIGURATION RELAIS ---
// Mettre 'true' si le relais s'active avec un signal LOW (0V) - Cas fréquent
// Mettre 'false' si le relais s'active avec un signal HIGH (3.3V/5V)
#define RELAY_ACTIVE_LOW  true 

#if RELAY_ACTIVE_LOW
  #define RELAY_OPEN   LOW
  #define RELAY_CLOSE  HIGH
#else
  #define RELAY_OPEN   HIGH
  #define RELAY_CLOSE  LOW
#endif


MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n======================================");
  Serial.println("DEBUG MODE : SYSTEME ACCES RFID");
  Serial.println("======================================");

  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_LED_SCAN, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, RELAY_CLOSE); // Initialisation du relais en position fermée

  WiFi.begin(ssid, password);
  Serial.print("Connexion WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_LED_WIFI, !digitalRead(PIN_LED_WIFI));
  }
  Serial.println("\n[OK] Connecté ! IP: " + WiFi.localIP().toString());
  digitalWrite(PIN_LED_WIFI, HIGH);

  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  mfrc522.PCD_Init();
  Serial.println("Prêt à scanner...");
}

void loop() {
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  Serial.println("\n--- NOUVEAU SCAN ---");
  digitalWrite(PIN_LED_SCAN, HIGH);

  String rfidId = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    rfidId += (mfrc522.uid.uidByte[i] < 10 ? "0" : "") + String(mfrc522.uid.uidByte[i]);
  }
  Serial.println("ID Détecté : " + rfidId);

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); 
    
    HTTPClient http;
    
    // 1. Préparation de l'URL avec les paramètres pour une requête GET (plus rapide et fiable)
    String urlWithParams = scriptUrl + "?rfidId=" + rfidId;
    
    // 2. Initialisation de la requête
    http.begin(client, urlWithParams);

    // CORRECTION IMPORTANTE : Forcer l'ESP32 à suivre la redirection de Google vers le contenu final
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    // 3. Configuration du timeout (10s est suffisant pour un GET)
    http.setTimeout(10000); 

    Serial.println("Envoi vers Google Apps Script via GET...");
    unsigned long startTimer = millis();
    
    // 4. Exécution du GET
    int httpCode = http.GET();
    unsigned long endTimer = millis();

    Serial.print("Temps d'exécution : "); 
    Serial.print(endTimer - startTimer); 
    Serial.println(" ms");

    if (httpCode > 0) {
      Serial.printf("Code de réponse HTTP : %d\n", httpCode);
      
      // Si on reçoit 200 (OK)
      String response = http.getString();
      Serial.println("CONTENU RECU : ");
      Serial.println("--------------------------------------");
      Serial.println(response);
      Serial.println("--------------------------------------");

      // Analyse JSON pour confirmer
      StaticJsonDocument<500> doc;
      DeserializationError error = deserializeJson(doc, response);
      if (!error) {
        if (doc["success"] == true) {
          Serial.println(">>> ACCÈS CONFIRMÉ PAR LE SERVEUR <<<");
          
          // --- ACTION RELAIS (Lampe/Porte) ---
          digitalWrite(PIN_RELAY, RELAY_OPEN); // Activer le relais
          delay(3000);                         // Attendre 3 secondes
          digitalWrite(PIN_RELAY, RELAY_CLOSE);  // Désactiver le relais
          
        } else {
          Serial.println(">>> ACCÈS REFUSÉ PAR LE SERVEUR <<<");
          // Petit bip d'erreur si accès refusé
          for(int i=0; i<3; i++) {
            digitalWrite(PIN_BUZZER, HIGH); delay(100); digitalWrite(PIN_BUZZER, LOW); delay(100);
          }
        }
      } else {
        Serial.println("Note : La réponse n'est pas un JSON valide (Peut-être une erreur HTML de Google)");
      }
    } else {
      Serial.print("ERREUR CRITIQUE : ");
      Serial.println(http.errorToString(httpCode).c_str());      
    }
    http.end();
  } else {
    Serial.println("WiFi perdu...");
  }

  digitalWrite(PIN_LED_SCAN, LOW);
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  Serial.println("En attente de la suite...");
  delay(2000);
}