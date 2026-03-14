#include <SPI.h>
#include <MFRC522.h>

// --- PINOUT (RC522) ---
#define SDA_PIN   5 // C'est la broche SDA du module RC522
#define SCK_PIN   18
#define MOSI_PIN  23
#define MISO_PIN  19
#define RST_PIN   26

MFRC522 mfrc522(SDA_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  while (!Serial); // Attendre le port série
  delay(1000);

  Serial.println(F("\n--- DIAGNOSTIC RC522 (SDA) ---"));

  // Force un Hard Reset du module RC522
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(20);
  digitalWrite(RST_PIN, HIGH);
  delay(50);

  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SDA_PIN);
  mfrc522.PCD_Init();

  // Lecture directe du registre de version pour un diagnostic clair
  byte v = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  Serial.print(F("Version Firmware : 0x"));
  Serial.println(v, HEX);

  if (v == 0x91 || v == 0x92) {
    Serial.println(F("✅ SUCCES : Module détecté ! Scannez une carte..."));
  } else {
    Serial.println(F("❌ ECHEC : Le module ne répond pas correctement."));
    Serial.println(F("Impossible de détecter exactement quel fil est coupé par logiciel, mais voici le guide :"));
    Serial.println(F("1. Si 0x00 ou 0xFF : Vérifiez ALIMENTATION (3.3V/GND) et MISO (GPIO 19) / MOSI (GPIO 23)."));
    Serial.println(F("2. Vérifiez que SDA est bien sur GPIO 5."));
    Serial.println(F("3. Vérifiez que SCK est bien sur GPIO 18."));
    Serial.println(F("4. Vérifiez que RST est bien sur GPIO 26."));
    Serial.println(F("IMPORTANT : Les broches doivent être SOUDÉES sur le module."));
  }
}

void loop() {
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    Serial.print(F("Carte détectée ! UID:"));
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      Serial.print(mfrc522.uid.uidByte[i] < 0x10 ? " 0" : " ");
      Serial.print(mfrc522.uid.uidByte[i], HEX);
    }
    Serial.println();
    mfrc522.PICC_HaltA();
  }
}