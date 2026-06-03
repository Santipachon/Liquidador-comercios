import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Liquidaciones Almacén El Acero',
        short_name: 'El Acero',
        description:
          'Liquidación de facturas electrónicas DIAN: extrae productos, calcula precios de venta con margen e IVA, y exporta a Excel.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#1e3a5f',
        theme_color: '#1e3a5f',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cachea todos los assets del build para que la app funcione offline
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        // El bundle principal supera el límite por defecto de 2 MB
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
