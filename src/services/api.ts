// api.ts
import { Plant, PlantReading } from "../types/plant";

type CreatePlantInput = {
	name: string;
	uuid: string;
	lowerRawReading: number;
	upperRawReading: number;
};

type UpdatePlantInput = {
	name: string;
	lowerRawReading: number;
	upperRawReading: number;
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
	lowerRawReading?: number;
	upperRawReading?: number;
	wetThreshold?: number;
	latestReading?: ApiReading | null;
};

type ApiCreatePlantResult = {
	plant: ApiPlant;
	creatorToken: string;
	ingestToken?: string;
};

export type PlantHistoryRange = "last60" | "week" | "month" | "year";

const OWNER_TOKEN_STORAGE_KEY = "plantOwnerTokens";

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
		lowerRawReading: input.lowerRawReading ?? 4095,
		upperRawReading: input.upperRawReading ?? input.wetThreshold ?? 1500,
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
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});

	if (!response.ok) {
		throw new Error(`Request failed: ${response.status} ${response.statusText}`);
	}

	if (response.status === 204) {
		return null as T;
	}

	return (await response.json()) as T;
}

function readOwnerTokens(): Record<string, string> {
	try {
		const raw = window.localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}

function writeOwnerTokens(tokens: Record<string, string>) {
	window.localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function getPlantOwnerToken(plantId: string): string {
	return readOwnerTokens()[plantId] ?? "";
}

export function setPlantOwnerToken(plantId: string, token: string) {
	if (!plantId || !token) return;
	const tokens = readOwnerTokens();
	tokens[plantId] = token;
	writeOwnerTokens(tokens);
}

export function removePlantOwnerToken(plantId: string) {
	const tokens = readOwnerTokens();
	delete tokens[plantId];
	writeOwnerTokens(tokens);
}

export async function fetchPlants(): Promise<Plant[]> {
	const data = await fetchJson<{ plants?: ApiPlant[] } | ApiPlant[]>(
		apiUrl("/api/plants")
	);
	return extractPlantList(data).map(mapApiPlant);
}

export async function createPlant(input: CreatePlantInput): Promise<{ plant: Plant; ingestToken: string | null }> {
	const normalizedName = input.name.trim();
	const normalizedUuid = input.uuid.trim();
	const lowerRawReading = Math.max(0, Math.min(4095, Math.round(input.lowerRawReading)));
	const upperRawReading = Math.max(0, Math.min(4095, Math.round(input.upperRawReading)));
	const data = await fetchJson<ApiCreatePlantResult | { plant: ApiPlant } | ApiPlant>(
		apiUrl("/api/plants"),
		{
			method: "POST",
			body: JSON.stringify({
				name: normalizedName,
				id: normalizedUuid,
				lowerRawReading,
				upperRawReading,
			}),
		}
	);

	if ("creatorToken" in data && data.creatorToken) {
		setPlantOwnerToken(data.plant.id, data.creatorToken);
		return {
			plant: mapApiPlant(data.plant),
			ingestToken: data.ingestToken ?? null,
		};
	}

	return {
		plant: mapApiPlant(extractPlant(data)),
		ingestToken: null,
	};
}

export async function updatePlant(
	plantId: string,
	updates: UpdatePlantInput,
	options?: { adminSessionToken?: string }
): Promise<Plant> {
	const payload = {
		name: updates.name.trim(),
		lowerRawReading: Math.max(0, Math.min(4095, Math.round(updates.lowerRawReading))),
		upperRawReading: Math.max(0, Math.min(4095, Math.round(updates.upperRawReading))),
	};
	const ownerToken = getPlantOwnerToken(plantId);
	const headers: Record<string, string> = {};
	if (ownerToken) {
		headers.Authorization = `Bearer ${ownerToken}`;
	}
	if (options?.adminSessionToken) {
		headers["X-Admin-Session"] = options.adminSessionToken;
	}

	const data = await fetchJson<{ plant: ApiPlant }>(
		apiUrl(`/api/plants/${plantId}`),
		{
			method: "PATCH",
			headers,
			body: JSON.stringify(payload),
		}
	);
	return mapApiPlant(data.plant);
}

export async function deletePlant(
	plantId: string,
	options?: { adminSessionToken?: string }
): Promise<void> {
	const ownerToken = getPlantOwnerToken(plantId);
	const headers: Record<string, string> = {};
	if (ownerToken) {
		headers.Authorization = `Bearer ${ownerToken}`;
	}
	if (options?.adminSessionToken) {
		headers["X-Admin-Session"] = options.adminSessionToken;
	}

	await fetchJson<null>(apiUrl(`/api/plants/${plantId}`), {
		method: "DELETE",
		headers,
	});
	removePlantOwnerToken(plantId);
}

export async function submitPlantReading(
	plantId: string,
	rawValue: number,
	source = "api"
): Promise<Plant> {
	const ownerToken = getPlantOwnerToken(plantId);
	const headers: Record<string, string> = {};
	if (ownerToken) {
		headers.Authorization = `Bearer ${ownerToken}`;
	}

	const data = await fetchJson<{ plant: ApiPlant }>(
		apiUrl(`/api/plants/${plantId}/readings`),
		{
			method: "POST",
			headers,
			body: JSON.stringify({ rawValue, source }),
		}
	);
	return mapApiPlant(data.plant);
}

export async function rotatePlantIngestToken(
	plantId: string,
	options?: { adminSessionToken?: string }
): Promise<{ plantId: string; ingestToken: string }> {
	const ownerToken = getPlantOwnerToken(plantId);
	const headers: Record<string, string> = {};
	if (ownerToken) {
		headers.Authorization = `Bearer ${ownerToken}`;
	}
	if (options?.adminSessionToken) {
		headers["X-Admin-Session"] = options.adminSessionToken;
	}

	return fetchJson<{ plantId: string; ingestToken: string }>(
		apiUrl(`/api/plants/${plantId}/ingest-token/rotate`),
		{
			method: "POST",
			headers,
		}
	);
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
	range: PlantHistoryRange = "last60"
): Promise<{ plant: Plant; readings: PlantReading[] }> {
	const params = new URLSearchParams();
	if (range === "last60") {
		params.set("limit", "60");
	} else {
		params.set("range", range);
	}

	const data = await fetchJson<{ plant: ApiPlant; readings: ApiReading[] }>(
		apiUrl(`/api/plants/${plantId}/readings?${params.toString()}`)
	);
	return {
		plant: mapApiPlant(data.plant),
		readings: data.readings,
	};
}

export async function adminLogin(username: string, password: string): Promise<{ token: string; username: string; expiresAt: string }> {
	const data = await fetchJson<{ session: { token: string; username: string; expiresAt: string } }>(
		apiUrl("/api/admin/login"),
		{
			method: "POST",
			body: JSON.stringify({ username, password }),
		}
	);
	return data.session;
}

export async function adminLogout(adminSessionToken: string): Promise<void> {
	await fetchJson<null>(apiUrl("/api/admin/logout"), {
		method: "POST",
		headers: {
			"X-Admin-Session": adminSessionToken,
		},
	});
}

export async function fetchAdminPlants(adminSessionToken: string): Promise<Plant[]> {
	const data = await fetchJson<{ plants: ApiPlant[] }>(apiUrl("/api/admin/plants"), {
		headers: {
			"X-Admin-Session": adminSessionToken,
		},
	});
	return data.plants.map(mapApiPlant);
}
