import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  ausenciasDoPeriodo,
  buscarEvento,
  eventosDoPeriodo,
  feriadosDoPeriodo,
  indicadoresDaAgenda,
  meuGoogle,
} from './agenda'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

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

  it('pede as ausências que tocam o período e filtra por consultor', async () => {
    const { proxy, chamadas } = consulta({ data: [{ id: 'a1' }], error: null })
    vi.mocked(supabase.from).mockReturnValue(proxy)
    expect(await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30', consultorId: 'p1' })).toEqual([{ id: 'a1' }])
    expect(supabase.from).toHaveBeenCalledWith('ausencias')
    // a tabela tem duas relações com perfis (perfil_id e criado_por): sem a dica o PostgREST recusa (PGRST201)
    expect(chamadas.find(([nome]) => nome === 'select')[1]).toContain('perfis!perfil_id(')
    expect(chamadas).toContainEqual(['lte', 'de', '2026-11-30'])
    expect(chamadas).toContainEqual(['gte', 'ate', '2026-11-01'])
    expect(chamadas).toContainEqual(['eq', 'perfil_id', 'p1'])
  })

  it('filtra por consultoria pela pessoa (junção interna, no banco)', async () => {
    const { proxy, chamadas } = consulta({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(proxy)
    await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30', consultoriaId: 'c1' })
    expect(chamadas.find(([nome]) => nome === 'select')[1]).toContain('perfis!perfil_id!inner')
    expect(chamadas).toContainEqual(['eq', 'perfil.consultoria_id', 'c1'])
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
