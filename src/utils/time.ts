// time.ts
export function formatReadingTime(iso: string | null): string {
	if (!iso) return "Waiting for first reading";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "--";
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}
