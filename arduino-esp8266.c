// Test plant ab8ed7e8-172c-476c-bc34-4ca0fa11cfe5

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>

const int analogPin = A0;
const unsigned long sampleDelayMs = 750;
const uint16_t httpTimeoutMs = 1000;

const char* plantId = ""; // get your plant ID and ingest token from the dashboard
const char* plantIngestToken = "";

const char* wifiSsid = ""; // Your WiFi details go here
const char* wifiPassword = "";

const char* serverBaseUrl = ""; // the server to send data updates to

// ------------------------------
// Offline Buffer
// ------------------------------
static const int MAX_BUFFERED = 40;   // fits safely in ESP8266 RAM
int bufferedValues[MAX_BUFFERED];
int bufferCount = 0;

// Exponential backoff (ms)
unsigned long nextRetryAt = 0;
unsigned long backoffDelay = 2000;  // starts at 2s
const unsigned long maxBackoff = 60000; // caps at 60s

// ------------------------------

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
  if (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  return baseUrl + "/api/plants/" + String(plantId) + "/readings";
}

void logNetworkMessage(const char* message) {
  Serial.print("[net] ");
  Serial.println(message);
}

void startWifiIfConfigured() {
  if (!networkConfigured()) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPassword);

  Serial.print("[net] Connecting to WiFi: ");
  Serial.println(wifiSsid);
}

// ------------------------------
// Buffer Management
// ------------------------------

void bufferValue(int rawValue) {
  if (bufferCount < MAX_BUFFERED) {
    bufferedValues[bufferCount++] = rawValue;
    Serial.print("[buf] Stored offline reading. Count=");
    Serial.println(bufferCount);
  } else {
    Serial.println("[buf] Buffer full; dropping oldest");
    for (int i = 1; i < MAX_BUFFERED; i++) {
      bufferedValues[i - 1] = bufferedValues[i];
    }
    bufferedValues[MAX_BUFFERED - 1] = rawValue;
  }
}

bool sendReading(int rawValue) {
  WiFiClientSecure client;
  client.setInsecure();  // allow HTTPS without certificate

  HTTPClient http;
  http.setTimeout(httpTimeoutMs);
  http.begin(client, readingUrl());

  http.addHeader("Content-Type", "application/json");
  if (ingestTokenConfigured()) {
    http.addHeader("X-Plant-Token", plantIngestToken);
    http.addHeader("Authorization", "Bearer " + String(plantIngestToken));
  }

  String payload =
      "{\"rawValue\":" + String(rawValue) + ",\"source\":\"esp8266-wifi\"}";

  int responseCode = http.POST(payload);
  http.end();

  if (responseCode > 0 && responseCode < 400) {
    Serial.print("[net] Sent reading OK: ");
    Serial.println(rawValue);
    return true;
  }

  Serial.print("[net] Send failed: ");
  Serial.println(responseCode);
  return false;
}

void flushBufferIfPossible() {
  if (bufferCount == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();
  if (now < nextRetryAt) return;

  Serial.print("[buf] Attempting flush of ");
  Serial.print(bufferCount);
  Serial.println(" readings");

  int i = 0;
  while (i < bufferCount) {
    if (!sendReading(bufferedValues[i])) {
      Serial.println("[buf] Flush failed; applying backoff");

      nextRetryAt = now + backoffDelay;
      backoffDelay = min(backoffDelay * 2, maxBackoff);
      return;
    }

    // Shift remaining values down
    for (int j = i + 1; j < bufferCount; j++) {
      bufferedValues[j - 1] = bufferedValues[j];
    }
    bufferCount--;
  }

  Serial.println("[buf] Flush complete; resetting backoff");
  backoffDelay = 2000;
  nextRetryAt = 0;
}

// ------------------------------

void postReadingIfConnected(int rawValue) {
  if (!networkConfigured()) return;

  if (WiFi.status() != WL_CONNECTED) {
    bufferValue(rawValue);
    return;
  }

  // Try to flush old data first
  flushBufferIfPossible();

  // Now send the new reading
  if (!sendReading(rawValue)) {
    bufferValue(rawValue);
  }
}

// ------------------------------

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
  int rawValue = analogRead(analogPin);
  Serial.println(rawValue);

  postReadingIfConnected(rawValue);

  delay(sampleDelayMs);
}
