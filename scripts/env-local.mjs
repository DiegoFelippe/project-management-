// Cria o .env.local do app com os dados do Supabase local (npm run env:local).
// Só grava a URL da API e a chave publicável, que podem ir para o navegador.
// A chave secreta e a senha do banco ficam de fora de propósito.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

let saida
try {
  saida = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  console.error('O Supabase local não respondeu. Suba ele antes com: npm run db:start')
  process.exit(1)
}

const vars = {}
for (const linha of saida.split('\n')) {
  const achou = linha.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
  if (achou) vars[achou[1]] = achou[2]
}

if (!vars.API_URL || !vars.PUBLISHABLE_KEY) {
  console.error('O Supabase local não informou a URL ou a chave publicável. Rode: npm run db:status')
  process.exit(1)
}

writeFileSync(
  '.env.local',
  [
    '# Gerado por "npm run env:local" a partir do Supabase local. Não vai para o git.',
    `VITE_SUPABASE_URL=${vars.API_URL}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${vars.PUBLISHABLE_KEY}`,
    '',
  ].join('\n'),
)
console.log(`.env.local criado apontando para ${vars.API_URL}`)
