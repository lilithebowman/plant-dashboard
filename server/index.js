import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	appendPlantReading,
	createPlant,
	deletePlant,
	getPlant,
	listPlantReadings,
	listPlants,
	updatePlant,
	verifyPlantOwnerToken,
} from "./plants.js";
import { isMirrorEnabled, mirrorReadingToWorkshop } from "./mirror.js";
import {
	createAdminSession,
	isAdminLoginEnabled,
	revokeAdminSession,
	verifyAdminSession,
} from "./adminAuth.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
const adminLoginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many admin login attempts. Try again later." },
});

app.use(cors());
app.use(
	helmet({
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
	})
);
app.use(express.json({ limit: "16kb" }));

function getBearerToken(request) {
	const header = String(request.headers.authorization || "");
	if (!header.startsWith("Bearer ")) return "";
	return header.slice("Bearer ".length).trim();
}

function getAdminSessionToken(request) {
	return String(request.headers["x-admin-session"] || "").trim();
}

function isAuthorizedForPlantWrite(request, plantId) {
	const adminToken = getAdminSessionToken(request);
	if (adminToken && verifyAdminSession(adminToken)) {
		return true;
	}

	const ownerToken = getBearerToken(request);
	return verifyPlantOwnerToken(plantId, ownerToken);
}

function sendError(response, error, status = 400) {
	response.status(status).json({ error: error instanceof Error ? error.message : String(error) });
}

app.get("/api/health", (_request, response) => {
	response.json({ ok: true });
});

app.get("/api/plants", (_request, response) => {
	response.json({ plants: listPlants() });
});

app.post("/api/plants", (request, response) => {
	try {
		const result = createPlant(request.body?.name, request.body?.id);
		response.status(201).json(result);
	} catch (error) {
		sendError(response, error);
	}
});

app.get("/api/plants/:plantId", (request, response) => {
	const plant = getPlant(request.params.plantId);
	if (!plant) {
		response.status(404).json({ error: "Plant not found" });
		return;
	}
	response.json({ plant });
});

app.patch("/api/plants/:plantId", (request, response) => {
	try {
		if (!isAuthorizedForPlantWrite(request, request.params.plantId)) {
			response.status(403).json({ error: "You are not allowed to edit this plant" });
			return;
		}

		const plant = updatePlant(request.params.plantId, request.body || {});
		if (!plant) {
			response.status(404).json({ error: "Plant not found" });
			return;
		}
		response.json({ plant });
	} catch (error) {
		sendError(response, error);
	}
});

app.delete("/api/plants/:plantId", (request, response) => {
	if (!isAuthorizedForPlantWrite(request, request.params.plantId)) {
		response.status(403).json({ error: "You are not allowed to delete this plant" });
		return;
	}

	const deleted = deletePlant(request.params.plantId);
	if (!deleted) {
		response.status(404).json({ error: "Plant not found" });
		return;
	}
	response.status(204).end();
});

app.post("/api/plants/:plantId/readings", (request, response) => {
	try {
		const result = appendPlantReading(request.params.plantId, request.body || {});
		if (!result) {
			response.status(404).json({ error: "Plant not found" });
			return;
		}

		// Mirror to the workshop server in the background, without blocking local writes.
		void mirrorReadingToWorkshop(request.params.plantId, result.reading);

		response.status(201).json(result);
	} catch (error) {
		sendError(response, error);
	}
});

app.get("/api/plants/:plantId/readings", (request, response) => {
	const result = listPlantReadings(request.params.plantId, request.query.limit, request.query.range);
	if (!result) {
		response.status(404).json({ error: "Plant not found" });
		return;
	}
	response.json(result);
});

app.post("/api/admin/login", adminLoginLimiter, (request, response) => {
	try {
		const session = createAdminSession(request.body?.username, request.body?.password);
		response.json({
			adminLoginEnabled: isAdminLoginEnabled(),
			session,
		});
	} catch (error) {
		sendError(response, error, 401);
	}
});

app.post("/api/admin/logout", (request, response) => {
	const token = getAdminSessionToken(request);
	revokeAdminSession(token);
	response.status(204).end();
});

app.get("/api/admin/plants", (request, response) => {
	const token = getAdminSessionToken(request);
	if (!verifyAdminSession(token)) {
		response.status(401).json({ error: "Admin login required" });
		return;
	}

	response.json({ plants: listPlants() });
});

app.patch("/api/admin/plants/:plantId", (request, response) => {
	const token = getAdminSessionToken(request);
	if (!verifyAdminSession(token)) {
		response.status(401).json({ error: "Admin login required" });
		return;
	}

	try {
		const plant = updatePlant(request.params.plantId, request.body || {});
		if (!plant) {
			response.status(404).json({ error: "Plant not found" });
			return;
		}
		response.json({ plant });
	} catch (error) {
		sendError(response, error);
	}
});

app.delete("/api/admin/plants/:plantId", (request, response) => {
	const token = getAdminSessionToken(request);
	if (!verifyAdminSession(token)) {
		response.status(401).json({ error: "Admin login required" });
		return;
	}

	const deleted = deletePlant(request.params.plantId);
	if (!deleted) {
		response.status(404).json({ error: "Plant not found" });
		return;
	}

	response.status(204).end();
});

if (fs.existsSync(distDir)) {
	app.use(express.static(distDir));
	app.get(/^(?!\/api).*/, (_request, response) => {
		response.sendFile(path.join(distDir, "index.html"));
	});
}

app.listen(port, () => {
	console.log(`Plant API listening on http://localhost:${port}`);
	if (isMirrorEnabled()) {
		console.log(`Workshop mirror enabled -> ${process.env.WORKSHOP_MIRROR_BASE_URL}`);
	}
	if (!isAdminLoginEnabled()) {
		console.warn("Admin login is disabled. Set ADMIN_JWT_SECRET and ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD) to enable /api/admin/login.");
	}
});
