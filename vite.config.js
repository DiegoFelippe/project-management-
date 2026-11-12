import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifesto } from './src/pwa/manifesto.js'

// No Docker (DOCKER=1 no docker-compose), o aviso de arquivo mudado do Mac nem sempre chega ao container:
// o Vite confere os arquivos de tempos em tempos para não servir versão velha.
const noDocker = process.env.DOCKER === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // App instalável: guarda a "casca" do app (HTML, JS, CSS e ícones) para abrir rápido e até sem internet.
    // Os dados (Supabase) ficam de fora do cache: sempre vêm na hora, com as regras de acesso do banco.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['logo-ixc-consult.png', 'icons/apple-touch-icon.png'],
      manifest: manifesto,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: noDocker ? { watch: { usePolling: true, interval: 300 } } : undefined,
})
