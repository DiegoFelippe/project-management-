// O check-list do cliente contra o Supabase local de verdade: roda as funções de src/data/checklists.js,
// src/data/checkins.js e o Andamento (as mesmas chamadas que o app faz) como cada tipo de usuário. Pega o que um mock
// esconde: função que a API não enxerga, permissão que falta, a lista de check-ins com as tarefas embutidas e a tradução
// do erro que o banco devolve de verdade.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

// O cliente do Supabase de quem está "logado" no teste (entrar).
const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get: (_, nome) => {
      const valor = atual.cliente[nome]
      return typeof valor === 'function' ? valor.bind(atual.cliente) : valor
    },
  }),
}))

const {
  anotarTarefa, aplicarModelo, lerChecklist, listarAndamento, marcarTarefa, modelosParaAplicar, mudarInicio, tirarModelo,
  usoDoModelo,
} = await import('../../src/data/checklists.js')
const { indicadoresDeCheckins } = await import('../../src/data/indicadores.js')
const { fazerCheckin, fazerCheckout, listarCheckins, meuCheckinAberto, tarefasDoCheckin } =
  await import('../../src/data/checkins.js')
const { salvarModelo } = await import('../../src/data/modelos.js')
const { apagarCliente } = await import('../../src/data/clientes.js')

const admin = clienteAdmin()
// Marca dos nomes deste arquivo, para a busca achar só o que ele criou.
const marca = `Zc${Date.now().toString(36)}`

let A, B, clienteId
let pessoas = {}
let sessoes = {}
const modelo = {}
const tarefa = {}
let checklistId, checkinId

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}

// Hoje em São Paulo (aaaa-mm-dd), como o banco conta os prazos.
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somarDias = (data, dias) => {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const dados = (nome) => ({
  nome,
  tipo: 'gestao',
  para: A,
  etapas: [
    {
      nome: 'Diagnóstico',
      tarefas: [
        { chave: 'a', titulo: 'Análise do DRE', obrigatoria: true, prazo_dias: 5, depende_de: [] },
        { chave: 'b', titulo: 'Mapa de custos', obrigatoria: false, prazo_dias: 10, depende_de: ['a'] },
      ],
    },
    { nome: 'Plano', tarefas: [{ chave: 'c', titulo: 'Plano de ação', obrigatoria: true, prazo_dias: 20, depende_de: ['a', 'b'] }] },
  ],
})

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  pessoas = {
    central: await criarPerfilDeTeste({ papel: 'central' }),
    gestor: await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A }),
    pessoa: await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A }),
    gestorB: await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: B }),
  }
  sessoes = Object.fromEntries(await Promise.all(Object.entries(pessoas).map(async ([k, p]) => [k, await entrarComo(p)])))
  const { data, error } = await admin
    .from('clientes')
    .insert({ nome: `${marca} Cliente`, horas_mes: 10, consultoria_id: A, consultor_id: pessoas.pessoa.id })
    .select('id')
    .single()
  if (error) throw error
  clienteId = data.id
  registrarCliente(clienteId)

  entrar('central')
  for (const chave of ['um', 'outro']) {
    const salvo = await salvarModelo(null, dados(`${marca} Modelo ${chave}`))
    if (salvo.erro) throw new Error(salvo.erro)
    modelo[chave] = salvo.id
  }
})

afterAll(limparTudo)

describe('check-list do cliente contra o banco de verdade', () => {
  it('a gestão escolhe o modelo e aplica; o consultor lê o check-list inteiro numa leitura', async () => {
    entrar('gestor')
    const lista = await modelosParaAplicar({ clienteId, busca: marca })
    expect(lista.total).toBe(2)
    expect(lista.itens[0]).toMatchObject({ nome: `${marca} Modelo outro`, etapas: 2, tarefas: 3, da_central: true })

    const aplicado = await aplicarModelo({ clienteId, modeloId: modelo.um, inicio: hoje() })
    expect(aplicado.erro).toBeNull()
    checklistId = aplicado.id

    entrar('pessoa')
    const lido = await lerChecklist(clienteId)
    expect(lido).toMatchObject({
      pode_aplicar: false,
      pode_marcar: true,
      consultor: { id: pessoas.pessoa.id },
      checklist: { id: checklistId, modelo_id: modelo.um, modelo_nome: `${marca} Modelo um`, inicio: hoje() },
      resumo: { tarefas: 3, feitas: 0, obrigatorias: 2 },
      sessao: null,
    })
    expect(lido.tarefas.map((t) => [t.titulo, t.vence_em])).toEqual([
      ['Análise do DRE', somarDias(hoje(), 5)],
      ['Mapa de custos', somarDias(hoje(), 10)],
      ['Plano de ação', somarDias(hoje(), 20)],
    ])
    for (const t of lido.tarefas) tarefa[t.titulo] = t.id
    expect(lido.tarefas[2].depende_de).toEqual([tarefa['Análise do DRE'], tarefa['Mapa de custos']])
  })

  it('o Andamento pela API: a gestão e o consultor veem a linha com o check-list; outra consultoria, não', async () => {
    entrar('gestor')
    expect(await listarAndamento({ busca: marca })).toEqual({
      itens: [{
        cliente: { id: clienteId, nome: `${marca} Cliente`, cidade: null, uf: null },
        consultor: expect.objectContaining({ id: pessoas.pessoa.id }),
        consultoria: null,
        pode_aplicar: true,
        checklist: {
          id: checklistId, modelo_nome: `${marca} Modelo um`, tarefas: 3, feitas: 0, pct: 0, atrasadas: 0,
          proxima: { titulo: 'Análise do DRE', vence_em: somarDias(hoje(), 5) },
        },
      }],
      total: 1,
    })
    expect(await listarAndamento({ busca: marca, situacao: 'sem_modelo' })).toEqual({ itens: [], total: 0 })
    expect(await indicadoresDeCheckins()).toEqual({
      recorte: 'consultoria', clientes: 1, com_modelo: 1, progresso_medio: 0, atrasadas: 0, vencem_7_dias: 1,
    })
    entrar('pessoa')
    expect((await listarAndamento()).itens.map((l) => [l.cliente.id, l.pode_aplicar])).toEqual([[clienteId, false]])
    entrar('central')
    expect((await listarAndamento({ consultoriaId: A })).itens[0].consultoria).toMatchObject({ id: A })
    entrar('gestorB')
    expect(await listarAndamento({ busca: marca })).toEqual({ itens: [], total: 0 })
    expect((await indicadoresDeCheckins()).clientes).toBe(0)
  })

  it('marcar sem check-in aberto: fica feita, fora de uma sessão, e diz o que liberou', async () => {
    entrar('pessoa')
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'feita')).toEqual({
      erro: 'Esta tarefa depende de outras que ainda não foram feitas.', desatualizado: true,
    })
    const feita = await marcarTarefa(tarefa['Análise do DRE'], 'feita')
    expect(feita).toMatchObject({
      estado: 'feita',
      liberadas: [{ id: tarefa['Mapa de custos'], titulo: 'Mapa de custos' }],
      na_sessao: false,
      erro: null,
    })
    expect(feita.feita_em).toBeTruthy()
  })

  it('com o check-in aberto neste cliente, entra na sessão; o check-out e a lista de check-ins mostram as tarefas', async () => {
    entrar('pessoa')
    expect(await fazerCheckin(clienteId)).toEqual({ erro: null })
    checkinId = (await meuCheckinAberto(pessoas.pessoa.id)).id
    // O início vai para uma hora atrás, para o check-out caber.
    await admin.from('checkins').update({ inicio: new Date(Date.now() - 3_600_000).toISOString() }).eq('id', checkinId)

    expect(await marcarTarefa(tarefa['Mapa de custos'], 'feita')).toMatchObject({ na_sessao: true, erro: null })
    expect((await lerChecklist(clienteId)).sessao).toMatchObject({
      checkin_id: checkinId,
      tarefas: [{ tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos' }],
    })
    expect(await tarefasDoCheckin(checkinId)).toEqual([{ tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos' }])

    expect(await fazerCheckout(checkinId, { fim: new Date().toISOString(), descricao: 'Tarefas concluídas: Mapa de custos.' }))
      .toEqual({ erro: null })
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'a_fazer')).toMatchObject({ estado: 'a_fazer', na_sessao: false })
    expect(await tarefasDoCheckin(checkinId)).toEqual([{ tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos' }])

    for (const quem of ['pessoa', 'gestor', 'central']) {
      entrar(quem)
      const { itens } = await listarCheckins({ clienteId })
      expect(itens.find((k) => k.id === checkinId)).toMatchObject({ tarefas: [{ titulo: 'Mapa de custos' }], total_tarefas: 1 })
    }
    entrar('gestorB')
    expect((await listarCheckins({ clienteId })).itens).toEqual([])
    expect(await tarefasDoCheckin(checkinId)).toEqual([])
  })

  it('quem só acompanha não marca; o consultor escreve a nota; os erros vêm traduzidos', async () => {
    entrar('gestor')
    expect(await marcarTarefa(tarefa['Plano de ação'], 'feita'))
      .toEqual({ erro: 'Só o consultor do cliente marca as tarefas.', desatualizado: true })
    expect((await lerChecklist(clienteId)).pode_marcar).toBe(false)
    entrar('pessoa')
    expect(await anotarTarefa(tarefa['Plano de ação'], ' Esperando o DRE ')).toEqual({ erro: null })
    expect((await lerChecklist(clienteId)).tarefas[2].nota).toBe('Esperando o DRE')
    expect(await anotarTarefa(tarefa['Plano de ação'], 'x'.repeat(501))).toEqual({ erro: 'A nota vai até 500 letras.' })
    entrar('gestorB')
    expect(await lerChecklist(clienteId)).toBeNull()
  })

  it('a gestão muda o início, troca e tira o modelo; o antigo vira histórico', async () => {
    entrar('gestor')
    expect(await mudarInicio(checklistId, somarDias(hoje(), 1))).toEqual({ erro: null })
    expect((await lerChecklist(clienteId)).tarefas[0].vence_em).toBe(somarDias(hoje(), 6))
    expect(await mudarInicio(checklistId, '2000-01-01')).toEqual({
      erro: 'O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.',
    })
    expect(await usoDoModelo(modelo.um)).toEqual({ clientes: 1, nomes: [`${marca} Cliente`] })

    const trocado = await aplicarModelo({ clienteId, modeloId: modelo.outro, inicio: hoje() })
    expect(trocado.erro).toBeNull()
    expect((await lerChecklist(clienteId)).checklist.id).toBe(trocado.id)
    entrar('pessoa')
    expect(await marcarTarefa(tarefa['Plano de ação'], 'feita')).toEqual({
      erro: 'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.', desatualizado: true,
    })

    entrar('gestor')
    expect(await tirarModelo(trocado.id)).toEqual({ erro: null })
    expect((await lerChecklist(clienteId)).checklist).toBeNull()
    const { data } = await admin.from('cliente_checklists').select('motivo').eq('cliente_id', clienteId).order('aplicado_em')
    expect(data.map((c) => c.motivo)).toEqual(['trocado', 'tirado'])
  })

  it('cliente com check-list não se apaga: o app pede para arquivar', async () => {
    entrar('central')
    expect(await apagarCliente(clienteId)).toEqual({
      erro: 'Este cliente tem horas, arquivos, cartões ou modelo de check-in registrados. Arquive em vez de apagar.',
    })
  })

  it('escrita direta nas tabelas do check-list é recusada (só pelas funções do banco)', async () => {
    entrar('gestor')
    const { error } = await sessoes.gestor.from('checklist_tarefas').update({ estado: 'feita' }).eq('checklist_id', checklistId)
    expect(error?.code).toBe('42501')
    const { error: erroInsert } = await sessoes.pessoa.from('checkin_tarefas')
      .insert({ checkin_id: checkinId, tarefa_id: tarefa['Plano de ação'], titulo: 'Falsa' })
    expect(erroInsert?.code).toBe('42501')
  })
})
