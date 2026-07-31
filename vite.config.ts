import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// `base` is './' so the built app works from any path: a GitHub Pages
// subdirectory, a Netlify root, or even a local file:// double-click.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        // `id` keeps the installed app identified as the same app across
        // deploys, so an update never installs alongside the old copy.
        id: 'forge-training-log',
        name: 'Forge — Training Log',
        short_name: 'Forge',
        description: 'Strength, running and body-composition tracking with a built-in coach.',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate file: a maskable icon is full-bleed with the glyph inside
          // the safe zone, because the OS crops it to its own icon shape.
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press shortcuts on the installed app icon.
        shortcuts: [
          { name: 'Log a lift', short_name: 'Lift', url: './?go=lift' },
          { name: 'Log a run', short_name: 'Run', url: './?go=run' },
          { name: 'Log weight', short_name: 'Weight', url: './?go=body' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Launching from the home screen with no connection must serve the app
        // shell rather than a browser error page.
        navigateFallback: 'index.html',
        // The lazily-loaded sync chunk is precached too, so switching sync on
        // does not require being online at that moment.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
