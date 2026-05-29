// time.ts
export function formatTimeSince(iso: string | null): string {
	if (!iso) return "Waiting for first reading";
	const now = new Date();
	const then = new Date(iso);
	const diffMs = now.getTime() - then.getTime();
	const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
	const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
	const s = String(totalSeconds % 60).padStart(2, "0");
	return `${h}:${m}:${s}`;
}
