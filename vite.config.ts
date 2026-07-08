import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: root + "index.html",
        shiftPlanner: root + "shift-planner/index.html",
        simulator: root + "simulator/index.html",
        coverage: root + "coverage/index.html",
      },
    },
  },
});
