import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const deploymentBase = process.env.GITHUB_PAGES === 'true' ? '/Holo-apex/' : '/';
const publicAsset = (name: string) => `${deploymentBase}${name}`;

export default defineConfig(() => {
  return {
    base: deploymentBase,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: deploymentBase,
          name: 'هلو شرکتی Apex — سامانه جامع حسابداری',
          short_name: 'هلو Apex',
          description: 'سامانه جامع حسابداری شرکتی با هسته هلو Apex، داشبورد مدیریت مالی و گزارش‌گیری پیشرفته',
          theme_color: '#1D4ED8',
          background_color: '#F1F5F9',
          display: 'standalone',
          orientation: 'any',
          dir: 'rtl',
          lang: 'fa',
          start_url: deploymentBase,
          scope: deploymentBase,
          icons: [
            { src: publicAsset('pwa-192x192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: publicAsset('pwa-512x512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: publicAsset('pwa-maskable-512x512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'فاکتور فروش (F2)',
              short_name: 'فروش',
              url: `${deploymentBase}?view=invoices&action=new-sale`,
              icons: [{ src: publicAsset('pwa-192x192.png'), sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'ثبت سند حسابداری (F3)',
              short_name: 'سند جدید',
              url: `${deploymentBase}?view=vouchers&action=new-voucher`,
              icons: [{ src: publicAsset('pwa-192x192.png'), sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'خزانه‌داری و چک (F7)',
              short_name: 'چک‌ها',
              url: `${deploymentBase}?view=treasury`,
              icons: [{ src: publicAsset('pwa-192x192.png'), sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,webp,svg,woff,woff2,json}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/__\/auth/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/api\/fx\/rates/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'apex-fx-rates-cache',
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\/src\/assets\/.*\.(?:png|jpg|jpeg|svg|webp)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'apex-local-assets-cache',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: true, type: 'module' },
      }),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
