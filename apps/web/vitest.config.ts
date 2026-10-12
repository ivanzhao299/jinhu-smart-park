import path from "node:path";
import { defineConfig } from "vitest/config";

const testModulesDir = process.env.TEST_NODE_MODULES_DIR
  ? path.resolve(process.env.TEST_NODE_MODULES_DIR)
  : path.resolve(__dirname, "node_modules");

export default defineConfig({
  root: __dirname,
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname) },
      { find: "@jinhu/ui", replacement: path.resolve(__dirname, "../../packages/ui/src/index.ts") },
      { find: "react", replacement: path.join(testModulesDir, "react") },
      { find: "react-dom", replacement: path.join(testModulesDir, "react-dom") },
      { find: "@testing-library/jest-dom", replacement: path.join(testModulesDir, "@testing-library/jest-dom") },
      { find: "@testing-library/react", replacement: path.join(testModulesDir, "@testing-library/react") },
      { find: "@testing-library/user-event", replacement: path.join(testModulesDir, "@testing-library/user-event") },
    ],
  },
  test: {
    environment: "jsdom",
    // CI assertions may each wait up to 5s; multi-stage tests need a larger
    // whole-test budget without relaxing assertion or hook timeouts.
    testTimeout: process.env.CI === "true" ? 15000 : 5000,
    include: ["test/interaction/**/*.test.tsx"],
    setupFiles: ["./test/interaction/setup.ts"],
    restoreMocks: true
  }
});
