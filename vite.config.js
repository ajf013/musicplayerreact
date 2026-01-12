import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'React Music Player',
        short_name: 'MusicPlayer',
        description: 'A modern PWA Music Player',
        theme_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1a1a1a',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        shortcuts: [
          {
            name: "Play Local Music",
            short_name: "Local",
            description: "Listen to your local files",
            url: "/?tab=local",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Play Online",
            short_name: "Online",
            description: "Stream from YouTube",
            url: "/?tab=online",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          }
        ],
        file_handlers: [
          {
            action: "/",
            accept: {
              "audio/*": [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]
            }
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      }
    })
  ],
})
