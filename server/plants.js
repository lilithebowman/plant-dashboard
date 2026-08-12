import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "./db.js";

const DRY_VALUE = 4095;
const DEFAULT_LOWER_RAW_READING = DRY_VALUE;
const DEFAULT_UPPER_RAW_READING = 1500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyLatestReadings = new Map();

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function normalizeRawValue(rawValue) {
	const numericValue = Number(rawValue);
	if (!Number.isFinite(numericValue)) {
		return null;
	}
	return clamp(Math.round(numericValue), 0, DRY_VALUE);
}

function sanitizePlantName(name) {
	const normalized = String(name || "").trim().replace(/\s+/g, " ");
	if (!normalized) {
		throw new Error("Plant name is required");
	}
	if (normalized.length > 60) {
		throw new Error("Plant name must be 60 characters or fewer");
	}
	return normalized;
}

function sanitizePlantId(plantId) {
	if (plantId == null || `${plantId}`.trim() === "") {
		return randomUUID();
	}
	const normalized = String(plantId).trim().toLowerCase();
	if (!UUID_PATTERN.test(normalized)) {
		throw new Error("Plant UUID must be a valid UUID");
	}
	return normalized;
}

function createOwnerToken() {
	return `${randomUUID()}${randomBytes(16).toString("hex")}`;
}

function createIngestToken() {
	return `${randomUUID()}${randomBytes(24).toString("hex")}`;
}

function hashToken(token) {
	return createHash("sha256").update(String(token || "")).digest("hex");
}

function constantTimeHashEquals(leftHash, rightHash) {
	const left = Buffer.from(leftHash || "", "hex");
	const right = Buffer.from(rightHash || "", "hex");
	if (left.length === 0 || right.length === 0 || left.length !== right.length) {
		return false;
	}
	return timingSafeEqual(left, right);
}

function sanitizeCalibrationRawValue(rawValue, fallback) {
	const numericValue = Number(rawValue);
	if (!Number.isFinite(numericValue)) {
		return fallback;
	}
	return clamp(Math.round(numericValue), 0, DRY_VALUE);
}

function sanitizeCalibrationBounds(bounds = {}) {
	const lowerRawReading = sanitizeCalibrationRawValue(
		bounds.lowerRawReading,
		DEFAULT_LOWER_RAW_READING
	);
	const upperRawReading = sanitizeCalibrationRawValue(
		bounds.upperRawReading,
		DEFAULT_UPPER_RAW_READING
	);

	if (lowerRawReading === upperRawReading) {
		throw new Error("`lowerRawReading` and `upperRawReading` must be different values");
	}

	return {
		lowerRawReading,
		upperRawReading,
	};
}

function sanitizeCalibrationBoundsFromUpdate(updates = {}, current) {
	const hasLower = typeof updates.lowerRawReading !== "undefined";
	const hasUpper = typeof updates.upperRawReading !== "undefined";

	if (!hasLower && !hasUpper && typeof updates.wetThreshold !== "undefined") {
		return {
			lowerRawReading: DEFAULT_LOWER_RAW_READING,
			upperRawReading: sanitizeCalibrationRawValue(
				updates.wetThreshold,
				DEFAULT_UPPER_RAW_READING
			),
		};
	}

	const lowerRawReading = hasLower
		? sanitizeCalibrationRawValue(updates.lowerRawReading, current.lowerRawReading)
		: current.lowerRawReading;
	const upperRawReading = hasUpper
		? sanitizeCalibrationRawValue(updates.upperRawReading, current.upperRawReading)
		: current.upperRawReading;

	if (lowerRawReading === upperRawReading) {
		throw new Error("`lowerRawReading` and `upperRawReading` must be different values");
	}

	return {
		lowerRawReading,
		upperRawReading,
	};
}

function sanitizeSource(source) {
	const normalized = String(source || "api").trim().slice(0, 40);
	return normalized || "api";
}

function normalizeReceivedAt(receivedAt) {
	if (!receivedAt) {
		return new Date().toISOString();
	}
	const date = new Date(receivedAt);
	if (Number.isNaN(date.getTime())) {
		throw new Error("`receivedAt` must be a valid ISO timestamp");
	}
	return date.toISOString();
}

function resolveHistoryWindow(range) {
	const normalizedRange = String(range || "").trim().toLowerCase();
	const now = Date.now();
	if (normalizedRange === "week") {
		return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
	}
	if (normalizedRange === "month") {
		return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
	}
	if (normalizedRange === "year") {
		return new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
	}
	return null;
}

function downsampleReadingsByWindow(rows, windowStartIso, maxPoints = 60) {
	if (!Array.isArray(rows) || rows.length <= maxPoints) {
		return rows;
	}

	const startMs = new Date(windowStartIso).getTime();
	const endMs = Date.now();
	const durationMs = Math.max(1, endMs - startMs);
	const bucketWidthMs = durationMs / maxPoints;
	const buckets = new Array(maxPoints).fill(null);

	for (const row of rows) {
		const ts = new Date(row.receivedAt).getTime();
		if (!Number.isFinite(ts)) continue;
		const normalized = Math.min(Math.max(ts - startMs, 0), durationMs - 1);
		const index = Math.min(maxPoints - 1, Math.floor(normalized / bucketWidthMs));
		// Keep the newest reading in each time bucket.
		buckets[index] = row;
	}

	return buckets.filter(Boolean);
}

function mapRawToPercent(rawValue, lowerRawReading, upperRawReading) {
	const normalizedRawValue = normalizeRawValue(rawValue);
	if (normalizedRawValue === null) {
		return null;
	}
	const range = upperRawReading - lowerRawReading;
	if (range === 0) {
		return null;
	}
	return clamp(((normalizedRawValue - lowerRawReading) / range) * 100, 0, 100);
}

function decorateReading(reading, lowerRawReading, upperRawReading) {
	if (!reading) {
		return null;
	}
	const moisturePercent = mapRawToPercent(
		reading.rawValue,
		lowerRawReading,
		upperRawReading
	);
	return {
		...reading,
		moisturePercent:
			moisturePercent === null ? null : Number(moisturePercent.toFixed(1)),
	};
}

function mapPlantSummary(row) {
	const calibration = sanitizeCalibrationBounds({
		lowerRawReading: row.lowerRawReading,
		upperRawReading: row.upperRawReading,
	});
	const latestReading = row.latestRawValue == null
		? null
		: decorateReading(
			{
				rawValue: Number(row.latestRawValue),
				source: row.latestSource || "api",
				receivedAt: row.latestReceivedAt,
			},
			calibration.lowerRawReading,
			calibration.upperRawReading
		);

	return {
		id: row.id,
		name: row.name,
		lowerRawReading: calibration.lowerRawReading,
		upperRawReading: calibration.upperRawReading,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		latestReading,
	};
}

function applyLegacyLatestReading(plant) {
	const legacyReading = legacyLatestReadings.get(plant.id);
	if (!legacyReading) {
		return plant;
	}

	const currentLatestAt = plant.latestReading?.receivedAt
		? new Date(plant.latestReading.receivedAt).getTime()
		: 0;
	const legacyLatestAt = legacyReading.receivedAt
		? new Date(legacyReading.receivedAt).getTime()
		: 0;

	if (legacyLatestAt > currentLatestAt) {
		return {
			...plant,
			latestReading: legacyReading,
		};
	}

	return plant;
}

function getPlantSummaryRow(plantId) {
	const db = getDb();
	return db.prepare(`
		SELECT
			p.id,
			p.name,
			p.lower_raw_reading AS lowerRawReading,
			p.upper_raw_reading AS upperRawReading,
			p.created_at AS createdAt,
			p.updated_at AS updatedAt,
			r.raw_value AS latestRawValue,
			r.source AS latestSource,
			r.received_at AS latestReceivedAt
		FROM plants p
		LEFT JOIN readings r ON r.id = (
			SELECT id FROM readings
			WHERE plant_id = p.id
			ORDER BY received_at DESC, id DESC
			LIMIT 1
		)
		WHERE p.id = ?
	`).get(plantId);
}

export function listPlants() {
	const db = getDb();
	const rows = db.prepare(`
		SELECT
			p.id,
			p.name,
			p.lower_raw_reading AS lowerRawReading,
			p.upper_raw_reading AS upperRawReading,
			p.created_at AS createdAt,
			p.updated_at AS updatedAt,
			r.raw_value AS latestRawValue,
			r.source AS latestSource,
			r.received_at AS latestReceivedAt
		FROM plants p
		LEFT JOIN readings r ON r.id = (
			SELECT id FROM readings
			WHERE plant_id = p.id
			ORDER BY received_at DESC, id DESC
			LIMIT 1
		)
		ORDER BY p.created_at ASC
	`).all();
	return rows.map((row) => applyLegacyLatestReading(mapPlantSummary(row)));
}

export function getPlant(plantId) {
	const row = getPlantSummaryRow(plantId);
	if (!row) {
		return null;
	}
	const summary = applyLegacyLatestReading(mapPlantSummary(row));
	return {
		...summary,
		apiPath: `/api/plants/${plantId}/readings`,
	};
}

export function createPlant(name, plantId, options = {}) {
	const db = getDb();
	const id = sanitizePlantId(plantId);
	const normalizedName = sanitizePlantName(name);
	const now = new Date().toISOString();
	const calibration = sanitizeCalibrationBounds({
		lowerRawReading: options.lowerRawReading,
		upperRawReading: typeof options.upperRawReading === "undefined"
			? options.wetThreshold
			: options.upperRawReading,
	});
	const ownerToken = createOwnerToken();
	const ownerTokenHash = hashToken(ownerToken);

	const existing = db.prepare(`SELECT id FROM plants WHERE id = ? LIMIT 1`).get(id);
	if (existing) {
		throw new Error("Plant UUID already exists");
	}

	db.prepare(`
		INSERT INTO plants (id, name, lower_raw_reading, upper_raw_reading, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(
		id,
		normalizedName,
		calibration.lowerRawReading,
		calibration.upperRawReading,
		now,
		now
	);

	db.prepare(`
		INSERT INTO plant_owner_tokens (plant_id, token_hash, created_at, last_used_at)
		VALUES (?, ?, ?, ?)
	`).run(id, ownerTokenHash, now, now);

	const ingestToken = createIngestToken();
	const ingestTokenHash = hashToken(ingestToken);
	db.prepare(`
		INSERT INTO plant_ingest_tokens (plant_id, token_hash, created_at, last_used_at)
		VALUES (?, ?, ?, ?)
	`).run(id, ingestTokenHash, now, now);

	return {
		plant: getPlant(id),
		creatorToken: ownerToken,
		ingestToken,
	};
}

export function verifyPlantOwnerToken(plantId, providedToken) {
	const db = getDb();
	if (!providedToken) {
		return false;
	}

	const row = db.prepare(`
		SELECT token_hash as tokenHash
		FROM plant_owner_tokens
		WHERE plant_id = ?
		LIMIT 1
	`).get(plantId);

	if (!row?.tokenHash) {
		return false;
	}

	const providedHash = hashToken(providedToken);
	const valid = constantTimeHashEquals(row.tokenHash, providedHash);
	if (!valid) {
		return false;
	}

	db.prepare(`
		UPDATE plant_owner_tokens
		SET last_used_at = ?
		WHERE plant_id = ?
	`).run(new Date().toISOString(), plantId);

	return true;
}

export function updatePlant(plantId, updates) {
	const db = getDb();
	const existing = db.prepare(`SELECT id FROM plants WHERE id = ? LIMIT 1`).get(plantId);
	if (!existing) {
		return null;
	}

	const nextName = typeof updates.name === "undefined"
		? undefined
		: sanitizePlantName(updates.name);

	const current = db.prepare(`
		SELECT
			name,
			lower_raw_reading as lowerRawReading,
			upper_raw_reading as upperRawReading
		FROM plants
		WHERE id = ?
	`).get(plantId);
	const nextCalibration = sanitizeCalibrationBoundsFromUpdate(updates, current);
	const finalName = typeof nextName === "undefined" ? current.name : nextName;

	db.prepare(`
		UPDATE plants
		SET name = ?, lower_raw_reading = ?, upper_raw_reading = ?, updated_at = ?
		WHERE id = ?
	`).run(
		finalName,
		nextCalibration.lowerRawReading,
		nextCalibration.upperRawReading,
		new Date().toISOString(),
		plantId
	);

	return getPlant(plantId);
}

export function verifyPlantIngestToken(plantId, providedToken) {
	const db = getDb();
	if (!providedToken) {
		return false;
	}

	const row = db.prepare(`
		SELECT token_hash as tokenHash
		FROM plant_ingest_tokens
		WHERE plant_id = ?
		LIMIT 1
	`).get(plantId);

	if (!row?.tokenHash) {
		return false;
	}

	const providedHash = hashToken(providedToken);
	const valid = constantTimeHashEquals(row.tokenHash, providedHash);
	if (!valid) {
		return false;
	}

	db.prepare(`
		UPDATE plant_ingest_tokens
		SET last_used_at = ?
		WHERE plant_id = ?
	`).run(new Date().toISOString(), plantId);

	return true;
}

export function rotatePlantIngestToken(plantId) {
	const db = getDb();
	const plant = db.prepare(`SELECT id FROM plants WHERE id = ? LIMIT 1`).get(plantId);
	if (!plant) {
		return null;
	}

	const now = new Date().toISOString();
	const ingestToken = createIngestToken();
	const ingestTokenHash = hashToken(ingestToken);

	db.prepare(`
		INSERT INTO plant_ingest_tokens (plant_id, token_hash, created_at, last_used_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(plant_id) DO UPDATE SET
			token_hash = excluded.token_hash,
			created_at = excluded.created_at,
			last_used_at = excluded.last_used_at
	`).run(plantId, ingestTokenHash, now, now);

	return {
		plantId,
		ingestToken,
	};
}

export function deletePlant(plantId) {
	const db = getDb();
	const result = db.prepare(`DELETE FROM plants WHERE id = ?`).run(plantId);
	return result.changes > 0;
}

export function appendPlantReading(plantId, payload, options = {}) {
	const db = getDb();
	const plant = db.prepare(`
		SELECT
			id,
			lower_raw_reading as lowerRawReading,
			upper_raw_reading as upperRawReading
		FROM plants
		WHERE id = ?
		LIMIT 1
	`).get(plantId);
	if (!plant) {
		return null;
	}

	const rawValue = normalizeRawValue(payload.rawValue);
	if (rawValue === null) {
		throw new Error("`rawValue` must be a number between 0 and 4095");
	}

	const source = sanitizeSource(payload.source);
	const receivedAt = normalizeReceivedAt(payload.receivedAt);
	const shouldPersist = options.persist !== false;
	const reading = decorateReading(
		{ rawValue, source, receivedAt },
		plant.lowerRawReading,
		plant.upperRawReading
	);

	if (!shouldPersist) {
		legacyLatestReadings.set(plantId, reading);
		return {
			plant: getPlant(plantId),
			reading,
			stored: false,
		};
	}

	db.prepare(`
		INSERT INTO readings (plant_id, raw_value, source, received_at)
		VALUES (?, ?, ?, ?)
	`).run(plantId, rawValue, source, receivedAt);

	db.prepare(`UPDATE plants SET updated_at = ? WHERE id = ?`).run(receivedAt, plantId);

	return {
		plant: getPlant(plantId),
		reading,
		stored: true,
	};
}

export function listPlantReadings(plantId, limit = 60, range) {
	const db = getDb();
	const plant = getPlant(plantId);
	if (!plant) {
		return null;
	}

	const windowStartIso = resolveHistoryWindow(range);
	let rows;

	if (windowStartIso) {
		rows = db.prepare(`
			SELECT raw_value as rawValue, source, received_at as receivedAt
			FROM readings
			WHERE plant_id = ? AND received_at >= ?
			ORDER BY received_at ASC, id ASC
		`).all(plantId, windowStartIso);
		rows = downsampleReadingsByWindow(rows, windowStartIso, 60);
	} else {
		const safeLimit = clamp(Number(limit) || 60, 1, 500);
		rows = db.prepare(`
			SELECT raw_value as rawValue, source, received_at as receivedAt
			FROM readings
			WHERE plant_id = ?
			ORDER BY received_at DESC, id DESC
			LIMIT ?
		`).all(plantId, safeLimit);
		rows = rows.reverse();
	}

	return {
		plant: applyLegacyLatestReading(plant),
		readings: rows
			.map((row) => decorateReading(row, plant.lowerRawReading, plant.upperRawReading)),
	};
}
