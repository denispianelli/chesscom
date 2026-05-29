import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // tsup emits both index.d.ts (ESM) and index.d.cts (CJS), so the `exports`
  // map can hand each module system a declaration file of the right flavor.
  // rollup-plugin-dts injects a deprecated `baseUrl`; `ignoreDeprecations`
  // keeps the dts build green under TS 6 (drop it once the plugin stops).
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  // Replace the __VERSION__ token in src/index.ts with the published version
  // at build time, so VERSION never drifts from package.json again.
  define: { __VERSION__: JSON.stringify(pkg.version) },
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  target: "es2022",
});
