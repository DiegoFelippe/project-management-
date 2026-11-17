// A limpeza dos testes de integração: cada passo é conferido, e o que o teste criou sai do banco local.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
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

// Se um caso falhar antes de chamar a limpeza, o que ele criou sai aqui.
afterAll(limparTudo)

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

  it('apaga os arquivos do cliente e os objetos do Storage, inclusive o que ficou sem linha', async () => {
    const consultoria = await criarConsultoriaDeTeste()
    const pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    const { data: cliente, error } = await admin
      .from('clientes')
      .insert({ nome: 'Limpeza dos arquivos', horas_mes: 1, consultoria_id: consultoria, consultor_id: pessoa.id })
      .select('id')
      .single()
    expect(error).toBeNull()
    registrarCliente(cliente.id)
    const comoPessoa = await entrarComo(pessoa)
    const comLinha = `${cliente.id}/${randomUUID()}-com_linha.txt`
    const semLinha = `${cliente.id}/${randomUUID()}-sem_linha.txt`
    for (const caminho of [comLinha, semLinha]) {
      const { error: erroEnvio } = await comoPessoa.storage.from('arquivos').upload(caminho, new Blob(['x']))
      expect(erroEnvio).toBeNull()
    }
    const { error: erroLinha } = await comoPessoa
      .from('cliente_arquivos')
      .insert({ cliente_id: cliente.id, caminho: comLinha, nome: 'com linha.txt', tamanho: 1 })
    expect(erroLinha).toBeNull()

    await limparTudo()

    expect((await admin.from('cliente_arquivos').select('id').eq('cliente_id', cliente.id)).data).toEqual([])
    expect((await admin.storage.from('arquivos').list(cliente.id)).data).toEqual([])
    expect((await admin.from('clientes').select('id').eq('id', cliente.id)).data).toEqual([])
    expect((await admin.from('consultorias').select('id').eq('id', consultoria)).data).toEqual([])
  })

  it('apaga o quadro do cliente com os cartões (que seguram o cliente) e o que está neles', async () => {
    const consultoria = await criarConsultoriaDeTeste()
    const pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    const { data: cliente, error } = await admin
      .from('clientes')
      .insert({ nome: 'Limpeza do quadro', horas_mes: 1, consultoria_id: consultoria, consultor_id: pessoa.id })
      .select('id')
      .single()
    expect(error).toBeNull()
    registrarCliente(cliente.id)
    const comoPessoa = await entrarComo(pessoa)
    const { data: quadro, error: erroQuadro } = await comoPessoa.rpc('quadro_do_cliente', { p_cliente: cliente.id })
    expect(erroQuadro).toBeNull()
    const { data: cartao, error: erroCartao } = await comoPessoa
      .from('cartoes')
      .insert({ coluna_id: quadro.colunas[0].id, titulo: 'Cartão da limpeza' })
      .select('id')
      .single()
    expect(erroCartao).toBeNull()
    const { error: erroComentario } = await comoPessoa
      .from('cartao_comentarios')
      .insert({ cartao_id: cartao.id, texto: 'Some junto' })
    expect(erroComentario).toBeNull()

    await limparTudo()

    expect((await admin.from('cartao_comentarios').select('id').eq('cartao_id', cartao.id)).data).toEqual([])
    expect((await admin.from('cartoes').select('id').eq('id', cartao.id)).data).toEqual([])
    expect((await admin.from('quadros').select('id').eq('id', quadro.id)).data).toEqual([])
    expect((await admin.from('clientes').select('id').eq('id', cliente.id)).data).toEqual([])
    expect((await admin.from('consultorias').select('id').eq('id', consultoria)).data).toEqual([])
  })

  it('apaga o quadro, os cartões e os objetos do balde quadros (anexos, imagens e o que ficou sem linha)', async () => {
    const consultoria = await criarConsultoriaDeTeste()
    const pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
    const { data: cliente, error } = await admin
      .from('clientes')
      .insert({ nome: 'Limpeza do quadro', horas_mes: 1, consultoria_id: consultoria, consultor_id: pessoa.id })
      .select('id')
      .single()
    expect(error).toBeNull()
    registrarCliente(cliente.id)
    const comoPessoa = await entrarComo(pessoa)
    const { data: quadro, error: erroQuadro } = await comoPessoa.rpc('quadro_do_cliente', { p_cliente: cliente.id })
    expect(erroQuadro).toBeNull()
    const { data: cartao, error: erroCartao } = await comoPessoa
      .from('cartoes')
      .insert({ coluna_id: quadro.colunas[0].id, titulo: 'Limpeza' })
      .select('id')
      .single()
    expect(erroCartao).toBeNull()
    const pasta = `${cliente.id}/${cartao.id}`
    const comLinha = `${pasta}/${randomUUID()}-com_linha.txt`
    const semLinha = `${pasta}/${randomUUID()}-sem_linha.txt`
    const imagem = `${pasta}/imagens/${randomUUID()}.png`
    for (const caminho of [comLinha, semLinha, imagem]) {
      const { error: erroEnvio } = await comoPessoa.storage.from('quadros').upload(caminho, new Blob(['x']))
      expect(erroEnvio).toBeNull()
    }
    const { error: erroLinha } = await comoPessoa
      .from('cartao_anexos')
      .insert({ cartao_id: cartao.id, caminho: comLinha, nome: 'com linha.txt', tamanho: 1 })
    expect(erroLinha).toBeNull()

    await limparTudo()

    expect((await admin.from('cartoes').select('id').eq('id', cartao.id)).data).toEqual([])
    expect((await admin.from('quadros').select('id').eq('cliente_id', cliente.id)).data).toEqual([])
    expect((await admin.storage.from('quadros').list(cliente.id)).data).toEqual([])
    expect((await admin.from('clientes').select('id').eq('id', cliente.id)).data).toEqual([])
  })
})
