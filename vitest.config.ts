import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(process.cwd(), "src"),
  // `server-only` lanza fuera de React Server; en tests es un no-op.
  "server-only": path.resolve(process.cwd(), "tests/helpers/empty.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/helpers/global-setup.ts"],
          setupFiles: ["tests/helpers/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
