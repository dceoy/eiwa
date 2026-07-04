import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
        // separately and deliberately by src/dict-cache.ts on demand. The
        // WebLLM library itself is loaded from a CDN at runtime (see
        // src/webllm-cdn.ts) and never touches our own asset pipeline.
        globPatterns: ["**/*.{html,css,js,webmanifest,png,svg}"],
        globIgnores: ["dict/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/dict\//],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
});
