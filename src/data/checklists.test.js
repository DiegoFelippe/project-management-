import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  anotarTarefa,
  apagarComentarioDaTarefa,
  aplicarModelo,
  comentarTarefa,
  comentariosDaTarefa,
  editarComentarioDaTarefa,
  historicoDaTarefa,
  lerChecklist,
  listarAndamento,
  marcarTarefa,
  modelosParaAplicar,
  mudarInicio,
  tirarModelo,
  trocarMotivo,
  usoDoModelo,
} from './checklists'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
})

const rpcResponde = (data, error = null) => vi.mocked(supabase.rpc).mockResolvedValue({ data, error })

describe('leituras do check-list (funções do banco)', () => {
  it('lerChecklist traz tudo numa leitura; null quando a pessoa não vê o cliente', async () => {
    const lido = { pode_marcar: true, checklist: { id: 'cl1' }, tarefas: [] }
    rpcResponde(lido)
    expect(await lerChecklist('k1')).toEqual(lido)
    expect(supabase.rpc).toHaveBeenCalledWith('checklist_do_cliente', { p_cliente: 'k1' })
    rpcResponde(null)
    expect(await lerChecklist('k2')).toBeNull()
  })

  it('modelosParaAplicar pede ao banco com a busca e devolve { itens, total }', async () => {
    const itens = [{ id: 'm1', nome: 'Implantação', do_tipo_do_consultor: true }]
    rpcResponde({ itens, total: 7 })
    expect(await modelosParaAplicar({ clienteId: 'k1', busca: ' implan ' })).toEqual({ itens, total: 7 })
    expect(supabase.rpc).toHaveBeenCalledWith('modelos_para_aplicar', { p_cliente: 'k1', p_busca: 'implan' })
    rpcResponde({ itens: [], total: 0 })
    await modelosParaAplicar({ clienteId: 'k1', busca: '   ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('modelos_para_aplicar', { p_cliente: 'k1', p_busca: null })
  })

  it('usoDoModelo: quantos clientes usam e os nomes que a pessoa vê; null quando não vê o modelo', async () => {
    rpcResponde({ clientes: 3, nomes: ['Cliente A'] })
    expect(await usoDoModelo('m1')).toEqual({ clientes: 3, nomes: ['Cliente A'] })
    expect(supabase.rpc).toHaveBeenCalledWith('uso_do_modelo', { p_modelo: 'm1' })
    rpcResponde(null)
    expect(await usoDoModelo('m2')).toBeNull()
  })

  it('listarAndamento pede a página ao banco com os filtros da barra e devolve { itens, total }', async () => {
    const itens = [{ cliente: { id: 'k1', nome: 'Padaria' }, checklist: null }]
    rpcResponde({ itens, total: 16 })
    expect(await listarAndamento({ consultoriaId: 'c1', consultorId: 'p1', situacao: 'com_atraso', busca: ' dre ', pagina: 2 }))
      .toEqual({ itens, total: 16 })
    expect(supabase.rpc).toHaveBeenCalledWith('andamento_dos_clientes', {
      p_consultoria: 'c1', p_consultor: 'p1', p_situacao: 'com_atraso', p_busca: 'dre', p_pagina: 2,
    })
  })

  it('listarAndamento sem filtros: todos, página 1 e o resto nulo', async () => {
    rpcResponde({ itens: [], total: 0 })
    expect(await listarAndamento()).toEqual({ itens: [], total: 0 })
    expect(supabase.rpc).toHaveBeenCalledWith('andamento_dos_clientes', {
      p_consultoria: null, p_consultor: null, p_situacao: 'todos', p_busca: null, p_pagina: 1,
    })
    await listarAndamento({ consultoriaId: '', consultorId: '', busca: '   ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('andamento_dos_clientes', {
      p_consultoria: null, p_consultor: null, p_situacao: 'todos', p_busca: null, p_pagina: 1,
    })
  })

  it('listarAndamento: página que deixou de existir volta com foraDaFaixa', async () => {
    rpcResponde({ itens: [], total: 15 })
    expect(await listarAndamento({ pagina: 2 })).toEqual({ itens: [], total: 15, foraDaFaixa: true })
  })

  it('erro do banco nas leituras sobe', async () => {
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    await expect(lerChecklist('k1')).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(modelosParaAplicar({ clienteId: 'k1' })).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(usoDoModelo('m1')).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
    await expect(listarAndamento()).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })
})

describe('escritas do check-list', () => {
  it('aplicarModelo manda o cliente, o modelo e o início; devolve o id do check-list', async () => {
    rpcResponde('cl9')
    expect(await aplicarModelo({ clienteId: 'k1', modeloId: 'm1', inicio: '2026-11-17' })).toEqual({ id: 'cl9', erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('aplicar_modelo', { p_cliente: 'k1', p_modelo: 'm1', p_inicio: '2026-11-17' })
  })

  it('aplicarModelo traduz a recusa do banco', async () => {
    rpcResponde(null, { code: 'P0001', message: 'modelo_indisponivel' })
    expect(await aplicarModelo({ clienteId: 'k1', modeloId: 'm1', inicio: '2026-11-17' })).toEqual({
      id: null,
      erro: 'Esse modelo não está mais disponível para este cliente. Escolha outro.',
    })
  })

  it('mudarInicio e tirarModelo devolvem { erro }', async () => {
    rpcResponde(null)
    expect(await mudarInicio('cl1', '2026-12-01')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('mudar_inicio_do_checklist', { p_checklist: 'cl1', p_inicio: '2026-12-01' })
    expect(await tirarModelo('cl1')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenLastCalledWith('tirar_modelo', { p_checklist: 'cl1' })
    rpcResponde(null, { code: 'P0001', message: 'inicio_invalido' })
    expect(await mudarInicio('cl1', '2020-01-01')).toEqual({
      erro: 'O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.',
    })
    rpcResponde(null, { code: 'P0001', message: 'checklist_encerrado' })
    expect((await tirarModelo('cl1')).erro).toMatch(/trocado ou tirado/)
  })

  it('marcarTarefa devolve o resultado do banco (o que liberou e se entrou na sessão)', async () => {
    const resultado = { estado: 'feita', feita_em: '2026-11-17T12:00:00Z', liberadas: [{ id: 't2', titulo: 'Mapa' }], na_sessao: true }
    rpcResponde(resultado)
    expect(await marcarTarefa('t1', 'feita')).toEqual({ ...resultado, erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_tarefa', { p_tarefa: 't1', p_estado: 'feita' })
  })

  it('marcarTarefa com "não se aplica" manda o motivo; nos outros estados, não', async () => {
    rpcResponde({ estado: 'nao_se_aplica', feita_em: '2026-11-18T12:00:00Z', liberadas: [], na_sessao: false })
    expect(await marcarTarefa('t1', 'nao_se_aplica', 'O cliente não tem estoque')).toMatchObject({ estado: 'nao_se_aplica', erro: null })
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_tarefa', {
      p_tarefa: 't1', p_estado: 'nao_se_aplica', p_motivo: 'O cliente não tem estoque',
    })
    await marcarTarefa('t1', 'a_fazer')
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_tarefa', { p_tarefa: 't1', p_estado: 'a_fazer' })
  })

  it('motivo em branco ou grande demais: o texto para a pessoa, sem reler a tela', async () => {
    rpcResponde(null, { code: '22023', message: 'motivo_obrigatorio' })
    expect(await marcarTarefa('t1', 'nao_se_aplica', ' ')).toEqual({ erro: 'Conte por que esta tarefa não se aplica.' })
    rpcResponde(null, {
      code: '23514',
      message: 'new row for relation "checklist_tarefas" violates check constraint "checklist_tarefas_motivo_check"',
    })
    expect(await marcarTarefa('t1', 'nao_se_aplica', 'x'.repeat(501))).toEqual({ erro: 'O motivo vai até 500 letras.' })
  })

  it('marcarTarefa traduz as recusas', async () => {
    rpcResponde(null, { code: 'P0001', message: 'tarefa_bloqueada' })
    expect(await marcarTarefa('t1', 'feita')).toEqual({
      erro: 'Esta tarefa depende de outras que ainda não foram feitas.', desatualizado: true,
    })
    rpcResponde(null, { code: 'P0001', message: 'so_o_consultor_marca' })
    expect((await marcarTarefa('t1', 'feita')).erro).toBe('Só o consultor do cliente marca as tarefas.')
    rpcResponde(null, { code: 'P0001', message: 'estado_invalido' })
    expect(await marcarTarefa('t1', 'outra')).toEqual({ erro: 'Essa situação de tarefa não existe. Atualize a página.' })
  })

  it('recusa de tela velha (trocado, tirado, outro consultor, arquivado, sem acesso, dependência reaberta) diz para reler', async () => {
    for (const codigo of ['checklist_encerrado', 'so_o_consultor_marca', 'sem_permissao', 'cliente_arquivado', 'tarefa_bloqueada',
      'ja_nao_se_aplica']) {
      rpcResponde(null, { code: 'P0001', message: codigo })
      expect((await marcarTarefa('t1', 'feita')).desatualizado, codigo).toBe(true)
      expect((await anotarTarefa('t1', 'nota')).desatualizado, codigo).toBe(true)
    }
    // Outras falhas (rede, regra da coluna) não: a tela não ficou velha.
    rpcResponde(null, { message: 'Failed to fetch' })
    expect((await marcarTarefa('t1', 'feita')).desatualizado).toBeUndefined()
  })

  it('anotarTarefa manda a nota (o banco tira os espaços; em branco vira nula)', async () => {
    rpcResponde(null)
    expect(await anotarTarefa('t1', 'Falar com o contador')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('anotar_tarefa', { p_tarefa: 't1', p_nota: 'Falar com o contador' })
    await anotarTarefa('t1', undefined)
    expect(supabase.rpc).toHaveBeenLastCalledWith('anotar_tarefa', { p_tarefa: 't1', p_nota: null })
    rpcResponde(null, {
      code: '23514',
      message: 'new row for relation "checklist_tarefas" violates check constraint "checklist_tarefas_nota_check"',
    })
    expect(await anotarTarefa('t1', 'x'.repeat(501))).toEqual({ erro: 'A nota vai até 500 letras.' })
  })
})

describe('pausada, tempo, motivo no Editar, comentários e o histórico da tarefa', () => {
  it('marcarTarefa: pausada vai como os outros estados; a resposta traz o tempo da tarefa', async () => {
    const resultado = { estado: 'pausada', feita_em: null, liberadas: [], na_sessao: false, tempo_segundos: 600, trecho_aberto_desde: null }
    rpcResponde(resultado)
    expect(await marcarTarefa('t1', 'pausada')).toEqual({ ...resultado, erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_tarefa', { p_tarefa: 't1', p_estado: 'pausada' })
  })

  it('trocarMotivo manda a tarefa e o motivo; recusas traduzidas, tela velha relê', async () => {
    rpcResponde(null)
    expect(await trocarMotivo('t1', 'O cliente não tem estoque')).toEqual({ erro: null })
    expect(supabase.rpc).toHaveBeenCalledWith('trocar_motivo', { p_tarefa: 't1', p_motivo: 'O cliente não tem estoque' })
    rpcResponde(null, { code: '22023', message: 'motivo_obrigatorio' })
    expect(await trocarMotivo('t1', ' ')).toEqual({ erro: 'Conte por que esta tarefa não se aplica.' })
    rpcResponde(null, { code: 'P0001', message: 'so_em_nao_se_aplica' })
    expect(await trocarMotivo('t1', 'Outro')).toEqual({
      erro: 'Esta tarefa não está mais como "não se aplica". Atualize a página.', desatualizado: true,
    })
    rpcResponde(null, { code: 'P0001', message: 'so_o_consultor_marca' })
    expect((await trocarMotivo('t1', 'Outro')).desatualizado).toBe(true)
  })

  it('comentariosDaTarefa pede a página ao banco: { itens, haMais, podeComentar }; sem acesso, vazio', async () => {
    const itens = [{ id: 'c1', texto: 'Oi', pode_editar: true, pode_apagar: true, autor: { nome: 'Ana' } }]
    rpcResponde({ itens, ha_mais: true, pode_comentar: true })
    expect(await comentariosDaTarefa({ tarefaId: 't1' })).toEqual({ itens, haMais: true, podeComentar: true })
    expect(supabase.rpc).toHaveBeenCalledWith('comentarios_da_tarefa', { p_tarefa: 't1', p_antes: null, p_limite: 30 })
    await comentariosDaTarefa({ tarefaId: 't1', antesId: 'c9', limite: 10 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('comentarios_da_tarefa', { p_tarefa: 't1', p_antes: 'c9', p_limite: 10 })
    rpcResponde(null)
    expect(await comentariosDaTarefa({ tarefaId: 't2' })).toEqual({ itens: [], haMais: false, podeComentar: false })
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    await expect(comentariosDaTarefa({ tarefaId: 't1' })).rejects.toEqual({ code: 'P0001', message: 'sem_permissao' })
  })

  it('comentarTarefa e editarComentarioDaTarefa devolvem o comentário como a leitura', async () => {
    const comentario = { id: 'c1', texto: 'Falei com o contador', editado_em: null, pode_editar: true, pode_apagar: true }
    rpcResponde(comentario)
    expect(await comentarTarefa('t1', 'Falei com o contador')).toEqual({ erro: null, comentario })
    expect(supabase.rpc).toHaveBeenCalledWith('comentar_tarefa', { p_tarefa: 't1', p_texto: 'Falei com o contador' })
    rpcResponde({ ...comentario, editado_em: '2026-11-19T12:00:00Z' })
    expect((await editarComentarioDaTarefa('c1', 'Mudei')).comentario.editado_em).toBe('2026-11-19T12:00:00Z')
    expect(supabase.rpc).toHaveBeenLastCalledWith('editar_comentario', { p_comentario: 'c1', p_texto: 'Mudei' })
  })

  it('comentário em branco, grande demais, apagado ou sem permissão: o texto para a pessoa', async () => {
    rpcResponde(null, { code: '22023', message: 'comentario_vazio' })
    expect(await comentarTarefa('t1', ' ')).toEqual({ erro: 'Escreva o comentário.' })
    rpcResponde(null, {
      code: '23514',
      message: 'new row for relation "checklist_comentarios" violates check constraint "checklist_comentarios_texto_check"',
    })
    expect(await editarComentarioDaTarefa('c1', 'x'.repeat(2001))).toEqual({ erro: 'O comentário vai até 2.000 letras.' })
    rpcResponde(null, { code: 'P0001', message: 'comentario_nao_encontrado' })
    expect(await apagarComentarioDaTarefa('c1')).toEqual({
      erro: 'Este comentário foi apagado. Atualize a tarefa.', desatualizado: true,
    })
    expect(supabase.rpc).toHaveBeenLastCalledWith('apagar_comentario', { p_comentario: 'c1' })
    rpcResponde(null, { code: 'P0001', message: 'sem_permissao' })
    expect(await comentarTarefa('t1', 'Oi')).toEqual({ erro: 'Você não tem permissão para isso.', desatualizado: true })
  })

  it('historicoDaTarefa: as linhas do Histórico e os trechos de tempo; null quando a pessoa não vê', async () => {
    const lido = { eventos: [{ tipo: 'motivo_trocado', motivo: 'Outro' }], trechos: [], tempo_segundos: 0 }
    rpcResponde(lido)
    expect(await historicoDaTarefa('t1')).toEqual(lido)
    expect(supabase.rpc).toHaveBeenCalledWith('historico_da_tarefa', { p_tarefa: 't1' })
    rpcResponde(null)
    expect(await historicoDaTarefa('t2')).toBeNull()
  })
})
