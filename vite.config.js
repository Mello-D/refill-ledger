import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works regardless of the subpath it's
  // served from (e.g. https://yourname.github.io/refill-ledger/).
  base: "./",
});
