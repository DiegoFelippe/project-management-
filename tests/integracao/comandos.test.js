import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { clienteAdmin, emailDeTeste, emailsPara, entrarComo, limparTudo, registrarEmail } from './ambiente.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const admin = clienteAdmin()
const rodar = (script, args = []) =>
  execFileSync(process.execPath, [join(raiz, 'scripts', script), ...args], { cwd: raiz, encoding: 'utf8' })

afterAll(limparTudo)

describe('comandos do projeto', () => {
  const email = emailDeTeste('dono')

  it('criar-dono cria o perfil dono e manda o convite', async () => {
    rodar('criar-dono.mjs', [email, 'Dono de Teste'])
    await registrarEmail(email)
    const { data: p } = await admin.from('perfis').select('*').eq('email', email).single()
    expect(p).toMatchObject({ papel: 'dono', consultoria_id: null, convite_pendente: true })
    await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(1)
    const [mensagem] = await emailsPara(email)
    expect(mensagem.Subject).toBe('Seu acesso à Consultoria')
  })

  it('criar-dono de novo não duplica', async () => {
    expect(() => rodar('criar-dono.mjs', [email, 'Dono de Teste'])).not.toThrow()
    const { count } = await admin.from('perfis').select('*', { count: 'exact', head: true }).eq('email', email)
    expect(count).toBe(1)
  })

  it('exemplo-local cria a consultoria e dá para entrar', async () => {
    rodar('exemplo-local.mjs')
    const gestor = await entrarComo({ email: 'gestor@exemplo.test', senha: 'exemplo-123' })
    const { data: times } = await gestor.from('times').select('nome')
    expect(times.map((t) => t.nome)).toContain('Implantação')
  })
})
