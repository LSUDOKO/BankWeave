// BankWeave card terminal (SIMULATED hardware, runs in the Wokwi ESP32 simulator).
// Buttons A/B/C tap one of the three demo NFC cards; the yellow button switches between the
// Mumbai POS (POS-MUM-D00063) and the Delhi ATM (ATM-DEL-A00091). Each tap is POSTed to
// BankWeave's /hardware/pos-tap, which builds the ISO 8583 message with EMV TLV, writes the
// transaction into the FalkorDB consortium graph and raises alerts for the agents.
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
// Public demo API. For a local backend, run it on a public tunnel and change this.
const char* API_URL = "https://bankweave-api.onrender.com/hardware/pos-tap";

const int BTN[3] = {25, 26, 27};
const char* CARD[3] = {"CARD-A", "CARD-B", "CARD-C"};
const float AMOUNT[3] = {9400.0, 9650.0, 9820.0};  // just under a 10,000 reporting line
const int BTN_TERMINAL = 14, LED_OK = 4, LED_REFER = 5;

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
bool atm = false;

void show(const String& a, const String& b = "", const String& c = "") {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println(atm ? "ATM-DEL-A00091" : "POS-MUM-D00063");
  oled.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  oled.setCursor(0, 16); oled.println(a);
  oled.setCursor(0, 32); oled.println(b);
  oled.setCursor(0, 48); oled.println(c);
  oled.display();
}

void tap(int i) {
  digitalWrite(LED_OK, LOW);
  digitalWrite(LED_REFER, LOW);
  show(String("Tap ") + CARD[i], String("INR ") + String(atm ? 20000.0 : AMOUNT[i], 0), "sending...");
  WiFiClientSecure tls;
  tls.setInsecure();  // demo only: the simulator has no CA store
  HTTPClient http;
  http.begin(tls, API_URL);
  http.addHeader("Content-Type", "application/json");
  JsonDocument req;
  req["terminal_id"] = atm ? "ATM-DEL-A00091" : "POS-MUM-D00063";
  req["card_id"] = CARD[i];
  req["amount"] = atm ? 20000.0 : AMOUNT[i];
  req["clone"] = atm;  // the Delhi ATM is where the cloned card shows up
  req["source"] = "wokwi";
  req["device_id"] = atm ? "A00091" : "D00063";  // the terminal's device id in the graph
  JsonArray gps = req["gps"].to<JsonArray>();
  gps.add(atm ? 28.6139 : 19.0760);
  gps.add(atm ? 77.2090 : 72.8777);
  String body;
  serializeJson(req, body);
  int code = http.POST(body);
  if (code != 200) {
    show("HTTP error", String(code), "API asleep? retry");
    digitalWrite(LED_REFER, HIGH);
    http.end();
    return;
  }
  JsonDocument res;
  deserializeJson(res, http.getString());
  http.end();
  String response = res["response"].as<String>();
  int alerts = res["alerts"].size();
  String rule = alerts ? res["alerts"][0]["rule"].as<String>() : "";
  Serial.printf("%s %s -> %s %s\n", CARD[i], atm ? "ATM" : "POS", response.c_str(), rule.c_str());
  Serial.println(res["iso8583"]["fields"]["55"].as<String>());  // EMV TLV, paste into emvlab.org
  show(response.substring(0, 21), alerts ? rule : "no alert", String("ATC ") + res["atc"].as<int>());
  digitalWrite(alerts ? LED_REFER : LED_OK, HIGH);
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 3; i++) pinMode(BTN[i], INPUT_PULLUP);
  pinMode(BTN_TERMINAL, INPUT_PULLUP);
  pinMode(LED_OK, OUTPUT);
  pinMode(LED_REFER, OUTPUT);
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  show("Connecting WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
  while (WiFi.status() != WL_CONNECTED) delay(100);
  show("Ready", "A/B/C = tap card", "yellow = POS/ATM");
}

void loop() {
  for (int i = 0; i < 3; i++) {
    if (digitalRead(BTN[i]) == LOW) { tap(i); delay(400); }
  }
  if (digitalRead(BTN_TERMINAL) == LOW) {
    atm = !atm;
    show("Terminal switched", atm ? "Delhi ATM (clone)" : "Mumbai POS");
    delay(400);
  }
}
