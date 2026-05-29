// api.ts
import { Plant, PlantReading } from "../types/plant";

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

export async function fetchPlants(): Promise<Plant[]> {
	const data = await fetchJson<{ plants?: ApiPlant[] } | ApiPlant[]>(
		apiUrl("/api/plants")
	);
	return extractPlantList(data).map(mapApiPlant);
}

export async function createPlant(input: CreatePlantInput): Promise<Plant> {
	const normalizedName = input.name.trim();
	const normalizedUuid = input.uuid.trim();
	const data = await fetchJson<{ plant: ApiPlant } | ApiPlant>(
		apiUrl("/api/plants"),
		{
			method: "POST",
			body: JSON.stringify({ name: normalizedName, id: normalizedUuid }),
		}
	);
	return mapApiPlant(extractPlant(data));
}

export async function updatePlant(
	plantId: string,
	updates: UpdatePlantInput
): Promise<Plant> {
	const payload = {
		name: updates.name.trim(),
		wetThreshold: updates.wetThreshold,
	};

	const data = await fetchJson<{ plant: ApiPlant }>(
		apiUrl(`/api/plants/${plantId}`),
		{
			method: "PATCH",
			body: JSON.stringify(payload),
		}
	);
	return mapApiPlant(data.plant);
}

export async function deletePlant(plantId: string): Promise<void> {
	await fetchJson<null>(apiUrl(`/api/plants/${plantId}`), {
		method: "DELETE",
	});
}

export async function submitPlantReading(
	plantId: string,
	rawValue: number,
	source = "api"
): Promise<Plant> {
	const data = await fetchJson<{ plant: ApiPlant }>(
		apiUrl(`/api/plants/${plantId}/readings`),
		{
			method: "POST",
			body: JSON.stringify({ rawValue, source }),
		}
	);
	return mapApiPlant(data.plant);
}

export async function fetchPlantSnapshot(
	plantId: string
): Promise<Partial<Plant>> {
	const data = await fetchJson<{ plant: ApiPlant } | ApiPlant>(
		apiUrl(`/api/plants/${plantId}`)
	);
	const plant = mapApiPlant(extractPlant(data));
	return {
		moisture: plant.moisture,
		lastUpdated: plant.lastUpdated,
		latestRawValue: plant.latestRawValue,
		source: plant.source,
	};
}

export async function fetchPlantHistory(
	plantId: string,
	limit = 60
): Promise<{ plant: Plant; readings: PlantReading[] }> {
	const data = await fetchJson<{ plant: ApiPlant; readings: ApiReading[] }>(
		apiUrl(`/api/plants/${plantId}/readings?limit=${limit}`)
	);
	return {
		plant: mapApiPlant(data.plant),
		readings: data.readings,
	};
}
