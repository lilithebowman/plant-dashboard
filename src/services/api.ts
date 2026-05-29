// api.ts
import { Plant } from "../types/plant";
import { generateUuid } from "../utils/uuid";

type CreatePlantInput = {
	name: string;
	uuid: string;
};

type UpdatePlantInput = {
	name: string;
	wetThreshold: number;
};

type ApiReading = {
	rawValue: number;
	source: string;
	receivedAt: string;
	moisturePercent: number | null;
};

type ApiPlant = {
	id: string;
	name: string;
	wetThreshold?: number;
	latestReading?: ApiReading | null;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
	.trim()
	.replace(/\/+$/, "");

function apiUrl(path: string): string {
	return `${API_BASE_URL}${path}`;
}

export function getMoistureEndpoint(uuid: string): string {
	if (API_BASE_URL) {
		return apiUrl(`/api/plants/${uuid}/readings`);
	}

	return `${window.location.origin}/api/plants/${uuid}/readings`;
}

function mapRawToPercent(rawValue: number): number {
	const dryValue = 4095;
	const wetThreshold = 1500;
	const clamped = Math.max(0, Math.min(dryValue, Math.round(rawValue)));
	const range = dryValue - wetThreshold;
	if (range <= 0) return clamped <= wetThreshold ? 100 : 0;
	const percent = ((dryValue - clamped) / range) * 100;
	return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
}

function mapApiPlant(input: ApiPlant): Plant {
	return {
		id: input.id,
		name: input.name,
		uuid: input.id,
		wetThreshold: input.wetThreshold ?? 1500,
		moisture: input.latestReading?.moisturePercent ?? null,
		lastUpdated: input.latestReading?.receivedAt ?? null,
		latestRawValue: input.latestReading?.rawValue ?? null,
		source: input.latestReading?.source ?? null,
	};
}

function extractPlantList(payload: { plants?: ApiPlant[] } | ApiPlant[]): ApiPlant[] {
	return Array.isArray(payload) ? payload : payload.plants ?? [];
}

function extractPlant(payload: { plant: ApiPlant } | ApiPlant): ApiPlant {
	return "plant" in payload ? payload.plant : payload;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
		...init,
	});

	if (!response.ok) {
		throw new Error(`Request failed: ${response.status} ${response.statusText}`);
	}

	if (response.status === 204) {
		return null as T;
	}

	return (await response.json()) as T;
}

// In local/mock mode this starts empty and is populated only by API submissions.
const plantsById: Record<string, Plant> = {};

export async function fetchPlants(): Promise<Plant[]> {
	if (API_BASE_URL) {
		const data = await fetchJson<{ plants?: ApiPlant[] } | ApiPlant[]>(
			apiUrl("/api/plants")
		);
		return extractPlantList(data).map(mapApiPlant);
	}

	await delay(120);
	return Object.values(plantsById);
}

export async function createPlant(input: CreatePlantInput): Promise<Plant> {
	const normalizedName = input.name.trim();
	const normalizedUuid = input.uuid.trim() || generateUuid();

	if (API_BASE_URL) {
		const data = await fetchJson<{ plant: ApiPlant } | ApiPlant>(
			apiUrl("/api/plants"),
			{
				method: "POST",
				body: JSON.stringify({ name: normalizedName, id: normalizedUuid }),
			}
		);
		return mapApiPlant(extractPlant(data));
	}

	await delay(120);
	if (plantsById[normalizedUuid]) {
		throw new Error("Plant UUID already exists");
	}

	const plant: Plant = {
		id: normalizedUuid,
		name: normalizedName,
		uuid: normalizedUuid,
		wetThreshold: 1500,
		moisture: null,
		lastUpdated: null,
		latestRawValue: null,
		source: null,
	};
	plantsById[plant.id] = plant;
	return plant;
}

export async function updatePlant(
	plantId: string,
	updates: UpdatePlantInput
): Promise<Plant> {
	const payload = {
		name: updates.name.trim(),
		wetThreshold: updates.wetThreshold,
	};

	if (API_BASE_URL) {
		const data = await fetchJson<{ plant: ApiPlant }>(
			apiUrl(`/api/plants/${plantId}`),
			{
				method: "PATCH",
				body: JSON.stringify(payload),
			}
		);
		return mapApiPlant(data.plant);
	}

	await delay(120);
	const existing = plantsById[plantId];
	if (!existing) {
		throw new Error("Plant not found");
	}

	const updated: Plant = {
		...existing,
		name: payload.name,
		wetThreshold: payload.wetThreshold,
	};
	plantsById[plantId] = updated;
	return updated;
}

export async function deletePlant(plantId: string): Promise<void> {
	if (API_BASE_URL) {
		await fetchJson<null>(apiUrl(`/api/plants/${plantId}`), {
			method: "DELETE",
		});
		return;
	}

	await delay(120);
	if (!plantsById[plantId]) {
		throw new Error("Plant not found");
	}

	delete plantsById[plantId];
}

export async function submitPlantReading(
	plantId: string,
	rawValue: number,
	source = "api"
): Promise<Plant> {
	if (API_BASE_URL) {
		const data = await fetchJson<{ plant: ApiPlant }>(
			apiUrl(`/api/plants/${plantId}/readings`),
			{
				method: "POST",
				body: JSON.stringify({ rawValue, source }),
			}
		);
		return mapApiPlant(data.plant);
	}

	await delay(80);
	const existing = plantsById[plantId];
	if (!existing) {
		throw new Error("Plant not found");
	}

	const updated: Plant = {
		...existing,
		moisture: mapRawToPercent(rawValue),
		lastUpdated: new Date().toISOString(),
		latestRawValue: rawValue,
		source,
	};
	plantsById[plantId] = updated;
	return updated;
}

export async function fetchPlantSnapshot(
	plantId: string
): Promise<Partial<Plant>> {
	if (API_BASE_URL) {
		const data = await fetchJson<{ plant: ApiPlant } | ApiPlant>(
			apiUrl(`/api/plants/${plantId}`)
		);
		const plant = mapApiPlant(extractPlant(data));
		return {
			moisture: plant.moisture,
			lastUpdated: plant.lastUpdated,
		};
	}

	await delay(80);
	const plant = plantsById[plantId];
	if (!plant) {
		return {
			moisture: null,
			lastUpdated: null,
			latestRawValue: null,
			source: null,
		};
	}

	return {
		moisture: plant.moisture,
		lastUpdated: plant.lastUpdated,
		latestRawValue: plant.latestRawValue,
		source: plant.source,
	};
}
