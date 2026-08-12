// types.ts
export type PlantReading = {
	rawValue: number;
	source: string;
	receivedAt: string;
	moisturePercent: number | null;
};

export type Plant = {
	id: string;
	name: string;
	uuid: string;
	lowerRawReading: number;
	upperRawReading: number;
	moisture: number | null; // null = waiting for first reading
	lastUpdated: string | null; // ISO string or null
	latestRawValue: number | null;
	source: string | null;
};
