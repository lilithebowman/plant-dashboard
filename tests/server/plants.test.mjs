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
	assert.equal(typeof result.creatorToken, "string");
	assert.throws(() => plants.createPlant("x", "not-a-uuid"), /valid UUID/);
	assert.throws(
		() => plants.createPlant("x".repeat(61), "22222222-2222-4222-8222-222222222222"),
		/60 characters or fewer/
	);
});

test("accepts only valid owner token for write authorization", () => {
	const plantId = "33333333-3333-4333-8333-333333333333";
	const { creatorToken } = plants.createPlant("Basil", plantId);

	assert.equal(plants.verifyPlantOwnerToken(plantId, creatorToken), true);
	assert.equal(plants.verifyPlantOwnerToken(plantId, "wrong-token"), false);
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
