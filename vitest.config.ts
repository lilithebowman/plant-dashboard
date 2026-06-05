import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/frontend/**/*.test.{js,jsx,ts,tsx}"],
		environment: "node",
		setupFiles: ["./tests/setup.js"],
		restoreMocks: true,
		clearMocks: true,
	},
});
