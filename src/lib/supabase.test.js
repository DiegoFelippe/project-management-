import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENTO_CONFERIR_ACESSO, chamarFuncao, ehVoltaDoLogin, supabase } from './supabase'

// Recusa (401/403, ou 400 de uma função do banco que levantou erro, P0001) avisa o AuthProvider para conferir a
// verificação em duas etapas (sessão antiga sem o código).
function ouvir() {
  const ouvinte = vi.fn()
  window.addEventListener(EVENTO_CONFERIR_ACESSO, ouvinte)
  return ouvinte
}

const resposta = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aviso de recusa', () => {
  it('Edge Function com 403 verificacao_pendente avisa', async () => {
    const ouvinte = ouvir()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(403, { codigo: 'verificacao_pendente' })))
    const r = await chamarFuncao('gerenciar-acesso', { acao: 'editar' })
    expect(r).toEqual({ status: 403, corpo: { codigo: 'verificacao_pendente' } })
    expect(ouvinte).toHaveBeenCalledTimes(1)
    window.removeEventListener(EVENTO_CONFERIR_ACESSO, ouvinte)
  })

  it('função do banco recusada com raise (400, P0001) avisa; outro 400 não', async () => {
    const ouvinte = ouvir()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(400, { code: 'P0001', message: 'sem_permissao' })))
    const { error } = await supabase.rpc('atualizar_meu_contato', { p_telefone: '1' })
    expect(error).toMatchObject({ code: 'P0001', message: 'sem_permissao' }) // a resposta segue inteira para quem chamou
    await vi.waitFor(() => expect(ouvinte).toHaveBeenCalledTimes(1))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(400, { code: '23514', message: 'check' })))
    await supabase.from('checkins').insert({ id: 'x' })
    await new Promise((pronto) => setTimeout(pronto, 10))
    expect(ouvinte).toHaveBeenCalledTimes(1)
    window.removeEventListener(EVENTO_CONFERIR_ACESSO, ouvinte)
  })

  it('Storage recusado (400 com statusCode 403) avisa', async () => {
    const ouvinte = ouvir()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' })))
    await supabase.storage.from('arquivos').remove(['x/y.pdf'])
    await vi.waitFor(() => expect(ouvinte).toHaveBeenCalledTimes(1))
    window.removeEventListener(EVENTO_CONFERIR_ACESSO, ouvinte)
  })

  it('banco com 403 avisa; resposta normal não', async () => {
    const ouvinte = ouvir()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(403, { code: '42501', message: 'permission denied' })))
    await supabase.from('checkins').insert({ id: 'x' })
    expect(ouvinte).toHaveBeenCalledTimes(1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(200, [])))
    await supabase.from('times').select('id')
    expect(ouvinte).toHaveBeenCalledTimes(1)
    window.removeEventListener(EVENTO_CONFERIR_ACESSO, ouvinte)
  })
})

// A volta do "Conectar Google" do Calendário traz ?code=…&state=… (ou ?error=…) em /calendario: é do Google da pessoa,
// não do login. O supabase-js não pode tomar isso como volta do login (o erro do Google pararia a sessão).
describe('volta do login na URL', () => {
  const parametros = (url) => Object.fromEntries([...new URL(url).searchParams, ...new URLSearchParams(new URL(url).hash.slice(1))])
  const volta = (url) => ehVoltaDoLogin(new URL(url), parametros(url))

  it('a volta do Google do Calendário não é login', () => {
    expect(volta('http://app.test/calendario?code=abc&state=xyz')).toBe(false)
    expect(volta('http://app.test/calendario?error=access_denied&state=xyz')).toBe(false)
  })

  it('a volta do login (Google, SSO, convite) continua sendo lida', () => {
    expect(volta('http://app.test/entrar#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer')).toBe(true)
    expect(volta('http://app.test/entrar?error=server_error&error_description=x')).toBe(true)
    expect(volta('http://app.test/definir-senha#access_token=a&type=recovery')).toBe(true)
    expect(volta('http://app.test/clientes')).toBe(false)
  })

  it('o cliente do Supabase usa esta regra', () => {
    expect(supabase.auth.detectSessionInUrl).toBe(ehVoltaDoLogin)
  })
})
