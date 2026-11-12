import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// No Docker (DOCKER=1 no docker-compose), o aviso de arquivo mudado do Mac nem sempre chega ao container:
// o Vite confere os arquivos de tempos em tempos para não servir versão velha.
const noDocker = process.env.DOCKER === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: noDocker ? { watch: { usePolling: true, interval: 300 } } : undefined,
})
