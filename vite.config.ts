import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site under /<repo>/; set BASE_PATH in CI. Capacitor and local dev use '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['rdkit/RDKit_minimal.js', 'rdkit/RDKit_minimal.wasm', 'icons/*.png'],
      manifest: {
        name: 'Beaker Buddies',
        short_name: 'Beaker Buddies',
        description: 'Cute pixel-art lab game for drilling Organic Chemistry II reactions.',
        theme_color: '#f6e7d8',
        background_color: '#f6e7d8',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,json,webmanifest}'],
        // RDKit_minimal.wasm is ~7 MB; Workbox skips files over 2 MB unless told otherwise.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
