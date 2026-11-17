import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENTO_CONFERIR_ACESSO, chamarFuncao, supabase } from './supabase'

// Recusa (401/403) avisa o AuthProvider para conferir a verificação em duas etapas (sessão antiga sem o código).
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
