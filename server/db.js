import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.cwd(), "data");
const dbPath = path.join(dataDir, "plants.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

const createPlantsTable = `
	CREATE TABLE IF NOT EXISTS plants (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		lower_raw_reading INTEGER NOT NULL DEFAULT 4095,
		upper_raw_reading INTEGER NOT NULL DEFAULT 1500,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	)
`;

const createReadingsTable = `
	CREATE TABLE IF NOT EXISTS readings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		plant_id TEXT NOT NULL,
		raw_value INTEGER NOT NULL,
		source TEXT NOT NULL,
		received_at TEXT NOT NULL,
		FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
	)
`;

const createReadingsIndex = `
	CREATE INDEX IF NOT EXISTS idx_readings_plant_received_at
	ON readings(plant_id, received_at DESC)
`;

const createPlantOwnerTokensTable = `
	CREATE TABLE IF NOT EXISTS plant_owner_tokens (
		plant_id TEXT PRIMARY KEY,
		token_hash TEXT NOT NULL,
		created_at TEXT NOT NULL,
		last_used_at TEXT NOT NULL,
		FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
	)
`;

const createPlantIngestTokensTable = `
	CREATE TABLE IF NOT EXISTS plant_ingest_tokens (
		plant_id TEXT PRIMARY KEY,
		token_hash TEXT NOT NULL,
		created_at TEXT NOT NULL,
		last_used_at TEXT NOT NULL,
		FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE
	)
`;

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(createPlantsTable);

const plantColumns = db.prepare("PRAGMA table_info(plants)").all();
const hasLowerRawReading = plantColumns.some((column) => column.name === "lower_raw_reading");
const hasUpperRawReading = plantColumns.some((column) => column.name === "upper_raw_reading");
const hasWetThreshold = plantColumns.some((column) => column.name === "wet_threshold");
let addedLowerRawReading = false;
let addedUpperRawReading = false;

if (!hasLowerRawReading) {
	db.exec("ALTER TABLE plants ADD COLUMN lower_raw_reading INTEGER NOT NULL DEFAULT 4095");
	addedLowerRawReading = true;
}

if (!hasUpperRawReading) {
	db.exec("ALTER TABLE plants ADD COLUMN upper_raw_reading INTEGER NOT NULL DEFAULT 1500");
	addedUpperRawReading = true;
}

if (hasWetThreshold && (addedLowerRawReading || addedUpperRawReading)) {
	db.exec(`
		UPDATE plants
		SET
			lower_raw_reading = 4095,
			upper_raw_reading = wet_threshold
	`);
}

db.exec(createReadingsTable);
db.exec(createReadingsIndex);
db.exec(createPlantOwnerTokensTable);
db.exec(createPlantIngestTokensTable);

export function getDb() {
	return db;
}
