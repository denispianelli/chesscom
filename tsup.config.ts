import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // Declarations are emitted by tsc (tsconfig.build.json), not tsup:
  // rollup-plugin-dts injects a deprecated `baseUrl` that breaks under TS 6.
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: "es2022",
});
