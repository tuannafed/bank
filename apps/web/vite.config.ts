import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Send the Cloudflare Access cookie with the manifest request.
      useCredentials: true,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Bank – Kế hoạch tài chính',
        short_name: 'Bank',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        background_color: "#f2f6f3",
        theme_color: '#2f6d50',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // The page itself always comes from the network so Cloudflare Access can
        // check the session (and show its login page) on every app open.
        // Only hashed static files are cached.
        globPatterns: ['**/*.{js,css,woff,woff2,png,svg,ico}'],
        navigateFallback: null,
        runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    // `pnpm dev:api` runs wrangler on :8787
    proxy: { '/api': 'http://localhost:8787' },
  },
});
