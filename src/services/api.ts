// api.ts
import { Plant } from "../types/plant";

type CreatePlantInput = {
	name: string;
	uuid: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
	.trim()
	.replace(/\/+$/, "");

function apiUrl(path: string): string {
	return `${API_BASE_URL}${path}`;
}

function normalizePlant(input: Partial<Plant> & { id: string; name: string; uuid: string }): Plant {
	return {
		id: input.id,
		name: input.name,
		uuid: input.uuid,
		moisture: input.moisture ?? null,
		lastUpdated: input.lastUpdated ?? null,
	};
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

	return (await response.json()) as T;
}

let plants: Plant[] = [
	{
		id: "1",
		name: "Annie's Awesome Plant",
		uuid: "uuid-annie",
		moisture: 61,
		lastUpdated: new Date().toISOString(),
	},
	{
		id: "2",
		name: "River's Not Dead Plant",
		uuid: "uuid-river",
		moisture: 61,
		lastUpdated: new Date().toISOString(),
	},
	// ...add more seed data if you want
];

export async function fetchPlants(): Promise<Plant[]> {
	if (API_BASE_URL) {
		const data = await fetchJson<Array<Partial<Plant> & { id: string; name: string; uuid: string }>>(
			apiUrl("/api/plants")
		);
		return data.map(normalizePlant);
	}

	// simulate network
	await new Promise((r) => setTimeout(r, 200));
	return plants;
}

export async function createPlant(input: CreatePlantInput): Promise<Plant> {
	if (API_BASE_URL) {
		const data = await fetchJson<Partial<Plant> & { id: string; name: string; uuid: string }>(
			apiUrl("/api/plants"),
			{
				method: "POST",
				body: JSON.stringify(input),
			}
		);
		return normalizePlant(data);
	}

	await new Promise((r) => setTimeout(r, 200));
	const plant: Plant = {
		id: crypto.randomUUID(),
		name: input.name,
		uuid: input.uuid,
		moisture: null,
		lastUpdated: null,
	};
	plants = [plant, ...plants];
	return plant;
}

// Simulate moisture updates (you’d replace this with real polling)
export async function fetchPlantSnapshot(
	plantId: string
): Promise<Partial<Plant>> {
	if (API_BASE_URL) {
		return await fetchJson<Partial<Plant>>(
			apiUrl(`/api/plants/${plantId}/snapshot`)
		);
	}

	await new Promise((r) => setTimeout(r, 150));
	const moisture = Math.floor(Math.random() * 101);
	const lastUpdated = new Date().toISOString();
	plants = plants.map((p) =>
		p.id === plantId ? { ...p, moisture, lastUpdated } : p
	);
	return { moisture, lastUpdated };
}
