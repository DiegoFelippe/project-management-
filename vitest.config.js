import path from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Dois grupos de testes:
// - unidade: telas e funções do app, num navegador simulado (npm test)
// - integracao: banco e Edge Functions de verdade, com o Supabase local no ar (npm run test:integracao)
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unidade',
            environment: 'jsdom',
            // As funções puras das Edge Functions (núcleo sem Deno, em supabase/functions/_shared/) também.
            include: ['src/**/*.test.{js,jsx}', 'supabase/functions/**/*.test.js'],
            setupFiles: ['./src/test/setup.js'],
          },
        },
        {
          // O mesmo apelido '@' do app, para testar as funções de src/data/ contra o Supabase local de verdade.
          resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
          test: {
            name: 'integracao',
            environment: 'node',
            include: ['tests/integracao/**/*.test.js'],
            testTimeout: 30000,
            hookTimeout: 60000,
            fileParallelism: false,
          },
        },
      ],
    },
  }),
)
