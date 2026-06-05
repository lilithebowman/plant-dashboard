#include <HTTPClient.h>
#include <WiFi.h>

const int analogPin = 36;
const unsigned long sampleDelayMs = 750;
const uint16_t httpTimeoutMs = 1000;

const char* plantIngestToken = ""; // One-time ingest token from dashboard (rotate to replace)

const char* wifiSsid = ""; // Add your Wifi details here
const char* wifiPassword = "!";


const char* plantId = ""; // get your plant ID from the dashboard
const char* serverBaseUrl = ""; // if left blank, it will use localhost

bool networkConfigured() {
  return wifiSsid[0] != '\0' &&
         wifiPassword[0] != '\0' &&
         serverBaseUrl[0] != '\0' &&
         plantId[0] != '\0';
}

bool ingestTokenConfigured() {
  return plantIngestToken[0] != '\0';
}

String readingUrl() {
  String baseUrl = String(serverBaseUrl);

  if (baseUrl.endsWith("/")) {
    baseUrl.remove(baseUrl.length() - 1);
  }

  return baseUrl + "/api/plants/" + String(plantId) + "/readings";
}

void logNetworkMessage(const char* message) {
  Serial.print("[net] ");
  Serial.println(message);
}

void startWifiIfConfigured() {
  if (!networkConfigured()) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPassword);

  Serial.print("[net] Connecting to WiFi: ");
  Serial.println(wifiSsid);
}

void postReadingIfConnected(int rawValue) {
  if (!networkConfigured() || WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  http.setConnectTimeout(httpTimeoutMs);
  http.setTimeout(httpTimeoutMs);
  http.begin(readingUrl());
  http.addHeader("Content-Type", "application/json");

  if (ingestTokenConfigured()) {
    http.addHeader("X-Plant-Token", plantIngestToken);
    http.addHeader("Authorization", "Bearer " + String(plantIngestToken));
  }

  const String payload =
      "{\"rawValue\":" + String(rawValue) + ",\"source\":\"esp32-wifi\"}";

  const int responseCode = http.POST(payload);

  if (responseCode <= 0 || responseCode >= 400) {
    Serial.print("[net] API post failed: ");
    Serial.println(responseCode);
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Plant platform sensor ready");

  if (networkConfigured()) {
    logNetworkMessage("WiFi/API mode enabled");
    if (!ingestTokenConfigured()) {
      logNetworkMessage("WARNING: ingest token missing; server accepts legacy updates but will not store history");
    }
    startWifiIfConfigured();
  } else {
    logNetworkMessage("WiFi/API mode disabled; serial-only mode is active");
  }
}

void loop() {
  const int rawValue = analogRead(analogPin);

  Serial.println(rawValue);

  postReadingIfConnected(rawValue);

  delay(sampleDelayMs);
}
