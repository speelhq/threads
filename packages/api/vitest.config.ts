import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5433/threads_test",
    },
  },
});
