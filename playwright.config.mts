import { defineConfig } from "@playwright/test";

// Non-régression : l'ancien site (export statique dans out/, servi sur 3100)
// et le nouveau (Next.js + base, sur 3000) doivent afficher la même chose.
export default defineConfig({
  testDir: "tests",
  testMatch: /\.spec\.ts$/,
  timeout: 120_000,
  workers: 1,
  use: { channel: "chrome", viewport: { width: 400, height: 860 }, locale: "fr-FR" },
  webServer: [
    { command: "python3 -m http.server 3100 --directory out", port: 3100, reuseExistingServer: true },
    { command: "npx next dev -p 3000", port: 3000, reuseExistingServer: true, timeout: 120_000 },
  ],
});
