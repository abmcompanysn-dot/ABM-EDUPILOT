/*
 * EduPilote v2 — contrôleur de porte ou de barrière NFC.
 *
 * Matériel conseillé : WT32-ETH01 (ESP32 + prise réseau RJ45) + lecteur PN532.
 * Sortie au choix : servomoteur qui lève une barrière, ou relais de gâche.
 *
 * Fonctionnement :
 *  - En ligne : chaque carte est vérifiée par le serveur (requête et réponse
 *    signées HMAC-SHA256 : un faux serveur ou un rejeu ne peuvent rien ouvrir).
 *  - Hors ligne : la porte décide seule avec la liste signée téléchargée toutes
 *    les 5 minutes (cartes actives + cours du jour), note chaque passage et le
 *    remonte au retour du réseau. Liste valable 24 h au plus.
 *
 * Bibliothèques : Adafruit PN532, ArduinoJson (v7), WiFiManager (tzapu),
 * ESP32Servo (si barrière). Câblage et réglages : docs/PORTE.md.
 */

// ================================================================ RÉGLAGES
#define USE_ETHERNET 1      // 1 = WT32-ETH01 par câble réseau, 0 = Wi-Fi
#define USE_SERVO 1         // 1 = barrière à servomoteur, 0 = relais de gâche
#define USE_PASS_SENSOR 1   // 1 = capteur infrarouge de passage (barrière)

#if USE_ETHERNET  // broches libres du WT32-ETH01
#define PIN_SDA 33
#define PIN_SCL 32
#define PIN_ACTUATOR 4      // servo (signal) ou relais (IN)
#define PIN_LED_OK 2
#define PIN_LED_ERR 15
#define PIN_BUZZER 14
#define PIN_PASS 35         // capteur de passage (entrée seule : résistance 10 kΩ vers 3,3 V)
#define PIN_CONFIG 36       // bouton vers GND (résistance 10 kΩ vers 3,3 V) : maintenu 5 s = configuration
#else             // ESP32 DevKit
#define PIN_SDA 21
#define PIN_SCL 22
#define PIN_ACTUATOR 4
#define PIN_LED_OK 25
#define PIN_LED_ERR 26
#define PIN_BUZZER 27
#define PIN_PASS 34
#define PIN_CONFIG 0
#endif

#define SERVO_CLOSED 0        // angle barrière baissée
#define SERVO_OPEN 90         // angle barrière levée
#define RELAY_ACTIVE_HIGH true
#define SYNC_EVERY_MS (5UL * 60 * 1000)

// ================================================================
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <Adafruit_PN532.h>
#include <mbedtls/md.h>
#include <time.h>
#if USE_ETHERNET
#include <ETH.h>
#endif
#if USE_SERVO
#include <ESP32Servo.h>
Servo barrier;
#endif

Adafruit_PN532 nfc(-1, -1, &Wire);
Preferences prefs;
String serverUrl, deviceId, secretHex;
bool netUp = false;
unsigned long openUntil = 0, lastSync = 0, lastFlush = 0, lastTapMs = 0;
int servoAngle = SERVO_CLOSED, servoTarget = SERVO_CLOSED;
bool passing = false, passed = false;
String lastTapKey;

// ---------------------------------------------------------------- signaux
void beep(int ms, int times = 1) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(ms);
    digitalWrite(PIN_BUZZER, LOW);
    if (i + 1 < times) delay(90);
  }
}
void signalOk() { digitalWrite(PIN_LED_OK, HIGH); beep(80, 2); }
void signalDenied() { for (int i = 0; i < 3; i++) { digitalWrite(PIN_LED_ERR, HIGH); beep(90); digitalWrite(PIN_LED_ERR, LOW); delay(90); } }
void signalOffline() { digitalWrite(PIN_LED_ERR, HIGH); beep(60); digitalWrite(PIN_LED_ERR, LOW); }

// ---------------------------------------------------------------- ouverture
void openBarrier(long ms) {
  openUntil = millis() + ms;
  passing = passed = false;
#if USE_SERVO
  servoTarget = SERVO_OPEN;
#else
  digitalWrite(PIN_ACTUATOR, RELAY_ACTIVE_HIGH ? HIGH : LOW);
#endif
}

void closeBarrier() {
  openUntil = 0;
#if USE_SERVO
  servoTarget = SERVO_CLOSED;
#else
  digitalWrite(PIN_ACTUATOR, RELAY_ACTIVE_HIGH ? LOW : HIGH);
#endif
  digitalWrite(PIN_LED_OK, netUp ? HIGH : LOW);
}

// Appelé à chaque tour de boucle : mouvement doux du servo, fermeture après
// passage (capteur) ou délai, et jamais sur quelqu'un qui est dans le passage.
void updateBarrier() {
#if USE_SERVO
  static unsigned long lastStep = 0;
  if (servoAngle != servoTarget && millis() - lastStep > 12) {
    lastStep = millis();
    servoAngle += servoTarget > servoAngle ? 2 : -2;
    if (abs(servoAngle - servoTarget) < 2) servoAngle = servoTarget;
    barrier.write(servoAngle);
  }
#endif
  if (!openUntil) return;
#if USE_PASS_SENSOR
  bool blocked = digitalRead(PIN_PASS) == LOW;  // E18-D80NK : LOW = obstacle
  if (blocked) passing = true;
  if (passing && !blocked && !passed) {        // la personne est passée
    passed = true;
    openUntil = millis() + 800;
  }
  if (blocked) return;                          // ne jamais baisser sur quelqu'un
#endif
  if (millis() > openUntil) closeBarrier();
}

// ---------------------------------------------------------------- HMAC
bool hexToBytes(const String& hex, uint8_t* out, size_t len) {
  if (hex.length() != len * 2) return false;
  for (size_t i = 0; i < len; i++) out[i] = strtoul(hex.substring(2 * i, 2 * i + 2).c_str(), nullptr, 16);
  return true;
}

struct Hmac {
  mbedtls_md_context_t ctx;
  void begin() {
    uint8_t key[32];
    hexToBytes(secretHex, key, 32);
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
    mbedtls_md_hmac_starts(&ctx, key, sizeof key);
  }
  void update(const uint8_t* d, size_t n) { mbedtls_md_hmac_update(&ctx, d, n); }
  String finish() {
    uint8_t out[32];
    mbedtls_md_hmac_finish(&ctx, out);
    mbedtls_md_free(&ctx);
    char hex[65];
    for (int i = 0; i < 32; i++) sprintf(hex + 2 * i, "%02x", out[i]);
    return String(hex);
  }
};

String hmacHex(const String& msg) {
  Hmac h;
  h.begin();
  h.update((const uint8_t*)msg.c_str(), msg.length());
  return h.finish();
}

String randomHex(int bytes) {
  String s;
  char b[3];
  for (int i = 0; i < bytes; i++) { sprintf(b, "%02x", (uint8_t)esp_random()); s += b; }
  return s;
}

bool clockOk() { return time(nullptr) > 1700000000; }

// Prépare un corps JSON signé : identifiant, heure et nonce anti-rejeu.
void stamp(JsonDocument& doc, String& nonce) {
  nonce = randomHex(16);
  doc["device_id"] = deviceId;
  doc["ts"] = (long)time(nullptr);
  doc["nonce"] = nonce;
}

// La vérification TLS est remplacée par l'authentification HMAC des réponses ;
// pour aussi chiffrer vers le bon serveur, ajoutez son certificat racine
// (tls.setCACert, voir docs/PORTE.md).
bool beginPost(HTTPClient& http, WiFiClientSecure& tls, const char* path, const String& body) {
  tls.setInsecure();
  http.setTimeout(5000);
  if (!http.begin(tls, serverUrl + path)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Signature", hmacHex(body));
  return true;
}

// ---------------------------------------------------------------- lecture NDEF
bool apdu(const uint8_t* cmd, uint8_t len, uint8_t* resp, uint8_t& respLen) {
  uint8_t buf[255];
  uint8_t n = sizeof buf;
  if (!nfc.inDataExchange((uint8_t*)cmd, len, buf, &n) || n < 2) return false;
  if (buf[n - 2] != 0x90 || buf[n - 1] != 0x00) return false;
  respLen = n - 2;
  memcpy(resp, buf, respLen);
  return true;
}

const char* uriPrefix(uint8_t code) {
  static const char* p[] = {"", "http://www.", "https://www.", "http://", "https://"};
  return code < 5 ? p[code] : "";
}

// Lien signé d'une NTAG 424 DNA (vide pour une puce simple).
String readNdefUrl() {
  uint8_t r[255], rl;
  const uint8_t selApp[] = {0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00};
  const uint8_t selFile[] = {0x00, 0xA4, 0x00, 0x0C, 0x02, 0xE1, 0x04};
  if (!apdu(selApp, sizeof selApp, r, rl) || !apdu(selFile, sizeof selFile, r, rl)) return "";
  const uint8_t readLen[] = {0x00, 0xB0, 0x00, 0x00, 0x02};
  if (!apdu(readLen, sizeof readLen, r, rl) || rl < 2) return "";
  uint16_t nlen = (r[0] << 8) | r[1];
  if (nlen == 0 || nlen > 240) return "";
  uint8_t msg[256];
  uint16_t got = 0;
  while (got < nlen) {
    uint8_t chunk = min<uint16_t>(48, nlen - got);
    uint16_t off = 2 + got;
    uint8_t cmd[] = {0x00, 0xB0, (uint8_t)(off >> 8), (uint8_t)(off & 0xFF), chunk};
    if (!apdu(cmd, sizeof cmd, r, rl) || rl == 0) return "";
    memcpy(msg + got, r, rl);
    got += rl;
  }
  if (nlen < 5 || (msg[0] & 0x10) == 0 || msg[1] != 1 || msg[3] != 'U') return "";
  String url = uriPrefix(msg[4]);
  for (uint8_t i = 1; i < msg[2] && 4 + i < nlen; i++) url += (char)msg[4 + i];
  return url;
}

// ---------------------------------------------------------------- décision en ligne
enum Outcome { ALLOW, DENY, NET_ERROR };

Outcome askServer(const String& url, const String& uid, String& name, long& openMs) {
  if (!netUp || !clockOk()) return NET_ERROR;
  JsonDocument req;
  String nonce;
  stamp(req, nonce);
  if (url.length()) req["card_url"] = url;
  else req["card_uid"] = uid;
  String body;
  serializeJson(req, body);
  WiFiClientSecure tls;
  HTTPClient http;
  if (!beginPost(http, tls, "/api/v1/devices/door/access", body)) return NET_ERROR;
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  if (code <= 0 || code >= 500) return NET_ERROR;
  if (code != 200) return DENY;
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return NET_ERROR;
  bool allow = doc["allow"] | false;
  String sig = doc["sig"] | "";
  if (String(doc["nonce"] | "") != nonce || sig != hmacHex(String(allow ? "1" : "0") + "|" + nonce)) {
    Serial.println("ALERTE : réponse non authentique ignorée");
    return DENY;
  }
  name = doc["name"] | "";
  openMs = doc["open_ms"] | 5000;
  Serial.printf("Serveur : %s %s\n", allow ? "autorisé" : "refusé", (const char*)(doc["reason"] | ""));
  return allow ? ALLOW : DENY;
}

// ---------------------------------------------------------------- mode hors ligne
// Télécharge la liste signée dans /cache.tmp, vérifie la signature à la volée,
// puis remplace /cache.txt. Une liste falsifiée ou tronquée est rejetée.
bool syncCache() {
  if (!netUp || !clockOk()) return false;
  JsonDocument req;
  String nonce;
  stamp(req, nonce);
  String body;
  serializeJson(req, body);
  WiFiClientSecure tls;
  HTTPClient http;
  if (!beginPost(http, tls, "/api/v1/devices/door/sync", body)) return false;
  const char* keep[] = {"X-Signature"};
  http.collectHeaders(keep, 1);
  if (http.POST(body) != 200) { http.end(); return false; }
  String expected = http.header("X-Signature");
  File f = LittleFS.open("/cache.tmp", "w");
  if (!f) { http.end(); return false; }
  Hmac h;
  h.begin();
  WiFiClient* s = http.getStreamPtr();
  int remaining = http.getSize();
  uint8_t buf[512];
  unsigned long deadline = millis() + 20000;
  while (http.connected() && (remaining > 0 || remaining == -1) && millis() < deadline) {
    size_t n = s->available();
    if (!n) { delay(2); continue; }
    n = s->readBytes(buf, min(n, sizeof buf));
    h.update(buf, n);
    f.write(buf, n);
    if (remaining > 0) remaining -= n;
  }
  f.close();
  http.end();
  if (h.finish() != expected) {
    Serial.println("Liste hors ligne rejetée : signature invalide");
    LittleFS.remove("/cache.tmp");
    return false;
  }
  LittleFS.remove("/cache.txt");
  LittleFS.rename("/cache.tmp", "/cache.txt");
  Serial.println("Liste hors ligne à jour");
  return true;
}

// Cherche la carte et un cours ouvert de sa classe dans la liste en mémoire.
bool decideOffline(const String& uid, String& sessionId, String& reason) {
  if (!clockOk()) { reason = "heure inconnue"; return false; }
  File f = LittleFS.open("/cache.txt", "r");
  if (!f) { reason = "aucune liste hors ligne"; return false; }
  long now = time(nullptr), validUntil = 0, before = 1800;
  String classId, line;
  String cardPrefix = "C " + uid + " ";
  while (f.available()) {  // 1er passage : validité, réglages, classe de la carte
    line = f.readStringUntil('\n');
    if (line.startsWith("V ")) validUntil = line.substring(2).toInt();
    else if (line.startsWith("W ")) before = line.substring(2, line.indexOf(' ', 2)).toInt();
    else if (line.startsWith(cardPrefix)) classId = line.substring(cardPrefix.length());
  }
  if (now > validUntil) { f.close(); reason = "liste hors ligne périmée"; return false; }
  if (!classId.length()) { f.close(); reason = "carte inconnue (hors ligne)"; return false; }
  f.seek(0);
  String sessPrefix = "S " + classId + " ";
  while (f.available()) {  // 2e passage : un cours de cette classe en ce moment ?
    line = f.readStringUntil('\n');
    if (!line.startsWith(sessPrefix)) continue;
    String rest = line.substring(sessPrefix.length());
    int a = rest.indexOf(' '), b = rest.indexOf(' ', a + 1);
    long start = rest.substring(0, a).toInt(), end = rest.substring(a + 1, b).toInt();
    if (now >= start - before && now <= end) { sessionId = rest.substring(b + 1); f.close(); return true; }
  }
  f.close();
  reason = "aucun cours en ce moment (hors ligne)";
  return false;
}

// Note un passage décidé hors ligne, à remonter au serveur.
void queueEvent(const String& uid, const String& url, bool allowed, const String& sessionId, const String& reason) {
  JsonDocument e;
  e["id"] = randomHex(8);
  e["uid"] = uid;
  if (url.length()) e["url"] = url;
  e["at"] = (long)time(nullptr);
  e["allowed"] = allowed;
  if (sessionId.length()) e["session_id"] = sessionId;
  e["reason"] = reason;
  File f = LittleFS.open("/queue.txt", "a");
  if (!f) return;
  serializeJson(e, f);
  f.print('\n');
  f.close();
}

// Envoie jusqu'à 50 passages en attente ; ne supprime que ceux acceptés.
void flushQueue() {
  if (!netUp || !clockOk() || !LittleFS.exists("/queue.txt")) return;
  File f = LittleFS.open("/queue.txt", "r");
  JsonDocument req;
  String nonce;
  stamp(req, nonce);
  JsonArray evs = req["events"].to<JsonArray>();
  int n = 0;
  while (f.available() && n < 50) {
    String line = f.readStringUntil('\n');
    JsonDocument e;
    if (line.length() && !deserializeJson(e, line)) { evs.add(e); n++; }
  }
  String rest;
  while (f.available()) rest += (char)f.read();
  f.close();
  if (!n) { LittleFS.remove("/queue.txt"); return; }
  String body;
  serializeJson(req, body);
  WiFiClientSecure tls;
  HTTPClient http;
  if (!beginPost(http, tls, "/api/v1/devices/door/events", body)) return;
  int code = http.POST(body);
  http.end();
  if (code != 200) return;  // nouvel essai plus tard (le serveur ignore les doublons)
  if (rest.length()) {
    File w = LittleFS.open("/queue.txt", "w");
    w.print(rest);
    w.close();
  } else {
    LittleFS.remove("/queue.txt");
  }
  Serial.printf("%d passage(s) hors ligne remonté(s)\n", n);
}

// ---------------------------------------------------------------- réseau et configuration
#if USE_ETHERNET
void onNetEvent(arduino_event_id_t event) {
  if (event == ARDUINO_EVENT_ETH_GOT_IP) { netUp = true; Serial.println("Réseau filaire connecté : " + ETH.localIP().toString()); }
  if (event == ARDUINO_EVENT_ETH_DISCONNECTED || event == ARDUINO_EVENT_ETH_STOP) { netUp = false; Serial.println("Réseau filaire perdu"); }
}
#endif

void loadConfig() {
  prefs.begin("edupilot", true);
  serverUrl = prefs.getString("url", "");
  deviceId = prefs.getString("device", "");
  secretHex = prefs.getString("secret", "");
  prefs.end();
}

// Portail de configuration sur le Wi-Fi « EduPilote-Porte » (même en mode
// filaire) : adresse du serveur, identifiant et secret de la porte.
void configure(bool force) {
  WiFiManager wm;
  WiFiManagerParameter pUrl("url", "Adresse du serveur (https://…)", serverUrl.c_str(), 120);
  WiFiManagerParameter pDev("device", "Identifiant de la porte", deviceId.c_str(), 40);
  WiFiManagerParameter pSec("secret", "Secret (64 caractères)", "", 70);
  wm.addParameter(&pUrl);
  wm.addParameter(&pDev);
  wm.addParameter(&pSec);
  wm.setConfigPortalTimeout(600);
#if USE_ETHERNET
  wm.setBreakAfterConfig(true);  // pas besoin de Wi-Fi : on garde les réglages et on repart en filaire
  if (force) wm.startConfigPortal("EduPilote-Porte");
#else
  bool ok = force ? wm.startConfigPortal("EduPilote-Porte") : wm.autoConnect("EduPilote-Porte");
  if (!ok) ESP.restart();
  netUp = WiFi.status() == WL_CONNECTED;
#endif
  if (strlen(pUrl.getValue()) || strlen(pDev.getValue()) || strlen(pSec.getValue())) {
    prefs.begin("edupilot", false);
    if (strlen(pUrl.getValue())) prefs.putString("url", String(pUrl.getValue()));
    if (strlen(pDev.getValue())) prefs.putString("device", String(pDev.getValue()));
    if (strlen(pSec.getValue()) == 64) prefs.putString("secret", String(pSec.getValue()));
    prefs.end();
    loadConfig();
  }
#if USE_ETHERNET
  WiFi.mode(WIFI_OFF);
#endif
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_OK, OUTPUT);
  pinMode(PIN_LED_ERR, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_CONFIG, PIN_CONFIG == 0 ? INPUT_PULLUP : INPUT);  // GPIO 0 = bouton BOOT du DevKit
  pinMode(PIN_PASS, INPUT);
#if USE_SERVO
  barrier.setPeriodHertz(50);
  barrier.attach(PIN_ACTUATOR, 500, 2400);
  barrier.write(SERVO_CLOSED);
#else
  pinMode(PIN_ACTUATOR, OUTPUT);
  digitalWrite(PIN_ACTUATOR, RELAY_ACTIVE_HIGH ? LOW : HIGH);  // gâche NO : fermée sans courant
#endif
  LittleFS.begin(true);
  loadConfig();
  bool missing = serverUrl.isEmpty() || deviceId.isEmpty() || secretHex.length() != 64;
#if USE_ETHERNET
  if (missing) configure(true);
  WiFi.onEvent(onNetEvent);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ETH.begin(ETH_PHY_LAN8720, 1, 23, 18, 16, ETH_CLOCK_GPIO0_IN);
#else
  ETH.begin(1, 16, 23, 18, ETH_PHY_LAN8720, ETH_CLOCK_GPIO0_IN);
#endif
#else
  configure(missing);
#endif
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Wire.begin(PIN_SDA, PIN_SCL);
  nfc.begin();
  if (!nfc.getFirmwareVersion()) {
    Serial.println("PN532 introuvable : vérifiez le câblage et le mode I2C");
    while (true) { signalDenied(); delay(3000); }
  }
  nfc.SAMConfig();
  nfc.setPassiveActivationRetries(0x10);
  beep(400);
  Serial.printf("Prête. Porte %s → %s\n", deviceId.c_str(), serverUrl.c_str());
}

void loop() {
  updateBarrier();
#if !USE_ETHERNET
  netUp = WiFi.status() == WL_CONNECTED;
  if (!netUp) WiFi.reconnect();
#endif
  if (!openUntil) digitalWrite(PIN_LED_OK, netUp ? HIGH : LOW);
  // Bouton de configuration maintenu 5 s.
  if (digitalRead(PIN_CONFIG) == LOW) {
    unsigned long t = millis();
    while (digitalRead(PIN_CONFIG) == LOW && millis() - t < 5000) delay(10);
    if (millis() - t >= 5000) configure(true);
  }
  // Tâches réseau en arrière-plan, quand personne ne passe.
  if (netUp && !openUntil) {
    if (!lastSync || millis() - lastSync > SYNC_EVERY_MS) { if (syncCache()) lastSync = millis(); else lastSync = millis() - SYNC_EVERY_MS + 30000; }
    if (millis() - lastFlush > 15000) { lastFlush = millis(); flushQueue(); }
  }

  uint8_t uid[10];
  uint8_t uidLen = 0;
  if (!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLen, 50)) return;
  String uidHex;
  for (uint8_t i = 0; i < uidLen; i++) { char b[3]; sprintf(b, "%02X", uid[i]); uidHex += b; }
  if (uidHex == lastTapKey && millis() - lastTapMs < 3000) return;  // carte laissée sur le lecteur
  lastTapKey = uidHex;
  lastTapMs = millis();

  String url = readNdefUrl();
  String name;
  long openMs = 5000;
  switch (askServer(url, uidHex, name, openMs)) {
    case ALLOW:
      Serial.printf("Accès autorisé : %s\n", name.c_str());
      openBarrier(openMs);
      signalOk();
      return;
    case DENY:
      signalDenied();
      return;
    case NET_ERROR:
      break;  // le serveur ne répond pas : décision locale
  }
  String sessionId, reason;
  bool ok = decideOffline(uidHex, sessionId, reason);
  queueEvent(uidHex, url, ok, sessionId, ok ? "autorisé hors ligne" : reason);
  Serial.printf("Hors ligne : %s %s\n", ok ? "autorisé" : "refusé", reason.c_str());
  signalOffline();
  if (ok) { openBarrier(openMs); signalOk(); } else signalDenied();
}
