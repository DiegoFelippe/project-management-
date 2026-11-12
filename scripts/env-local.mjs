// Cria o .env.local do app com os dados do Supabase local (npm run env:local).
// Só grava a URL da API e a chave publicável, que podem ir para o navegador.
// A chave secreta e a senha do banco ficam de fora de propósito.
import { writeFileSync } from 'node:fs'
import { lerStatusLocal } from './supabase-local.mjs'

let status
try {
  status = lerStatusLocal()
} catch (erro) {
  console.error(erro.message)
  process.exit(1)
}

writeFileSync(
  '.env.local',
  [
    '# Gerado por "npm run env:local" a partir do Supabase local. Não vai para o git.',
    `VITE_SUPABASE_URL=${status.API_URL}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
    '',
  ].join('\n'),
)
console.log(`.env.local criado apontando para ${status.API_URL}`)
