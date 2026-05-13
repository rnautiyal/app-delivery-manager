import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      path.resolve(__dirname, "../../tests/frontend/**/*.test.{ts,tsx}"),
    ],
    environment: "node",
  },
});
