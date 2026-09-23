import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@i18n": fileURLToPath(new URL("./i18n", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
	},
});
