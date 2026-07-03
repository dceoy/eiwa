import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The WebLLM vendor library and its Web Worker are lazy-loaded only after a
// user explicitly enables AI explanations (see src/llm.ts). They must never
// be part of the app-shell precache, so they get a stable, predictable chunk
// name that `workbox.globIgnores` below can exclude by pattern.
const LAZY_AI_CHUNK = "webllm-vendor";

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["favicon.png", "icons/icon.svg"],
      manifest: {
        id: "/",
        name: "Eiwa",
        short_name: "Eiwa",
        description:
          "Mobile-first English-Japanese / Japanese-English dictionary with local, private AI explanations.",
        theme_color: "#1a56db",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "en",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell only: HTML/CSS/JS/icons. Dictionary shards are cached
        // separately and deliberately by src/dict-cache.ts on demand, and
        // the multi-megabyte WebLLM chunks below must stay lazy.
        globPatterns: ["**/*.{html,css,js,webmanifest,png,svg}"],
        globIgnores: [`assets/${LAZY_AI_CHUNK}-*.js`, "assets/llm-worker-*.js", "dict/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/dict\//],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mlc-ai/web-llm") || id.includes("@mlc-ai/web-tokenizers")) {
            return LAZY_AI_CHUNK;
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
