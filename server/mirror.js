const MIRROR_BASE_URL = (process.env.WORKSHOP_MIRROR_BASE_URL ?? "")
	.trim()
	.replace(/\/+$/, "");

const MIRROR_TIMEOUT_MS = Number(process.env.WORKSHOP_MIRROR_TIMEOUT_MS ?? 1500);

function mirrorUrl(path) {
	return `${MIRROR_BASE_URL}${path}`;
}

export function isMirrorEnabled() {
	return Boolean(MIRROR_BASE_URL);
}

export async function mirrorReadingToWorkshop(plantId, reading) {
	if (!isMirrorEnabled()) {
		return;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);

	try {
		const response = await fetch(mirrorUrl(`/api/plants/${plantId}/readings`), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				rawValue: reading.rawValue,
				source: reading.source || "api-mirror",
				receivedAt: reading.receivedAt,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const details = await response.text().catch(() => "");
			console.warn(
				`Workshop mirror failed (${response.status}): ${details || response.statusText}`
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Workshop mirror request failed: ${message}`);
	} finally {
		clearTimeout(timeoutId);
	}
}
