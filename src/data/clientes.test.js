import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listarClientes } from './clientes'

// Construtor de consulta falso: registra cada chamada ([método, ...argumentos]) e responde no range() ou
// no await (contagem com head: true).
let chamadas
let resposta
function consultaFalsa() {
  const consulta = new Proxy({}, {
    get(_alvo, metodo) {
      if (metodo === 'then') {
        return (resolver, rejeitar) => Promise.resolve(resposta).then(resolver, rejeitar)
      }
      return (...argumentos) => {
        chamadas.push([metodo, ...argumentos])
        return metodo === 'range' ? Promise.resolve(resposta) : consulta
      }
    },
  })
  return consulta
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

beforeEach(() => {
  chamadas = []
  resposta = { data: [], error: null, count: 0 }
  vi.mocked(supabase.from).mockImplementation((tabela) => {
    chamadas.push(['from', tabela])
    return consultaFalsa()
  })
})

const filtrou = (...chamada) => chamadas.some((c) => JSON.stringify(c) === JSON.stringify(chamada))

describe('listarClientes: abas', () => {
  it.each(['aguardando', 'atendimento', 'distribuir', 'nas_consultorias'])(
    'a aba %s não mostra arquivados',
    async (aba) => {
      await listarClientes({ aba })
      expect(filtrou('eq', 'arquivado', false)).toBe(true)
      expect(filtrou('eq', 'arquivado', true)).toBe(false)
    },
  )

  it('a aba meus não mostra arquivados', async () => {
    await listarClientes({ aba: 'meus', consultorId: 'p1' })
    expect(filtrou('eq', 'arquivado', false)).toBe(true)
    expect(filtrou('eq', 'consultor_id', 'p1')).toBe(true)
  })

  it('a aba arquivados mostra só os arquivados', async () => {
    await listarClientes({ aba: 'arquivados' })
    expect(filtrou('eq', 'arquivado', true)).toBe(true)
    expect(filtrou('eq', 'arquivado', false)).toBe(false)
  })

  it('aguardando: na consultoria e sem consultor', async () => {
    await listarClientes({ aba: 'aguardando' })
    expect(filtrou('not', 'consultoria_id', 'is', null)).toBe(true)
    expect(filtrou('is', 'consultor_id', null)).toBe(true)
  })
})
