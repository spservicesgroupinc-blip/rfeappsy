import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: '.',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        manifest: {
          name: "RFE Foam Pro",
          short_name: "RFE Pro",
          description: "Enterprise Spray Foam Estimation & Rig Management Suite",
          theme_color: "#0F172A",
          background_color: "#0F172A",
          display: "standalone",
          orientation: "any",
          id: "rfe-foam-pro-desktop",
          start_url: "/",
          scope: "/",
          launch_handler: {
            client_mode: "focus-existing"
          },
          display_override: ["window-controls-overlay", "minimal-ui", "standalone"],
          categories: ["business", "productivity", "utilities", "finance"],
          icons: [
            {
              src: "icons/icon-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icons/icon-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable"
            },
            {
              src: "icons/icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "icons/icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ],
          shortcuts: [
            {
              name: "New Estimate",
              short_name: "New Job",
              description: "Start a new spray foam calculation",
              url: "./index.html?action=new_estimate",
              icons: [{ src: "icons/icon-192x192.png", sizes: "192x192" }]
            },
            {
              name: "Inventory",
              short_name: "Stock",
              description: "Check chemical sets and supplies",
              url: "./index.html?action=warehouse",
              icons: [{ src: "icons/icon-192x192.png", sizes: "192x192" }]
            }
          ],
          screenshots: [
            {
              src: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=1280&h=720",
              sizes: "1280x720",
              type: "image/jpeg",
              form_factor: "wide",
              label: "Desktop Dashboard"
            },
            {
              src: "https://images.unsplash.com/photo-1556761175-4b46a8911684?auto=format&fit=crop&q=80&w=720&h=1280",
              sizes: "720x1280",
              type: "image/jpeg",
              form_factor: "narrow",
              label: "Mobile Rig Interface"
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          navigateFallback: null
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
