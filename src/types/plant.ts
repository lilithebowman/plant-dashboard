// types.ts
export type Plant = {
	id: string;
	name: string;
	uuid: string;
	wetThreshold: number;
	moisture: number | null; // null = waiting for first reading
	lastUpdated: string | null; // ISO string or null
	latestRawValue: number | null;
	source: string | null;
};
