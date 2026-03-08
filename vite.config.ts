import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

const PWA_THEME_COLOR = '#d40924';
const PWA_BACKGROUND_COLOR = '#ffffff';
const BASE_PATH = process.env.GITHUB_ACTIONS ? '/music-tools/' : '/';

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icons/apple-touch-icon.png'],
      manifest: {
        name: 'Music Tools',
        short_name: 'Music Tools',
        description: 'An all-in-one music toolkit with essential tools today.',
        theme_color: PWA_THEME_COLOR,
        background_color: PWA_BACKGROUND_COLOR,
        display: 'standalone',
        id: BASE_PATH,
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          {
            src: 'pwa-icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
  },
});
