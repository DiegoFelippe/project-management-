import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chamarFuncao, supabase } from '@/lib/supabase'
import {
  apagarEvento,
  ausenciasDoPeriodo,
  buscarAgora,
  buscarEvento,
  concluirGoogle,
  conectarGoogle,
  desconectarGoogle,
  eventosDoPeriodo,
  feriadosDoPeriodo,
  indicadoresDaAgenda,
  meuGoogle,
  novoIdDeEvento,
  pessoasParaConvidar,
  responderConvite,
  salvarEvento,
  tentarDeNovo,
  voltaDoGoogle,
} from './agenda'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() }, chamarFuncao: vi.fn() }))

// Consulta encadeável que registra as chamadas e resolve com { data, error } quando aguardada.
function consulta(resposta) {
  const chamadas = []
  const proxy = new Proxy(
    {},
    {
      get(_, nome) {
        if (nome === 'then') return (resolver) => resolver(resposta)
        return (...args) => {
          chamadas.push([nome, ...args])
          return proxy
        }
      },
    },
  )
  return { proxy, chamadas }
}

describe('eventosDoPeriodo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama a função do período uma vez e devolve { itens, haMais }', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { itens: [{ id: 'e1' }], ha_mais: true }, error: null })
    const r = await eventosDoPeriodo({ de: '2026-11-01T00:00:00-03:00', ate: '2026-12-01T00:00:00-03:00' })
    expect(r).toEqual({ itens: [{ id: 'e1' }], haMais: true })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('eventos_do_periodo', {
      p_de: '2026-11-01T00:00:00-03:00',
      p_ate: '2026-12-01T00:00:00-03:00',
      p_consultor: null,
      p_consultoria: null,
      p_cliente: null,
      p_tipo: null,
    })
  })

  it('manda os filtros de consultor, consultoria e cliente ao banco', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { itens: [], ha_mais: false }, error: null })
    await eventosDoPeriodo({ de: 'a', ate: 'b', consultorId: 'p1', consultoriaId: 'c1', clienteId: 'k1', tipo: 'reunioes' })
    expect(supabase.rpc).toHaveBeenCalledWith('eventos_do_periodo', {
      p_de: 'a', p_ate: 'b', p_consultor: 'p1', p_consultoria: 'c1', p_cliente: 'k1', p_tipo: 'reunioes',
    })
  })

  it('resposta vazia vira lista vazia; o erro do banco sobe', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null })
    expect(await eventosDoPeriodo({ de: 'a', ate: 'b' })).toEqual({ itens: [], haMais: false })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(eventosDoPeriodo({ de: 'a', ate: 'b' })).rejects.toEqual({ message: 'x' })
  })
})

describe('pessoasParaConvidar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('busca no banco as pessoas da consultoria do evento: { itens, total }', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ id: 'p2', nome: 'Beto', cor: null }], error: null })
    expect(await pessoasParaConvidar({ consultoriaId: 's1', termo: 'be', limite: 12 })).toEqual({
      itens: [{ id: 'p2', nome: 'Beto', cor: null }], total: 1,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('pessoas_para_convidar', { p_consultoria: 's1', p_busca: 'be', p_limite: 12 })
  })

  it('termo vazio vai nulo; sem consultoria não pergunta; o erro sobe', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null })
    expect(await pessoasParaConvidar({ consultoriaId: 's1', termo: '' })).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenCalledWith('pessoas_para_convidar', { p_consultoria: 's1', p_busca: null, p_limite: 20 })
    expect(await pessoasParaConvidar({ consultoriaId: null })).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(pessoasParaConvidar({ consultoriaId: 's1' })).rejects.toEqual({ message: 'x' })
  })
})

describe('buscarEvento', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devolve o evento, ou null quando a pessoa não o vê', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { id: 'e1' }, error: null })
    expect(await buscarEvento('e1')).toEqual({ id: 'e1' })
    expect(supabase.rpc).toHaveBeenCalledWith('evento_da_agenda', { p_id: 'e1' })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null })
    expect(await buscarEvento('e2')).toBeNull()
  })
})

describe('indicadoresDaAgenda e feriadosDoPeriodo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama as funções do banco com os parâmetros certos', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { semana: 1, mes: 2, aguardando: 0, pastas_no_mes: 0 }, error: null })
    expect(await indicadoresDaAgenda('2026-11-10')).toEqual({ semana: 1, mes: 2, aguardando: 0, pastas_no_mes: 0 })
    expect(supabase.rpc).toHaveBeenCalledWith('indicadores_da_agenda', { p_dia: '2026-11-10' })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: ['2026-11-02', '2026-11-15'], error: null })
    expect(await feriadosDoPeriodo('2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-15'])
    expect(supabase.rpc).toHaveBeenCalledWith('feriados_do_periodo', { p_de: '2026-11-01', p_ate: '2026-11-30' })
  })

  it('propaga o erro', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'sem_permissao' } })
    await expect(indicadoresDaAgenda('2026-11-10')).rejects.toEqual({ message: 'sem_permissao' })
    await expect(feriadosDoPeriodo('a', 'b')).rejects.toEqual({ message: 'sem_permissao' })
  })
})

describe('ausenciasDoPeriodo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama a função do banco e devolve { itens, haMais }', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { itens: [{ id: 'a1' }], ha_mais: false }, error: null })
    expect(await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30' })).toEqual({ itens: [{ id: 'a1' }], haMais: false })
    expect(supabase.rpc).toHaveBeenCalledWith('ausencias_do_periodo', {
      p_de: '2026-11-01', p_ate: '2026-11-30', p_consultor: null, p_consultoria: null,
    })
  })

  it('manda os filtros de consultor e consultoria; erro sobe; resposta vazia vira lista vazia', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null })
    expect(await ausenciasDoPeriodo({ de: 'a', ate: 'b', consultorId: 'p1', consultoriaId: 'c1' })).toEqual({
      itens: [], haMais: false,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('ausencias_do_periodo', {
      p_de: 'a', p_ate: 'b', p_consultor: 'p1', p_consultoria: 'c1',
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(ausenciasDoPeriodo({ de: 'a', ate: 'b' })).rejects.toEqual({ message: 'x' })
  })
})

describe('meuGoogle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lê só e-mail, quando conectou e o erro (nunca o segredo)', async () => {
    const { proxy, chamadas } = consulta({ data: { email: 'a@gmail.test', conectado_em: 'x', erro: null }, error: null })
    vi.mocked(supabase.from).mockReturnValue(proxy)
    expect(await meuGoogle()).toEqual({ conectado: true, email: 'a@gmail.test', erro: null })
    expect(supabase.from).toHaveBeenCalledWith('google_pessoas')
    expect(chamadas.find(([nome]) => nome === 'select')[1]).not.toContain('segredo')
  })

  it('sem linha: não conectado', async () => {
    const { proxy } = consulta({ data: null, error: null })
    vi.mocked(supabase.from).mockReturnValue(proxy)
    expect(await meuGoogle()).toEqual({ conectado: false, email: null, erro: null })
  })

  it('devolve o erro de reconexão que o Google deixou', async () => {
    const { proxy } = consulta({ data: { email: 'a@gmail.test', conectado_em: 'x', erro: 'invalid_grant' }, error: null })
    vi.mocked(supabase.from).mockReturnValue(proxy)
    expect(await meuGoogle()).toEqual({ conectado: true, email: 'a@gmail.test', erro: 'invalid_grant' })
  })
})

describe('conectar e desconectar o Google', () => {
  beforeEach(() => vi.clearAllMocks())

  it('conectarGoogle pede o endereço do Google à função google-pessoa', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' } })
    expect(await conectarGoogle()).toEqual({ erro: null, url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' })
    expect(chamarFuncao).toHaveBeenCalledWith('google-pessoa', { acao: 'conectar' })
  })

  it('conectarGoogle sem o app do Google configurado devolve o aviso em português', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 409, corpo: { codigo: 'google_nao_configurado' } })
    const r = await conectarGoogle()
    expect(r.url).toBeUndefined()
    expect(r.erro).toMatch(/app do Google/)
  })

  it('voltaDoGoogle lê o código e o estado que o Google devolveu (ou a recusa)', () => {
    expect(voltaDoGoogle('?state=abc&code=4%2Fx&scope=openid')).toEqual({ estado: 'abc', codigo: '4/x', recusou: false })
    expect(voltaDoGoogle(new URLSearchParams({ state: 'abc', error: 'access_denied' }))).toEqual({ estado: 'abc', codigo: null, recusou: true })
    expect(voltaDoGoogle('?google=ok')).toBeNull()
    expect(voltaDoGoogle('')).toBeNull()
  })

  it('concluirGoogle manda o estado e o código e devolve o e-mail da conta', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { email: 'ana@gmail.test' } })
    expect(await concluirGoogle({ estado: 'abc', codigo: '4/x' })).toEqual({ erro: null, email: 'ana@gmail.test' })
    expect(chamarFuncao).toHaveBeenCalledWith('google-pessoa', { acao: 'concluir', estado: 'abc', codigo: '4/x' })
  })

  it('concluirGoogle traduz o estado vencido ou de outra pessoa e as permissões que faltaram', async () => {
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 400, corpo: { codigo: 'estado_invalido' } })
    expect((await concluirGoogle({ estado: 'a', codigo: 'b' })).erro).toMatch(/Conectar Google/)
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 400, corpo: { codigo: 'google_sem_permissoes', faltam: ['x'] } })
    expect((await concluirGoogle({ estado: 'a', codigo: 'b' })).erro).toMatch(/permissões/)
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 502, corpo: { codigo: 'google_recusou' } })
    expect((await concluirGoogle({ estado: 'a', codigo: 'b' })).erro).toMatch(/Google recusou/)
  })

  it('concluirGoogle diz quais permissões a pessoa deixou de marcar no Google', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({
      status: 400,
      corpo: {
        codigo: 'google_sem_permissoes',
        faltam: ['https://www.googleapis.com/auth/meetings.space.settings', 'https://www.googleapis.com/auth/meetings.space.readonly'],
      },
    })
    const r = await concluirGoogle({ estado: 'a', codigo: 'b' })
    expect(r.erro).toBe('Faltou autorizar no Google as configurações do Meet (gravação e transcrição) e a leitura das ' +
      'reuniões do Meet. Clique em Conectar Google de novo e marque todas as permissões.')
    expect(r.faltam).toHaveLength(2)
  })

  it('desconectarGoogle avisa quando o Google não confirmou a revogação', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { ok: true, revogado: false } })
    expect(await desconectarGoogle()).toEqual({ erro: null, revogado: false })
    expect(chamarFuncao).toHaveBeenCalledWith('google-pessoa', { acao: 'desconectar' })
  })
})

describe('criar, editar, apagar e responder (Edge Function agenda)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('salvarEvento manda o evento à função agenda e devolve o evento e o aviso', async () => {
    const aviso = 'Fica só no app: Ana não conectou o Google.'
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { evento: { id: 'e1' }, aviso } })
    const dados = { id: 'e1', novo: true, titulo: 'Kickoff' }
    expect(await salvarEvento(dados)).toEqual({ erro: null, evento: { id: 'e1' }, aviso })
    expect(chamarFuncao).toHaveBeenCalledWith('agenda', { acao: 'salvar', evento: dados })

    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { evento: { id: 'e1' } } })
    expect(await salvarEvento(dados)).toEqual({ erro: null, evento: { id: 'e1' }, aviso: null })
  })

  it('o erro em português que a função manda chega à tela, com o campo; sem ele, vale a tradução do código', async () => {
    const recusa = 'O Google não deu permissão para criar o evento no Google Agenda nesta conta.'
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 502, corpo: { codigo: 'google_recusou', motivo: 'sem_permissao', erro: recusa } })
    expect(await salvarEvento({ titulo: 'x' })).toEqual({ erro: recusa, campo: null })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({
      status: 400, corpo: { codigo: 'dados_invalidos', campo: 'titulo', erro: 'Escreva o título do evento.' },
    })
    expect(await salvarEvento({ titulo: '' })).toEqual({ erro: 'Escreva o título do evento.', campo: 'titulo' })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 401, corpo: { codigo: 'nao_autenticado' } })
    expect((await salvarEvento({ titulo: 'x' })).erro).toBe('Sua sessão terminou. Entre de novo.')
  })

  it('apagarEvento e responderConvite chamam a função com o id', async () => {
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 200, corpo: { ok: true } })
    expect(await apagarEvento('e1')).toEqual({ erro: null, aviso: null })
    expect(chamarFuncao).toHaveBeenLastCalledWith('agenda', { acao: 'apagar', id: 'e1' })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 403, corpo: { codigo: 'sem_permissao', erro: 'Só quem organiza e a gestão da consultoria editam.' } })
    expect(await apagarEvento('e1')).toEqual({ erro: 'Só quem organiza e a gestão da consultoria editam.', campo: null })

    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 200, corpo: { ok: true, resposta: 'confirmou' } })
    expect(await responderConvite('e1', 'confirmou')).toEqual({ erro: null, resposta: 'confirmou' })
    expect(chamarFuncao).toHaveBeenLastCalledWith('agenda', { acao: 'responder', id: 'e1', resposta: 'confirmou' })
  })

  it('novoIdDeEvento dá um id novo a cada janela', () => {
    const a = novoIdDeEvento()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(novoIdDeEvento()).not.toBe(a)
  })
})

describe('depois da reunião: Buscar agora e Tentar de novo (Edge Function reunioes-depois)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chamam a função com o id e devolvem a situação da reunião', async () => {
    const reuniao = { reuniao: 'pasta_criada', reuniao_erro: null, pasta_id: 'p1', gravacao_url: 'https://drive.test/v' }
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 200, corpo: { reuniao } })
    expect(await buscarAgora('e1')).toEqual({ erro: null, reuniao })
    expect(chamarFuncao).toHaveBeenLastCalledWith('reunioes-depois', { acao: 'buscarAgora', id: 'e1' })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 200, corpo: { reuniao } })
    expect(await tentarDeNovo('e1')).toEqual({ erro: null, reuniao })
    expect(chamarFuncao).toHaveBeenLastCalledWith('reunioes-depois', { acao: 'tentarDeNovo', id: 'e1' })
  })

  it('o motivo em português que a função manda chega à tela; sem ele, vale a tradução do código', async () => {
    vi.mocked(chamarFuncao).mockResolvedValueOnce({
      status: 409, corpo: { codigo: 'reuniao_nao_terminou', erro: 'A reunião ainda não terminou.' },
    })
    expect(await buscarAgora('e1')).toEqual({ erro: 'A reunião ainda não terminou.' })
    vi.mocked(chamarFuncao).mockResolvedValueOnce({ status: 401, corpo: { codigo: 'nao_autenticado' } })
    expect(await tentarDeNovo('e1')).toEqual({ erro: 'Sua sessão terminou. Entre de novo.' })
  })
})
