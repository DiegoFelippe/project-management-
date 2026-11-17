import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chamarFuncao } from '@/lib/supabase'
import { testarRascunho } from './integracoes'

vi.mock('@/lib/supabase', () => ({ supabase: {}, chamarFuncao: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('Testar na janela (rascunho: testa o que foi digitado, sem gravar)', () => {
  it('manda tipo, configuração, segredo e os extras do teste; funcionou devolve a mensagem', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { funcionou: true, mensagem: 'Conectado ao workspace Acme como ixc.' } })
    const r = await testarRascunho('whatsapp', { phone_number_id: '1', waba_id: '2' }, 'EAAG', { numero_teste: '+5511999998888' })
    expect(chamarFuncao).toHaveBeenCalledWith('integracoes', {
      acao: 'testar_rascunho', tipo: 'whatsapp', config: { phone_number_id: '1', waba_id: '2' }, segredo: 'EAAG',
      numero_teste: '+5511999998888',
    })
    expect(r).toEqual({ erro: null, mensagem: 'Conectado ao workspace Acme como ixc.' })
  })

  it('segredo em branco vai nulo (o servidor usa o guardado)', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { funcionou: true, mensagem: 'ok' } })
    await testarRascunho('slack', { canal: '#geral' }, '')
    expect(chamarFuncao).toHaveBeenCalledWith('integracoes', { acao: 'testar_rascunho', tipo: 'slack', config: { canal: '#geral' }, segredo: null })
  })

  it('não funcionou: o erro do serviço vem como está; recusa da função vem traduzida', async () => {
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 200, corpo: { funcionou: false, erro: 'O Slack recusou o token.' } })
    expect(await testarRascunho('slack', {}, 'xoxb-1')).toEqual({ erro: 'O Slack recusou o token.', mensagem: null })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 403, corpo: { codigo: 'sem_permissao' } })
    expect(await testarRascunho('slack', {}, 'xoxb-1')).toEqual({ erro: 'Você não tem permissão para isso.', mensagem: null })
  })
})
