import express from "express";
import cors from "cors";
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
} from "./plants.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

app.use(cors());
app.use(express.json());

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
		const plant = createPlant(request.body?.name, request.body?.id);
		response.status(201).json({ plant });
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
		response.status(201).json(result);
	} catch (error) {
		sendError(response, error);
	}
});

app.get("/api/plants/:plantId/readings", (request, response) => {
	const result = listPlantReadings(request.params.plantId, request.query.limit);
	if (!result) {
		response.status(404).json({ error: "Plant not found" });
		return;
	}
	response.json(result);
});

if (fs.existsSync(distDir)) {
	app.use(express.static(distDir));
	app.get(/^(?!\/api).*/, (_request, response) => {
		response.sendFile(path.join(distDir, "index.html"));
	});
}

app.listen(port, () => {
	console.log(`Plant API listening on http://localhost:${port}`);
});
