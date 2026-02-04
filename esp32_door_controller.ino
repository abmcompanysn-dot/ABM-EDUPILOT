/*
 * =================================================================================
 * CONTRÔLEUR DE PORTE RFID POUR ABM EDUPILOTE
 * =================================================================================
 * Matériel requis :
 *  - ESP32
 *  - Lecteur RFID avec sortie Wiegand (ex: Wiegand 26)
 *  - Module Relais 5V
 *  - Gâche électrique 12V (ou autre tension)
 *  - Alimentation externe pour la gâche
 *
 * Développé par ABM Company Tech
 * =================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h> // CORRECTION: Ajout de l'include manquant
#include <ArduinoJson.h>
#include "Wiegand.h" // Bibliothèque à installer: "Wiegand-ESP32" par monkeyboard

// --- CONFIGURATION À MODIFIER ---
const char* ssid = "NOM_DE_VOTRE_WIFI";
const char* password = "MOT_DE_PASSE_WIFI";

// URL de votre Web App Google Apps Script
String scriptUrl = "https://script.google.com/macros/s/AKfycbwBYwl1maJmn_91zolF4W9Rj2lIYYW3CixOhTDangswBte6jl5Zq47ykobAIVZKdDSF-g/exec";

// Broches (Pins) de l'ESP32
const int RELAY_PIN = 23;      // Broche connectée à l'entrée 'IN' du module relais
const int WIEGAND_D0_PIN = 16; // Broche pour Wiegand D0 (fil vert)
const int WIEGAND_D1_PIN = 17; // Broche pour Wiegand D1 (fil blanc)

// --- FIN DE LA CONFIGURATION ---

Wiegand wiegand;

// Certificat racine pour la connexion HTTPS à Google (valide jusqu'en 2028)
const char* root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIDujCCAqKgAwIBAgILBAAAAAABD4Ym5g0wDQYJKoZIhvcNAQEFBQAwTDEgMB4G\n" \
"A1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjIxEzARBgNVBAoTCkdsb2JhbFNp\n" \
"Z24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMDYxMjE1MDgwMDAwWhcNMjExMjE1\n" \
"MDgwMDAwWjBMMSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMjETMBEG\n" \
"A1UEChMKR2xvYmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjCCASIwDQYJKoZI\n" \
"hvcNAQEBBQADggEPADCCAQoCggEBAKbPJA6+Bgd8um2Uo5ZsoE7S5SPzL60RyxU4\n" \
"va3b45GfGBgzR5O2YXB0N8lRkYOKJoIu4WoGzt5w2k/kkYLSAn64vADOLQuwAitZ\n" \
"oP6xt9c/ANqdkp5TwmT8A6GkHKHx1c/JTDeFQBsAB1fTEsoRsbZRKIg5P6+m7wpp\n" \
"D4a1S2sfYckzBDAH9muRT7tZVbbJ1oRosggrpdYSHqYl02qsErsgsrrIqve6vNnB\n" \
"Pah5i65PctrlUsoag1P1GSIUomsR09ma1R+O1Tz/MSiGHYOLYtKjsg2GB3DUA0T2\n" \
"N5grl2L3iPYVw6I1PlS+Ar1K0LoCCdtyfsAMIF74mgj6AEr7LgUCAwEAAaOBnDCB\n" \
"mTAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUm+IH\n" \
"V2ccHsBqBt5ZtJot39wZhi8wNgYDVR0fBC8wLTAroCmgJ4YlaHR0cDovL2NybC5n\n" \
"bG9iYWxzaWduLm5ldC9yb290LXIyLmNybDAfBgNVHSMEGDAWgBSb4gdXZxwewGoG\n" \
"3lm0mi3f3BmGLzANBgkqhkiG9w0BAQUFAAOCAQEAmYFThdMgl+9L0uAbGwWMllm+\n" \
"8uRk26yaFK6fE+l+uppA6bOV5Gf4TycGIe1s2sR4I8+Vp51Jbfg2qBCMoM3o0QTd\n" \
"Zt2+y3qPAjFNu5TUIu61a1c/G2gO2I4+z9M0xO2Vz7vnKFr21r9v6jw4J9n0l8L0\n" \
"r97i4XvKj5ETMzt0N4jYKFx7/Y29L/pcEvxdd1W6AZT+I+r2VAm9TPyJv92Y\n" \
"V+w9I25lT0Jie6je9J2CuuOUbJnBPS0S3oGNd+EDh+qGzQk2xO2x5B6PyFLbVv3a\n" \
"3Yp40G9ES2rjsweU1/L+8IBzhM16wA+BqpyLgE/aC9d1gTRGAb7F2aTC2Yn2Ag==\n" \
"-----END CERTIFICATE-----\n";


void setup() {
  Serial.begin(115200);
  Serial.println("\n[INFO] Démarrage du contrôleur de porte ABM EduPilote...");

  // Configuration du relais
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // S'assurer que la porte est fermée au démarrage

  // Connexion au WiFi
  Serial.print("[WIFI] Connexion à ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Connecté !");
  Serial.print("[WIFI] Adresse IP: ");
  Serial.println(WiFi.localIP());

  // Initialisation du lecteur Wiegand
  wiegand.begin(WIEGAND_D0_PIN, WIEGAND_D1_PIN);
  Serial.println("[WIEGAND] Lecteur initialisé. En attente de cartes...");
}

void loop() {
  // Vérifie si une carte a été scannée
  if (wiegand.available()) {
    // Récupère le code de la carte
    // La bibliothèque gère la conversion en nombre décimal
    String rfidCode = String(wiegand.getCode());
    
    Serial.println("---------------------------------");
    Serial.print("[WIEGAND] Carte détectée ! ID: ");
    Serial.println(rfidCode);

    // Envoie la demande d'accès au serveur
    requestAccess(rfidCode);
  }
}

// Fonction pour envoyer la demande d'accès au script Google
void requestAccess(String rfidId) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    WiFiClientSecure client; // Cette ligne nécessite <WiFiClientSecure.h>
    
    // Utiliser le certificat racine pour la connexion sécurisée
    client.setCACert(root_ca);

    http.begin(client, scriptUrl);
    http.addHeader("Content-Type", "application/json");

    // Création du corps de la requête JSON
    JsonDocument jsonDoc;
    jsonDoc["action"] = "requestDoorAccess";
    jsonDoc["data"]["rfidId"] = rfidId;

    String requestBody;
    serializeJson(jsonDoc, requestBody);

    Serial.print("[HTTP] Envoi de la requête: ");
    Serial.println(requestBody);

    // Envoi de la requête POST
    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("[HTTP] Code de réponse: ");
      Serial.println(httpResponseCode);
      Serial.print("[HTTP] Réponse du serveur: ");
      Serial.println(response);

      // Analyse de la réponse JSON
      JsonDocument responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);

      if (error) {
        Serial.print("[JSON] Erreur de désérialisation: ");
        Serial.println(error.c_str());
        return;
      }

      bool success = responseDoc["success"];
      if (success) {
        Serial.println("[ACCES] Accès autorisé ! Ouverture de la porte.");
        openDoor();
      } else {
        const char* errorMessage = responseDoc["error"];
        Serial.print("[ACCES] Accès refusé. Raison: ");
        Serial.println(errorMessage);
      }

    } else {
      Serial.print("[HTTP] Erreur de la requête POST, code: ");
      Serial.println(httpResponseCode);
    }

    http.end();
  } else {
    Serial.println("[WIFI] Non connecté. Impossible d'envoyer la requête.");
  }
}

// Fonction pour activer le relais et ouvrir la porte
void openDoor() {
  Serial.println("[RELAIS] Activation du relais...");
  digitalWrite(RELAY_PIN, HIGH); // Active le relais
  delay(3000);                   // Maintient la porte ouverte pendant 3 secondes
  digitalWrite(RELAY_PIN, LOW);  // Désactive le relais
  Serial.println("[RELAIS] Relais désactivé. Porte refermée.");
}
