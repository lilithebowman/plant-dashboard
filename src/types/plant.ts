// types.ts
export type Plant = {
	id: string;
	name: string;
	uuid: string;
	moisture: number | null; // null = waiting for first reading
	lastUpdated: string | null; // ISO string or null
};
