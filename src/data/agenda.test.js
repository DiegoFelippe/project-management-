import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chamarFuncao, supabase } from '@/lib/supabase'
import {
  ausenciasDoPeriodo,
  buscarEvento,
  concluirGoogle,
  conectarGoogle,
  desconectarGoogle,
  eventosDoPeriodo,
  feriadosDoPeriodo,
  indicadoresDaAgenda,
  meuGoogle,
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
    })
  })

  it('manda os filtros de consultor, consultoria e cliente ao banco', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { itens: [], ha_mais: false }, error: null })
    await eventosDoPeriodo({ de: 'a', ate: 'b', consultorId: 'p1', consultoriaId: 'c1', clienteId: 'k1' })
    expect(supabase.rpc).toHaveBeenCalledWith('eventos_do_periodo', {
      p_de: 'a', p_ate: 'b', p_consultor: 'p1', p_consultoria: 'c1', p_cliente: 'k1',
    })
  })

  it('resposta vazia vira lista vazia; o erro do banco sobe', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null })
    expect(await eventosDoPeriodo({ de: 'a', ate: 'b' })).toEqual({ itens: [], haMais: false })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    await expect(eventosDoPeriodo({ de: 'a', ate: 'b' })).rejects.toEqual({ message: 'x' })
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

  it('desconectarGoogle avisa quando o Google não confirmou a revogação', async () => {
    vi.mocked(chamarFuncao).mockResolvedValue({ status: 200, corpo: { ok: true, revogado: false } })
    expect(await desconectarGoogle()).toEqual({ erro: null, revogado: false })
    expect(chamarFuncao).toHaveBeenCalledWith('google-pessoa', { acao: 'desconectar' })
  })
})
