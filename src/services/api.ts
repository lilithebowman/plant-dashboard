// api.ts
import { Plant } from "../types/plant";

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
	// simulate network
	await new Promise((r) => setTimeout(r, 200));
	return plants;
}

export async function createPlant(input: {
	name: string;
	uuid: string;
}): Promise<Plant> {
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
	await new Promise((r) => setTimeout(r, 150));
	const moisture = Math.floor(Math.random() * 101);
	const lastUpdated = new Date().toISOString();
	plants = plants.map((p) =>
		p.id === plantId ? { ...p, moisture, lastUpdated } : p
	);
	return { moisture, lastUpdated };
}
