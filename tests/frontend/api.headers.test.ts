/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPlantOwnerToken, updatePlant } from "../../src/services/api";

describe("api header handling", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it("keeps Content-Type for authenticated update requests", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				plant: {
					id: "11111111-1111-4111-8111-111111111111",
					name: "Renamed Plant",
					lowerRawReading: 4095,
					upperRawReading: 1500,
					latestReading: null,
				},
			}),
		} as Response);

		const plantId = "11111111-1111-4111-8111-111111111111";
		setPlantOwnerToken(plantId, "owner-token");

		await updatePlant(plantId, {
			name: "Renamed Plant",
			lowerRawReading: 4095,
			upperRawReading: 1500,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = requestInit.headers as Record<string, string>;

		expect(headers.Authorization).toBe("Bearer owner-token");
		expect(headers["Content-Type"]).toBe("application/json");
		expect(requestInit.body).toContain("Renamed Plant");
	});
});
