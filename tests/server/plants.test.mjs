import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_CWD = process.cwd();
let tempDir;
let plants;

function isoDaysAgo(days) {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(async () => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plant-dashboard-test-"));
	process.chdir(tempDir);
	plants = await import(`../../server/plants.js?test=${Date.now()}-${Math.random()}`);
});

afterEach(() => {
	process.chdir(ORIGINAL_CWD);
	if (tempDir) {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test("creates plants and validates unsafe or invalid input", () => {
	const plantId = "11111111-1111-4111-8111-111111111111";
	const result = plants.createPlant("  Aloe Vera  ", plantId);

	assert.equal(result.plant.name, "Aloe Vera");
	assert.equal(result.plant.lowerRawReading, 4095);
	assert.equal(result.plant.upperRawReading, 1500);
	assert.equal(typeof result.creatorToken, "string");
	assert.equal(typeof result.ingestToken, "string");
	assert.throws(() => plants.createPlant("x", "not-a-uuid"), /valid UUID/);
	assert.throws(
		() => plants.createPlant("x".repeat(61), "22222222-2222-4222-8222-222222222222"),
		/60 characters or fewer/
	);
	assert.throws(
		() => plants.createPlant("Equal bounds", "22222222-2222-4222-8222-333333333333", {
			lowerRawReading: 1800,
			upperRawReading: 1800,
		}),
		/different values/
	);
});

test("calculates moisture percent using lower/upper calibration and supports inverted readings", () => {
	const normalPlantId = "12345678-1234-4234-8234-123456789abc";
	plants.createPlant("Normal Sensor", normalPlantId, {
		lowerRawReading: 500,
		upperRawReading: 3500,
	});

	const normalReading = plants.appendPlantReading(normalPlantId, {
		rawValue: 2000,
		source: "sensor",
	});
	assert.equal(normalReading.reading.moisturePercent, 50);

	const invertedPlantId = "abcdefab-cdef-4def-8def-abcdefabcdef";
	plants.createPlant("Inverted Sensor", invertedPlantId, {
		lowerRawReading: 3500,
		upperRawReading: 500,
	});

	const invertedReading = plants.appendPlantReading(invertedPlantId, {
		rawValue: 2000,
		source: "sensor",
	});
	assert.equal(invertedReading.reading.moisturePercent, 50);
});

test("accepts only valid owner token for write authorization", () => {
	const plantId = "33333333-3333-4333-8333-333333333333";
	const { creatorToken } = plants.createPlant("Basil", plantId);

	assert.equal(plants.verifyPlantOwnerToken(plantId, creatorToken), true);
	assert.equal(plants.verifyPlantOwnerToken(plantId, "wrong-token"), false);
});

test("accepts only valid ingest token for persisted readings", () => {
	const plantId = "66666666-6666-4666-8666-666666666666";
	const { ingestToken } = plants.createPlant("Orchid", plantId);

	assert.equal(plants.verifyPlantIngestToken(plantId, ingestToken), true);
	assert.equal(plants.verifyPlantIngestToken(plantId, "wrong-token"), false);
});

test("rotates ingest token and invalidates the previous token", () => {
	const plantId = "88888888-8888-4888-8888-888888888888";
	const { ingestToken: firstToken } = plants.createPlant("Rotate Test", plantId);

	const rotated = plants.rotatePlantIngestToken(plantId);
	assert.equal(typeof rotated?.ingestToken, "string");
	assert.notEqual(rotated?.ingestToken, firstToken);

	assert.equal(plants.verifyPlantIngestToken(plantId, firstToken), false);
	assert.equal(plants.verifyPlantIngestToken(plantId, rotated.ingestToken), true);
});

test("supports history windows for week, month, and year", () => {
	const plantId = "44444444-4444-4444-8444-444444444444";
	plants.createPlant("Fern", plantId);

	plants.appendPlantReading(plantId, { rawValue: 1200, receivedAt: isoDaysAgo(1), source: "sensor" });
	plants.appendPlantReading(plantId, { rawValue: 1300, receivedAt: isoDaysAgo(8), source: "sensor" });
	plants.appendPlantReading(plantId, { rawValue: 1400, receivedAt: isoDaysAgo(20), source: "sensor" });
	plants.appendPlantReading(plantId, { rawValue: 1500, receivedAt: isoDaysAgo(200), source: "sensor" });
	plants.appendPlantReading(plantId, { rawValue: 1600, receivedAt: isoDaysAgo(400), source: "sensor" });

	const week = plants.listPlantReadings(plantId, 60, "week");
	const month = plants.listPlantReadings(plantId, 60, "month");
	const year = plants.listPlantReadings(plantId, 60, "year");
	const last60 = plants.listPlantReadings(plantId, 60);

	assert.equal(week.readings.length, 1);
	assert.equal(month.readings.length, 3);
	assert.equal(year.readings.length, 4);
	assert.equal(last60.readings.length, 5);
});

test("caps ranged history to 60 evenly spread points", () => {
	const plantId = "99999999-9999-4999-8999-999999999999";
	plants.createPlant("Dense Week", plantId);

	// 7 days of hourly readings => 168 points
	for (let hour = 0; hour < 24 * 7; hour += 1) {
		const receivedAt = new Date(Date.now() - ((24 * 7 - hour) * 60 * 60 * 1000)).toISOString();
		plants.appendPlantReading(plantId, {
			rawValue: 1000 + (hour % 250),
			source: "sensor",
			receivedAt,
		});
	}

	const week = plants.listPlantReadings(plantId, 60, "week");
	assert.equal(week.readings.length <= 60, true);
	assert.equal(week.readings.length >= 40, true);

	const firstTs = new Date(week.readings[0].receivedAt).getTime();
	const lastTs = new Date(week.readings[week.readings.length - 1].receivedAt).getTime();
	const spanHours = (lastTs - firstTs) / (60 * 60 * 1000);
	assert.equal(spanHours > 72, true);
});

test("normalizes risky source input length", () => {
	const plantId = "55555555-5555-4555-8555-555555555555";
	plants.createPlant("Mint", plantId);
	const longSource = "<script>alert(1)</script>".repeat(4);
	const result = plants.appendPlantReading(plantId, {
		rawValue: 1234,
		source: longSource,
		receivedAt: new Date().toISOString(),
	});

	assert.equal(result.reading.source.length <= 40, true);
});

test("keeps legacy tokenless updates out of history while showing latest snapshot", () => {
	const plantId = "77777777-7777-4777-8777-777777777777";
	plants.createPlant("Legacy Test", plantId);

	const legacy = plants.appendPlantReading(
		plantId,
		{
			rawValue: 1111,
			source: "legacy-device",
			receivedAt: new Date().toISOString(),
		},
		{ persist: false }
	);

	assert.equal(legacy.stored, false);

	const history = plants.listPlantReadings(plantId, 60);
	assert.equal(history.readings.length, 0);
	assert.equal(history.plant.latestReading?.source, "legacy-device");
	assert.equal(history.plant.latestReading?.rawValue, 1111);
});
