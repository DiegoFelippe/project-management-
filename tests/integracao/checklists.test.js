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
  anotarTarefa, apagarComentarioDaTarefa, aplicarModelo, comentarTarefa, comentariosDaTarefa, editarComentarioDaTarefa,
  historicoDaTarefa, lerChecklist, listarAndamento, marcarTarefa, modelosParaAplicar, mudarInicio, tirarModelo, trocarMotivo,
  usoDoModelo,
} = await import('../../src/data/checklists.js')
const { indicadoresDeCheckins } = await import('../../src/data/indicadores.js')
const { fazerCheckin, fazerCheckout, listarCheckins, meuCheckinAberto, tarefasDoCheckin } =
  await import('../../src/data/checkins.js')
const { salvarModelo } = await import('../../src/data/modelos.js')
const { apagarCliente, listarEventos } = await import('../../src/data/clientes.js')

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
          id: checklistId, modelo_nome: `${marca} Modelo um`, tarefas: 3, feitas: 0, nao_se_aplica: 0, pct: 0, atrasadas: 0,
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
    expect(await tarefasDoCheckin(checkinId)).toEqual([
      { tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos', estado: 'feita', motivo: null },
    ])

    expect(await fazerCheckout(checkinId, { fim: new Date().toISOString(), descricao: 'Tarefas concluídas: Mapa de custos.' }))
      .toEqual({ erro: null })
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'a_fazer')).toMatchObject({ estado: 'a_fazer', na_sessao: false })
    expect(await tarefasDoCheckin(checkinId)).toEqual([
      { tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos', estado: 'feita', motivo: null },
    ])

    for (const quem of ['pessoa', 'gestor', 'central']) {
      entrar(quem)
      const { itens } = await listarCheckins({ clienteId })
      expect(itens.find((k) => k.id === checkinId)).toMatchObject({ tarefas: [{ titulo: 'Mapa de custos' }], total_tarefas: 1 })
    }
    entrar('gestorB')
    expect((await listarCheckins({ clienteId })).itens).toEqual([])
    expect(await tarefasDoCheckin(checkinId)).toEqual([])
  })

  it('"não se aplica" pela API: motivo obrigatório, só o consultor, entra no check-in, nos números e no Histórico', async () => {
    entrar('pessoa')
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'nao_se_aplica', '   ')).toEqual({ erro: 'Conte por que esta tarefa não se aplica.' })
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'nao_se_aplica', 'x'.repeat(501))).toEqual({ erro: 'O motivo vai até 500 letras.' })
    entrar('gestor')
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'nao_se_aplica', 'Não precisa'))
      .toEqual({ erro: 'Só o consultor do cliente marca as tarefas.', desatualizado: true })

    // Um check-in aberto logo depois do anterior (os check-ins da pessoa não se sobrepõem).
    entrar('pessoa')
    expect(await fazerCheckin(clienteId)).toEqual({ erro: null })
    const novo = (await meuCheckinAberto(pessoas.pessoa.id)).id
    const { data: anterior } = await admin.from('checkins').select('fim').eq('id', checkinId).single()
    await admin.from('checkins').update({ inicio: new Date(new Date(anterior.fim).getTime() + 1).toISOString() }).eq('id', novo)

    expect(await marcarTarefa(tarefa['Mapa de custos'], 'nao_se_aplica', ' Sem custos fixos ')).toMatchObject({
      estado: 'nao_se_aplica', liberadas: [{ id: tarefa['Plano de ação'], titulo: 'Plano de ação' }], na_sessao: true, erro: null,
    })
    const lido = await lerChecklist(clienteId)
    expect(lido.tarefas[1]).toMatchObject({
      estado: 'nao_se_aplica', motivo: 'Sem custos fixos', feita_por: { nome: expect.any(String) },
    })
    // De novo com outro motivo: a tela estava velha (trocar o motivo é reabrir e marcar de novo).
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'nao_se_aplica', 'Outro motivo')).toEqual({
      erro: 'Esta tarefa já está como não se aplica. Para trocar o motivo, reabra e marque de novo.', desatualizado: true,
    })
    expect(lido.resumo).toMatchObject({ tarefas: 3, feitas: 1, nao_se_aplica: 1, resolvidas: 2 })
    expect(lido.sessao.tarefas).toEqual([
      { tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos', estado: 'nao_se_aplica', motivo: 'Sem custos fixos' },
    ])
    expect(await tarefasDoCheckin(novo)).toEqual([
      { tarefa_id: tarefa['Mapa de custos'], titulo: 'Mapa de custos', estado: 'nao_se_aplica', motivo: 'Sem custos fixos' },
    ])
    expect(await fazerCheckout(novo, { fim: new Date().toISOString(), descricao: 'Não se aplica: Mapa de custos (Sem custos fixos).' }))
      .toEqual({ erro: null })

    for (const quem of ['pessoa', 'gestor', 'central']) {
      entrar(quem)
      const { itens } = await listarCheckins({ clienteId })
      expect(itens.find((k) => k.id === novo)).toMatchObject({
        tarefas: [{ titulo: 'Mapa de custos', estado: 'nao_se_aplica', motivo: 'Sem custos fixos' }], total_tarefas: 1,
      })
    }
    entrar('gestor')
    expect((await listarAndamento({ busca: marca })).itens[0].checklist).toMatchObject({ feitas: 1, nao_se_aplica: 1, pct: 67 })
    const { itens: eventos } = await listarEventos(clienteId)
    expect(eventos.find((e) => e.tipo === 'tarefa_nao_se_aplica'))
      .toMatchObject({ tarefa: 'Mapa de custos', motivo: 'Sem custos fixos', autor: expect.any(String) })

    // Desfazer: volta para a fazer, sem motivo; o check-in fechado continua contando a história.
    entrar('pessoa')
    expect(await marcarTarefa(tarefa['Mapa de custos'], 'a_fazer')).toMatchObject({ estado: 'a_fazer', na_sessao: false })
    expect((await lerChecklist(clienteId)).tarefas[1]).toMatchObject({ estado: 'a_fazer', motivo: null, feita_por: null })
    expect((await tarefasDoCheckin(novo))[0]).toMatchObject({ estado: 'nao_se_aplica', motivo: 'Sem custos fixos' })

    // A bloqueada (Plano espera o Mapa) também pode ser "não se aplica"; desfeita, o Histórico diz "tarefa reaberta".
    expect(await marcarTarefa(tarefa['Plano de ação'], 'nao_se_aplica', 'Plano já existe')).toMatchObject({
      estado: 'nao_se_aplica', liberadas: [], erro: null,
    })
    expect(await marcarTarefa(tarefa['Plano de ação'], 'a_fazer')).toMatchObject({ estado: 'a_fazer', erro: null })
    entrar('gestor')
    const { itens: depois } = await listarEventos(clienteId)
    expect(depois.filter((e) => e.tipo === 'tarefa_reaberta').map((e) => e.tarefa).sort()).toEqual(['Mapa de custos', 'Plano de ação'])
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

  it('Pausada com o tempo, trocar o motivo, comentários e o histórico da tarefa pela API', async () => {
    const mapa = tarefa['Mapa de custos']
    const plano = tarefa['Plano de ação']
    entrar('pessoa')
    const iniciada = await marcarTarefa(mapa, 'andamento')
    expect(iniciada).toMatchObject({ estado: 'andamento', tempo_segundos: 0, erro: null })
    expect(iniciada.trecho_aberto_desde).toEqual(expect.any(String))
    // O trecho aberto vai para 10 minutos atrás (o relógio da tarefa correu).
    await admin.from('checklist_tarefa_tempos').update({ inicio: new Date(Date.now() - 600_000).toISOString() })
      .eq('tarefa_id', mapa).is('fim', null)
    const pausada = await marcarTarefa(mapa, 'pausada')
    expect(pausada).toMatchObject({ estado: 'pausada', trecho_aberto_desde: null, erro: null })
    expect(pausada.tempo_segundos).toBeGreaterThanOrEqual(590)
    const lido = await lerChecklist(clienteId)
    expect(lido).toMatchObject({ pode_comentar: true, resumo: { resolvidas: 1 } })
    expect(lido.tarefas[1]).toMatchObject({ estado: 'pausada', tempo_segundos: pausada.tempo_segundos, trecho_aberto_desde: null,
      comentarios: 0 })
    expect(await marcarTarefa(plano, 'feita')).toEqual({
      erro: 'Esta tarefa depende de outras que ainda não foram feitas.', desatualizado: true,
    })

    // Trocar o motivo (o Editar): só numa que não se aplica, só o consultor; o Histórico ganha "Motivo trocado".
    expect(await trocarMotivo(mapa, 'Outro')).toEqual({
      erro: 'Esta tarefa não está mais como "não se aplica". Atualize a página.', desatualizado: true,
    })
    expect(await marcarTarefa(mapa, 'nao_se_aplica', 'Sem custos fixos')).toMatchObject({ estado: 'nao_se_aplica', erro: null })
    expect(await trocarMotivo(mapa, ' Sem custos fixos nem variáveis ')).toEqual({ erro: null })
    expect((await lerChecklist(clienteId)).tarefas[1].motivo).toBe('Sem custos fixos nem variáveis')
    entrar('gestor')
    expect(await trocarMotivo(mapa, 'Outro')).toEqual({ erro: 'Só o consultor do cliente marca as tarefas.', desatualizado: true })
    const { itens: eventos } = await listarEventos(clienteId)
    expect(eventos.find((e) => e.tipo === 'motivo_trocado'))
      .toMatchObject({ tarefa: 'Mapa de custos', motivo: 'Sem custos fixos nem variáveis', autor: expect.any(String) })

    // Comentários: o consultor e a gestão comentam; cada um edita o seu; a gestão apaga qualquer um; a Central só lê.
    entrar('pessoa')
    const meu = await comentarTarefa(plano, ' Falei com o contador ')
    expect(meu).toMatchObject({ erro: null, comentario: { texto: 'Falei com o contador', editado_em: null, pode_editar: true,
      pode_apagar: true, autor: { nome: expect.any(String) } } })
    expect(await comentarTarefa(plano, '   ')).toEqual({ erro: 'Escreva o comentário.' })
    expect(await comentarTarefa(plano, 'x'.repeat(2001))).toEqual({ erro: 'O comentário vai até 2.000 letras.' })
    entrar('gestor')
    const doGestor = await comentarTarefa(plano, 'Combine a data')
    expect(doGestor.erro).toBeNull()
    expect(await editarComentarioDaTarefa(meu.comentario.id, 'Mudei'))
      .toEqual({ erro: 'Você não tem permissão para isso.', desatualizado: true })
    const lista = await comentariosDaTarefa({ tarefaId: plano })
    expect(lista).toMatchObject({ haMais: false, podeComentar: true })
    expect(lista.itens.map((c) => [c.texto, c.pode_editar, c.pode_apagar]))
      .toEqual([['Combine a data', true, true], ['Falei com o contador', false, true]])
    entrar('central')
    expect(await comentarTarefa(plano, 'Oi')).toEqual({ erro: 'Você não tem permissão para isso.', desatualizado: true })
    expect((await comentariosDaTarefa({ tarefaId: plano })).itens.map((c) => [c.pode_editar, c.pode_apagar]))
      .toEqual([[false, false], [false, false]])
    entrar('gestorB')
    expect(await comentariosDaTarefa({ tarefaId: plano })).toEqual({ itens: [], haMais: false, podeComentar: false })
    expect((await sessoes.gestorB.from('checklist_comentarios').select('id').eq('tarefa_id', plano)).data).toEqual([])
    expect(await historicoDaTarefa(mapa)).toBeNull()

    entrar('pessoa')
    expect((await editarComentarioDaTarefa(meu.comentario.id, 'Falei com o contador ontem')).comentario)
      .toMatchObject({ texto: 'Falei com o contador ontem', editado_em: expect.any(String) })
    expect(await apagarComentarioDaTarefa(doGestor.comentario.id))
      .toEqual({ erro: 'Você não tem permissão para isso.', desatualizado: true })
    expect((await lerChecklist(clienteId)).tarefas[2].comentarios).toBe(2)
    const { error: direto } = await sessoes.pessoa.from('checklist_comentarios').insert({ tarefa_id: plano, texto: 'Direto' })
    expect(direto?.code).toBe('42501')
    entrar('gestor')
    expect(await apagarComentarioDaTarefa(meu.comentario.id)).toEqual({ erro: null })
    expect(await apagarComentarioDaTarefa(meu.comentario.id))
      .toEqual({ erro: 'Este comentário foi apagado. Atualize a tarefa.', desatualizado: true })

    // O histórico curto da tarefa: as linhas dela no Histórico e os trechos de tempo.
    const historico = await historicoDaTarefa(mapa)
    expect(historico.eventos.map((e) => e.tipo)).toContain('motivo_trocado')
    expect(historico.eventos[0]).toMatchObject({ tipo: 'motivo_trocado', motivo: 'Sem custos fixos nem variáveis' })
    expect(historico.trechos).toEqual([expect.objectContaining({ fim: expect.any(String), pessoa: expect.any(String) })])
    expect(historico.tempo_segundos).toBe(pausada.tempo_segundos)

    entrar('pessoa')
    expect(await marcarTarefa(mapa, 'a_fazer')).toMatchObject({ estado: 'a_fazer', erro: null })
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
