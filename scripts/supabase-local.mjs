// Lê endereços e chaves do Supabase local (o que "supabase status -o env" mostra).
// Usado pelos scripts do projeto e pelos testes de integração; nunca pelo app.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const supabaseBin = join(raiz, 'node_modules', '.bin', 'supabase')

export function lerStatusLocal() {
  let saida
  try {
    saida = execFileSync(supabaseBin, ['status', '-o', 'env'], {
      cwd: raiz,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new Error('O Supabase local não respondeu. Suba ele antes com: npm run db:start')
  }

  const vars = {}
  for (const linha of saida.split('\n')) {
    const achou = linha.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (achou) vars[achou[1]] = achou[2]
  }

  const faltando = ['API_URL', 'PUBLISHABLE_KEY', 'SECRET_KEY', 'MAILPIT_URL'].filter((nome) => !vars[nome])
  if (faltando.length) {
    throw new Error(`O Supabase local não informou ${faltando.join(', ')}. Rode: npm run db:status`)
  }
  return {
    API_URL: vars.API_URL,
    PUBLISHABLE_KEY: vars.PUBLISHABLE_KEY,
    SECRET_KEY: vars.SECRET_KEY,
    MAILPIT_URL: vars.MAILPIT_URL,
  }
}
