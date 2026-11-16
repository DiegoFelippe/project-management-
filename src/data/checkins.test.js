import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { listarCheckins } from './checkins'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let banco
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
})

const selecionado = () => banco.chamadas.find(([metodo]) => metodo === 'select')[1]

describe('listarCheckins', () => {
  it('o nome do consultor vem de consultor_do_checkin (o gestor não enxerga todos em perfis)', async () => {
    await listarCheckins({ clienteId: 'k1' })
    expect(selecionado()).toContain('consultor:consultor_do_checkin(nome)')
    expect(selecionado()).not.toContain('perfis(')
    expect(banco.chamou('eq', 'cliente_id', 'k1')).toBe(true)
  })
})
