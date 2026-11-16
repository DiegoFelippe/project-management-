// Arquivos do cliente no Supabase local de verdade (Storage + cliente_arquivos): o envio sobe o objeto e grava a
// linha, o download é por link assinado, outra consultoria não baixa, apagar tira a linha e o objeto, e arquivo
// acima de 25 MB é recusado. Os passos e os campos são os mesmos de src/data/arquivos.js; o caminho e as
// mensagens vêm do mesmo código do app (src/lib/arquivos.js e src/lib/erros.js).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { caminhoDoArquivo, TAMANHO_MAXIMO_ARQUIVO } from '../../src/lib/arquivos.js'
import { traduzirErroBanco } from '../../src/lib/erros.js'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const admin = clienteAdmin()
const BUCKET = 'arquivos'
// Os mesmos campos de src/data/arquivos.js.
const CAMPOS_DA_LISTA =
  'id, nome, tamanho, tipo, enviado_em, enviado_por, consultoria_id, caminho, autor:autor_do_arquivo(nome)'

let A, B
let central, gestorA, pessoaA, outraA, adminB
let comoCentral, comoGestor, comoPessoa, comoOutra, comoAdminB
let clienteId

const traduzir = (erro) => traduzirErroBanco(erro, { sobre: 'arquivo' })

// Sobe o objeto e grava a linha, como enviarArquivo. Devolve o caminho e o id da linha (ou o erro do passo).
async function enviar(cliente, nome, conteudo = `Conteúdo de ${nome}`) {
  const arquivo = new Blob([conteudo], { type: 'text/plain' })
  const caminho = caminhoDoArquivo(clienteId, nome)
  const { error } = await cliente.storage.from(BUCKET).upload(caminho, arquivo, { contentType: 'text/plain' })
  if (error) return { error, caminho }
  const { data, error: erroLinha } = await cliente
    .from('cliente_arquivos')
    .insert({ cliente_id: clienteId, caminho, nome, tamanho: arquivo.size, tipo: 'text/plain' })
    .select('id')
    .single()
  if (erroLinha) throw erroLinha
  return { caminho, id: data.id, conteudo }
}

// Apaga a linha (a RLS decide) e depois o objeto, como apagarArquivo.
async function apagar(cliente, id) {
  const { data, error } = await cliente.from('cliente_arquivos').delete().eq('id', id).select('caminho')
  if (error) throw error
  if (!data.length) return { apagouLinha: false }
  const { data: objetos, error: erroObjeto } = await cliente.storage.from(BUCKET).remove([data[0].caminho])
  return { apagouLinha: true, objetos, erroObjeto }
}

const existe = async (caminho) => (await admin.storage.from(BUCKET).exists(caminho)).data

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  central = await criarPerfilDeTeste({ papel: 'central' })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  outraA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  const { data, error } = await admin
    .from('clientes')
    .insert({ nome: 'Cliente com arquivos', horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
    .select('id')
    .single()
  if (error) throw error
  clienteId = data.id
  registrarCliente(clienteId)
  comoCentral = await entrarComo(central)
  comoGestor = await entrarComo(gestorA)
  comoPessoa = await entrarComo(pessoaA)
  comoOutra = await entrarComo(outraA)
  comoAdminB = await entrarComo(adminB)
})

afterAll(limparTudo)

describe('arquivos do cliente', () => {
  let doPessoa

  it('a consultora sobe um arquivo pequeno; o gestor sem times vê o nome dela na lista', async () => {
    doPessoa = await enviar(comoPessoa, 'Relatório de implantação.txt')
    expect(doPessoa.error).toBeUndefined()
    expect(doPessoa.caminho).toMatch(new RegExp(`^${clienteId}/[0-9a-f-]{36}-Relatorio_de_implantacao\\.txt$`))
    expect(await existe(doPessoa.caminho)).toBe(true)

    const { data, error, count } = await comoGestor
      .from('cliente_arquivos')
      .select(CAMPOS_DA_LISTA, { count: 'exact' })
      .eq('cliente_id', clienteId)
      .order('enviado_em', { ascending: false })
      .order('id')
      .range(0, 14)
    expect(error).toBeNull()
    expect(count).toBe(1)
    expect(data[0]).toMatchObject({
      id: doPessoa.id,
      nome: 'Relatório de implantação.txt',
      tipo: 'text/plain',
      consultoria_id: A,
      enviado_por: pessoaA.id,
      autor: { nome: 'Teste pessoa' },
    })
    expect(data[0].tamanho).toBe(new Blob([doPessoa.conteudo]).size)
  })

  it('o arquivo da central aparece como "Central" para a consultoria', async () => {
    const daCentral = await enviar(comoCentral, 'Contrato assinado.pdf')
    expect(daCentral.error).toBeUndefined()
    const { data, error } = await comoPessoa
      .from('cliente_arquivos')
      .select(CAMPOS_DA_LISTA)
      .eq('id', daCentral.id)
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ consultoria_id: null, autor: { nome: 'Central' } })
  })

  it('baixa pelo link assinado de 60 s, com o nome do arquivo', async () => {
    const { data, error } = await comoPessoa.storage
      .from(BUCKET)
      .createSignedUrl(doPessoa.caminho, 60, { download: 'Relatório de implantação.txt' })
    expect(error).toBeNull()
    const resposta = await fetch(data.signedUrl)
    expect(resposta.status).toBe(200)
    expect(await resposta.text()).toBe(doPessoa.conteudo)
    expect(resposta.headers.get('content-disposition')).toMatch(/attachment/)
  })

  it('outra consultoria não vê o arquivo e recebe erro ao pedir o link', async () => {
    const { data: linhas } = await comoAdminB.from('cliente_arquivos').select('id').eq('cliente_id', clienteId)
    expect(linhas).toEqual([])
    const { data, error } = await comoAdminB.storage.from(BUCKET).createSignedUrl(doPessoa.caminho, 60)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(traduzir(error)).toBe('Esse arquivo não foi encontrado.')
    const { data: objetos } = await comoAdminB.storage.from(BUCKET).list(clienteId)
    expect(objetos).toEqual([])
  })

  it('outra consultoria e quem não é a consultora não sobem arquivo ao cliente', async () => {
    for (const cliente of [comoAdminB, comoOutra]) {
      const { error, caminho } = await enviar(cliente, 'Intruso.txt')
      expect(error).toBeDefined()
      expect(traduzir(error)).toBe('Você não tem permissão para isso.')
      expect(await existe(caminho)).toBe(false)
    }
  })

  it('arquivo de 26 MB é recusado pelo Storage', async () => {
    const grande = new Blob([new Uint8Array(26 * 1024 * 1024)], { type: 'application/octet-stream' })
    expect(grande.size).toBeGreaterThan(TAMANHO_MAXIMO_ARQUIVO)
    const caminho = caminhoDoArquivo(clienteId, 'Grande.bin')
    const { error } = await comoPessoa.storage.from(BUCKET).upload(caminho, grande, {
      contentType: 'application/octet-stream',
    })
    expect(error).not.toBeNull()
    expect(traduzir(error)).toBe('O arquivo passa de 25 MB.')
    expect(await existe(caminho)).toBe(false)
  })

  it('se a linha não grava, quem subiu tira o objeto (ninguém mais o vê)', async () => {
    const caminho = caminhoDoArquivo(clienteId, 'Sem linha.txt')
    const { error } = await comoPessoa.storage.from(BUCKET).upload(caminho, new Blob(['x']), { contentType: 'text/plain' })
    expect(error).toBeNull()
    const { error: erroLinha } = await comoPessoa
      .from('cliente_arquivos')
      .insert({ cliente_id: clienteId, caminho, nome: 'Sem linha.txt', tamanho: 0 })
    expect(erroLinha?.code).toBe('23514')
    expect((await comoGestor.storage.from(BUCKET).createSignedUrl(caminho, 60)).error).not.toBeNull()
    const { data, error: erroRemover } = await comoPessoa.storage.from(BUCKET).remove([caminho])
    expect(erroRemover).toBeNull()
    expect(data).toHaveLength(1)
    expect(await existe(caminho)).toBe(false)
  })

  it('outra consultoria não apaga: nem a linha nem o objeto', async () => {
    expect((await apagar(comoAdminB, doPessoa.id)).apagouLinha).toBe(false)
    // O Storage não dá erro para o objeto que a pessoa não pode tirar: devolve a lista vazia.
    const { data, error } = await comoAdminB.storage.from(BUCKET).remove([doPessoa.caminho])
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await existe(doPessoa.caminho)).toBe(true)
  })

  it('quem enviou apaga: a linha e o objeto saem', async () => {
    const resultado = await apagar(comoPessoa, doPessoa.id)
    expect(resultado.apagouLinha).toBe(true)
    expect(resultado.erroObjeto).toBeNull()
    expect(resultado.objetos).toHaveLength(1)
    expect((await admin.from('cliente_arquivos').select('id').eq('id', doPessoa.id)).data).toEqual([])
    expect(await existe(doPessoa.caminho)).toBe(false)
  })

  it('o gestor apaga o arquivo que a consultora enviou: a linha e o objeto saem', async () => {
    const outro = await enviar(comoPessoa, 'Planilha.csv')
    const resultado = await apagar(comoGestor, outro.id)
    expect(resultado.apagouLinha).toBe(true)
    expect(resultado.erroObjeto).toBeNull()
    expect(resultado.objetos).toHaveLength(1)
    expect((await admin.from('cliente_arquivos').select('id').eq('id', outro.id)).data).toEqual([])
    expect(await existe(outro.caminho)).toBe(false)
  })
})
