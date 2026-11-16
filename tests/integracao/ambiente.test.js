// A limpeza dos testes de integração: cada passo é conferido, e o que o teste criou sai do banco local.
import { describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  conferirLimpeza,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const admin = clienteAdmin()

describe('limparTudo', () => {
  it('erro num passo da limpeza vira exceção dizendo o que não saiu', () => {
    const erro = { code: '23503', message: 'update or delete on table "clientes" violates foreign key constraint' }
    expect(() => conferirLimpeza('apagar os clientes de teste', { error: erro }))
      .toThrow(/limparTudo: não foi possível apagar os clientes de teste \(23503: update or delete on table "clientes"/)
    expect(() => conferirLimpeza('apagar os clientes de teste', { error: null })).not.toThrow()
  })

  it('apaga a consultoria, a pessoa, o cliente e o check-in que o teste criou', async () => {
    const consultoria = await criarConsultoriaDeTeste()
    const pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    const { data: cliente, error } = await admin
      .from('clientes')
      .insert({ nome: 'Limpeza do teste', horas_mes: 1, consultoria_id: consultoria, consultor_id: pessoa.id })
      .select('id')
      .single()
    expect(error).toBeNull()
    registrarCliente(cliente.id)
    const comoPessoa = await entrarComo(pessoa)
    const { error: erroCheckin } = await comoPessoa.from('checkins').insert({
      cliente_id: cliente.id,
      inicio: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      fim: new Date(Date.now() - 3_600_000).toISOString(),
      descricao: 'Atendimento de teste',
    })
    expect(erroCheckin).toBeNull()

    await limparTudo()

    expect((await admin.from('checkins').select('id').eq('cliente_id', cliente.id)).data).toEqual([])
    expect((await admin.from('clientes').select('id').eq('id', cliente.id)).data).toEqual([])
    expect((await admin.from('perfis').select('id').eq('id', pessoa.id)).data).toEqual([])
    expect((await admin.from('consultorias').select('id').eq('id', consultoria)).data).toEqual([])
  })
})
