// Quadro Kanban do cliente. O banco decide quem vê e quem mexe (as regras das tabelas e as funções do quadro, migrações
// 20261117112951_quadro.sql e 20261117125011_quadro_anexos.sql); aqui só se chama e traduz. Leituras devolvem os dados
// ({ itens, total } nas listas) e sobem o erro do banco; escritas devolvem { erro } (o texto para a pessoa, ou null) e,
// quando criam algo, o que foi criado. Anexos e imagens da descrição ficam no balde privado "quadros", na pasta do
// cliente e do cartão; a linha (ou o cartão) sai primeiro e o objeto depois, e o que não sair vira um aviso.
import {
  caminhoDaImagem,
  caminhoDoAnexo,
  nomeParaMostrar,
  TAMANHO_MAXIMO_ARQUIVO,
  TIPOS_DE_IMAGEM,
} from '@/lib/arquivos'
import { ARQUIVO_GRANDE_DEMAIS, traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

// Tamanhos de página das funções do banco: cartões por coluna ("ver mais"), a janela de arquivados (Tabela), os
// comentários ("ver anteriores") e os anexos do cartão.
export const CARTOES_POR_PAGINA = 50
export const ARQUIVADOS_POR_PAGINA = 15
export const COMENTARIOS_POR_VEZ = 30
export const ANEXOS_POR_PAGINA = 15

const BALDE = 'quadros'
// O Storage tira até 1000 objetos por pedido (e o banco devolve até 1000 por vez para a limpeza do cliente).
const POR_PEDIDO_NO_STORAGE = 1000
// Link assinado: baixar o anexo (curto) e mostrar a imagem da descrição (a janela fica aberta enquanto se edita).
const VALIDADE_DO_DOWNLOAD = 60
const VALIDADE_DA_IMAGEM = 3600

const SEM_PERMISSAO = traduzirErroBanco({ code: '42501' })
const OBJETOS_FICARAM = 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.'
const ANEXO_FICOU = 'O anexo saiu do cartão, mas a cópia guardada não foi apagada. Avise o suporte.'
const IMAGEM_DE_TIPO_ERRADO = 'Envie uma imagem PNG, JPG, GIF ou WEBP.'

const comErro = (error) => ({ erro: traduzirErroBanco(error) })
// Erros do envio e do link: os do Storage (403, 404, 413) e os do banco.
const traduzirArquivo = (error) => traduzirErroBanco(error, { sobre: 'arquivo' })
const balde = () => supabase.storage.from(BALDE)

// Tira do balde os objetos (depois que a linha ou o cartão saiu), em lotes de 1000: true quando todos saíram.
async function tirarDoBalde(caminhos) {
  for (let inicio = 0; inicio < caminhos.length; inicio += POR_PEDIDO_NO_STORAGE) {
    const lote = caminhos.slice(inicio, inicio + POR_PEDIDO_NO_STORAGE)
    const { data, error } = await balde().remove(lote)
    if (error || (data?.length ?? 0) < lote.length) return false
  }
  return true
}

// Escrita direta pela API com .select(...): nenhuma linha de volta = a regra do banco recusou (ou o item já sumiu).
function resultadoDaEscrita({ data, error }) {
  if (error) return comErro(error)
  if (!data?.length) return { erro: SEM_PERMISSAO }
  return { erro: null }
}

async function ler(funcao, parametros) {
  const { data, error } = await supabase.rpc(funcao, parametros)
  if (error) throw error
  return data
}

// Filtros da barra do quadro, como as funções do banco recebem: busca (título e descrição, sem acento), prioridade
// ('baixa' | 'media' | 'alta'), responsavel ('sem' ou o id da pessoa) e prazo ('atrasados' | 'proximos_7_dias' |
// 'sem_prazo'). Vazio = sem filtro.
function parametrosDosFiltros({ busca, prioridade, responsavel, prazo } = {}) {
  return {
    p_busca: busca?.trim() || null,
    p_prioridade: prioridade || null,
    p_responsavel: responsavel || null,
    p_prazo: prazo || null,
  }
}

// Só os campos que vieram (undefined = não muda); textos sem os espaços das pontas. Nos campos opcionais (`opcionais`),
// texto vazio vira nulo (o prazo apagado, a prioridade tirada, a cor automática); nos obrigatórios (título, nome) o
// vazio vai como veio e o banco recusa.
function soOsCampos(campos, permitidos, opcionais = []) {
  const saida = {}
  for (const nome of permitidos) {
    if (campos?.[nome] === undefined) continue
    const valor = typeof campos[nome] === 'string' ? campos[nome].trim() : campos[nome]
    saida[nome] = valor === '' && opcionais.includes(nome) ? null : valor
  }
  return saida
}

// Update direto pela API só com os campos que vieram; sem nenhum, não manda nada (update vazio) e não há o que mudar.
async function atualizar(tabela, id, campos) {
  if (!Object.keys(campos).length) return { erro: null }
  return resultadoDaEscrita(await supabase.from(tabela).update(campos).eq('id', id).select('id'))
}

// ── Leituras ─────────────────────────────────────────────────────────────────

// O quadro do cliente na consultoria que o atende: { id, cliente_id, consultoria_id, criado_em, pode_mexer, pode_gerir,
// colunas: [{ id, nome, cor, concluidos, posicao, cartoes, arquivados }] }. Na primeira vez, quem mexe cria o quadro
// com "A fazer", "Em andamento" e "Concluído". null quando a pessoa não vê o cliente ou só lê e ainda não há quadro.
export async function quadroDoCliente(clienteId) {
  if (!clienteId) return null
  return (await ler('quadro_do_cliente', { p_cliente: clienteId })) ?? null
}

// Uma página (50) dos cartões não arquivados de uma coluna, com os filtros: { itens, total }. Cada item traz
// responsaveis [{ id, nome, foto, cor }], checklist { total, feitos }, comentarios (quantos), autor { id, nome } e o
// resumo da descrição.
export async function cartoesDoQuadro({ quadroId, colunaId, pagina = 1, ...filtros } = {}) {
  const data = await ler('cartoes_do_quadro', {
    p_quadro: quadroId,
    p_coluna: colunaId,
    p_pagina: pagina,
    ...parametrosDosFiltros(filtros),
  })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Os 4 números do topo com os mesmos filtros: { cartoes, atrasados, vencem_em_7_dias, sem_responsavel }.
export async function indicadoresDoQuadro({ quadroId, ...filtros } = {}) {
  const data = await ler('indicadores_do_quadro', { p_quadro: quadroId, ...parametrosDosFiltros(filtros) })
  return { cartoes: 0, atrasados: 0, vencem_em_7_dias: 0, sem_responsavel: 0, ...data }
}

// Arquivados do quadro (mais recentes primeiro), 15 por página, com busca: { itens, total }. Cada item: { id, titulo,
// prioridade, prazo, arquivado_em, criado_em, coluna: { id, nome } }.
export async function cartoesArquivados({ quadroId, busca, pagina = 1 } = {}) {
  const data = await ler('cartoes_arquivados', { p_quadro: quadroId, p_busca: busca?.trim() || null, p_pagina: pagina })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Quem pode ser responsável (o consultor do cliente e a gestão da consultoria, ativos), pelo nome (busca no banco):
// { itens: [{ id, nome, foto, cor }], total } (total = os que vieram).
export async function pessoasDoQuadro({ quadroId, termo = '', limite = 50 } = {}) {
  if (!quadroId) return { itens: [], total: 0 }
  const itens = (await ler('pessoas_do_quadro', { p_quadro: quadroId, p_busca: termo?.trim() || null, p_limite: limite })) ?? []
  return { itens, total: itens.length }
}

// O cartão inteiro para a janela: campos, descricao (JSON do editor), coluna, criado_por, responsaveis, checklist,
// comentarios (quantos), pode_mexer e pode_apagar. null quando não existe ou a pessoa não o vê.
export async function buscarCartao(id) {
  if (!id) return null
  return (await ler('cartao_do_quadro', { p_cartao: id })) ?? null
}

// Comentários do cartão, mais recentes primeiro, 30 por vez: { itens, haMais }. "Ver anteriores": antesId = o id do
// mais antigo já mostrado. Cada item: { id, texto, criado_em, editado_em, autor: { id, nome, foto, cor } }.
export async function comentariosDoCartao({ cartaoId, antesId = null, limite = COMENTARIOS_POR_VEZ } = {}) {
  const data = await ler('comentarios_do_cartao', { p_cartao: cartaoId, p_antes: antesId, p_limite: limite })
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// ── Mover e apagar coluna (funções do banco) ─────────────────────────────────

// Põe o cartão na coluna, logo depois de antesId (o cartão de cima) ou logo antes de depoisId (o de baixo); sem os
// dois, no fim. O banco calcula a posição com o que está gravado: { erro, cartao: { id, coluna_id, posicao },
// renumerou } (renumerou: recarregar a coluna, as posições dela mudaram).
export async function moverCartao({ cartaoId, colunaId, antesId = null, depoisId = null }) {
  const { data, error } = await supabase.rpc('mover_cartao', {
    p_cartao: cartaoId,
    p_coluna: colunaId,
    p_antes: antesId,
    p_depois: depoisId,
  })
  if (error) return comErro(error)
  const { renumerou, ...cartao } = data
  return { erro: null, cartao, renumerou: Boolean(renumerou) }
}

// Reordena as colunas: antesId = a coluna à esquerda, depoisId = a da direita. { erro, coluna: { id, posicao },
// renumerou }.
export async function moverColuna({ colunaId, antesId = null, depoisId = null }) {
  const { data, error } = await supabase.rpc('mover_coluna', { p_coluna: colunaId, p_antes: antesId, p_depois: depoisId })
  if (error) return comErro(error)
  const { renumerou, ...coluna } = data
  return { erro: null, coluna, renumerou: Boolean(renumerou) }
}

// Apaga a coluna (só a gestão). Com cartões, a escolha é explícita: destinoId (os cartões, arquivados também, vão
// para o fim dessa coluna) ou apagarCartoes (somem junto, com checklist, comentários e anexos); sem nenhum dos dois o
// banco recusa. Com os cartões junto, os anexos e as imagens deles saem do balde depois (o banco devolve os caminhos).
// { erro, movidos, apagados, idsApagados } e `aviso` quando algum objeto não saiu (a coluna continua apagada).
export async function apagarColuna(colunaId, { destinoId = null, apagarCartoes = false } = {}) {
  const { data, error } = await supabase.rpc('apagar_coluna', {
    p_coluna: colunaId,
    p_destino: destinoId,
    p_apagar_cartoes: apagarCartoes,
  })
  if (error) return comErro(error)
  const resultado = { erro: null, movidos: data.movidos, apagados: data.apagados, idsApagados: data.ids_apagados ?? [] }
  if (!(await tirarDoBalde(data.caminhos ?? []))) return { ...resultado, aviso: OBJETOS_FICARAM }
  return resultado
}

// ── Cartões (escrita direta; o banco confere quem pode) ──────────────────────

const CAMPOS_DO_CARTAO = ['titulo', 'descricao', 'prioridade', 'prazo']
const OPCIONAIS_DO_CARTAO = ['descricao', 'prioridade', 'prazo']

// Cartão novo no fim da coluna: { erro, cartao: { id } }. Os responsáveis entram em seguida; se o banco recusar algum,
// o cartão já existe e volta junto com o erro (a janela abre nele para corrigir).
export async function criarCartao({ colunaId, titulo, descricao, prioridade, prazo, responsaveis = [] }) {
  const { data, error } = await supabase
    .from('cartoes')
    .insert({
      coluna_id: colunaId,
      titulo: titulo?.trim(),
      descricao: descricao ?? null,
      prioridade: prioridade || null,
      prazo: prazo || null,
    })
    .select('id')
    .single()
  if (error) return comErro(error)
  const cartao = { id: data.id }
  if (responsaveis.length) {
    const { error: erroResponsaveis } = await supabase
      .from('cartao_responsaveis')
      .insert(responsaveis.map((perfilId) => ({ cartao_id: cartao.id, perfil_id: perfilId })))
    if (erroResponsaveis) return { ...comErro(erroResponsaveis), cartao }
  }
  return { erro: null, cartao }
}

// Edita título, descrição (JSON do editor), prioridade e prazo; só o que vier ('' nos opcionais = limpar). A coluna
// muda por moverCartao. O banco confere a descrição (link só http/https/mailto, imagem só deste cartão no balde).
export async function editarCartao(id, campos) {
  return atualizar('cartoes', id, soOsCampos(campos, CAMPOS_DO_CARTAO, OPCIONAIS_DO_CARTAO))
}

// Arquivar some do quadro (a hora gravada é a do banco); restaurar volta ao mesmo lugar.
export async function arquivarCartao(id) {
  return resultadoDaEscrita(
    await supabase.from('cartoes').update({ arquivado_em: new Date().toISOString() }).eq('id', id).select('id'),
  )
}

export async function restaurarCartao(id) {
  return resultadoDaEscrita(await supabase.from('cartoes').update({ arquivado_em: null }).eq('id', id).select('id'))
}

// Apagar: quem criou ou a gestão. Checklist, comentários, responsáveis e anexos somem junto; depois, os anexos e as
// imagens da descrição saem do balde (o banco devolve os caminhos). { erro } e `aviso` quando algum objeto não saiu
// (o cartão continua apagado).
export async function apagarCartao(id) {
  const { data, error } = await supabase.rpc('apagar_cartao', { p_cartao: id })
  if (error) return comErro(error)
  if (!(await tirarDoBalde(data?.caminhos ?? []))) return { erro: null, aviso: OBJETOS_FICARAM }
  return { erro: null }
}

export async function adicionarResponsavel(cartaoId, perfilId) {
  const { error } = await supabase.from('cartao_responsaveis').insert({ cartao_id: cartaoId, perfil_id: perfilId })
  return error ? comErro(error) : { erro: null }
}

export async function tirarResponsavel(cartaoId, perfilId) {
  return resultadoDaEscrita(
    await supabase
      .from('cartao_responsaveis')
      .delete()
      .eq('cartao_id', cartaoId)
      .eq('perfil_id', perfilId)
      .select('cartao_id'),
  )
}

// ── Colunas ──────────────────────────────────────────────────────────────────

const CAMPOS_DA_COLUNA = ['nome', 'cor', 'concluidos']
const OPCIONAIS_DA_COLUNA = ['cor']

// Coluna nova no fim do quadro: { erro, coluna: { id, nome, cor, concluidos, posicao } }. cor: 0 a 9 ou null
// (automática).
export async function criarColuna({ quadroId, nome, cor = null, concluidos = false }) {
  const { data, error } = await supabase
    .from('quadro_colunas')
    .insert({ quadro_id: quadroId, nome: nome?.trim(), cor, concluidos })
    .select('id, nome, cor, concluidos, posicao')
    .single()
  return error ? comErro(error) : { erro: null, coluna: data }
}

// Renomeia, pinta ou marca/desmarca como coluna de concluídos; só o que vier (cor '' = automática). A ordem muda por
// moverColuna.
export async function editarColuna(id, campos) {
  return atualizar('quadro_colunas', id, soOsCampos(campos, CAMPOS_DA_COLUNA, OPCIONAIS_DA_COLUNA))
}

// ── Checklist ────────────────────────────────────────────────────────────────

// Item novo no fim do checklist: { erro, item: { id, texto, feito, posicao } }.
export async function criarItemDoChecklist(cartaoId, texto) {
  const { data, error } = await supabase
    .from('cartao_checklist')
    .insert({ cartao_id: cartaoId, texto: texto?.trim() })
    .select('id, texto, feito, posicao')
    .single()
  return error ? comErro(error) : { erro: null, item: data }
}

export async function editarItemDoChecklist(id, campos) {
  return resultadoDaEscrita(
    await supabase.from('cartao_checklist').update(soOsCampos(campos, ['texto', 'feito'])).eq('id', id).select('id'),
  )
}

export async function apagarItemDoChecklist(id) {
  return resultadoDaEscrita(await supabase.from('cartao_checklist').delete().eq('id', id).select('id'))
}

// ── Comentários ──────────────────────────────────────────────────────────────

// Comenta (texto simples, até 2000): { erro, comentario: { id, texto, criado_em, editado_em, autor_id } }.
export async function comentar(cartaoId, texto) {
  const { data, error } = await supabase
    .from('cartao_comentarios')
    .insert({ cartao_id: cartaoId, texto: texto?.trim() })
    .select('id, texto, criado_em, editado_em, autor_id')
    .single()
  return error ? comErro(error) : { erro: null, comentario: data }
}

// Só o próprio comentário (o banco marca "editado").
export async function editarComentario(id, texto) {
  return resultadoDaEscrita(
    await supabase.from('cartao_comentarios').update({ texto: texto?.trim() }).eq('id', id).select('id'),
  )
}

// O próprio, ou qualquer um pela gestão.
export async function apagarComentario(id) {
  return resultadoDaEscrita(await supabase.from('cartao_comentarios').delete().eq('id', id).select('id'))
}

// ── Anexos e imagens da descrição (balde "quadros") ─────────────────────────

// Os anexos do cartão, mais recentes primeiro, 15 por página: { itens, total }. Cada item: { id, nome, tamanho, tipo,
// caminho, enviado_em, enviado_por: { id, nome, foto, cor }, pode_apagar }. Quem não vê o cartão recebe a lista vazia.
export async function anexosDoCartao({ cartaoId, pagina = 1 } = {}) {
  const data = await ler('anexos_do_cartao', { p_cartao: cartaoId, p_pagina: pagina })
  return { itens: data?.itens ?? [], total: data?.total ?? 0 }
}

// Anexa um arquivo (até 25 MB, qualquer tipo): sobe o objeto na pasta do cartão e depois grava a linha; se a linha não
// grava, tira o objeto que subiu. { erro, anexo: { id, nome, tamanho, tipo, caminho, enviado_em, enviado_por } }.
export async function enviarAnexo({ clienteId, cartaoId }, arquivo) {
  if (!arquivo?.size) return { erro: 'O arquivo está vazio.' }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return { erro: ARQUIVO_GRANDE_DEMAIS }
  // O nome que aparece (sem espaços nas pontas) também dá o nome no Storage.
  const nome = nomeParaMostrar(arquivo.name)
  const caminho = caminhoDoAnexo(clienteId, cartaoId, nome)
  const tipo = arquivo.type || null
  const { error } = await balde().upload(caminho, arquivo, { contentType: tipo ?? 'application/octet-stream' })
  if (error) return { erro: traduzirArquivo(error) }
  const { data, error: erroLinha } = await supabase
    .from('cartao_anexos')
    .insert({ cartao_id: cartaoId, caminho, nome, tamanho: arquivo.size, tipo })
    .select('id, nome, tamanho, tipo, caminho, enviado_em, enviado_por')
    .single()
  if (erroLinha) {
    await balde().remove([caminho])
    return { erro: traduzirArquivo(erroLinha) }
  }
  return { erro: null, anexo: data }
}

// Apaga a linha (quem enviou ou a gestão; o banco decide) e depois o objeto. Se o objeto não sair, o anexo continua
// apagado (some da lista e ninguém mais o baixa) e vem um aviso. Anexo não se edita: apague e envie de novo.
export async function apagarAnexo(anexo) {
  const { data, error } = await supabase.from('cartao_anexos').delete().eq('id', anexo.id).select('caminho')
  if (error) return { erro: traduzirArquivo(error) }
  if (!data?.length) return { erro: SEM_PERMISSAO }
  const { data: tirados, error: erroObjeto } = await balde().remove([data[0].caminho])
  if (erroObjeto || !tirados?.length) return { erro: null, aviso: ANEXO_FICOU }
  return { erro: null }
}

// Sobe a imagem colada ou escolhida na descrição (PNG, JPG, GIF ou WEBP, até 25 MB) na pasta de imagens do cartão:
// { erro, caminho }. O nó "image" guarda o caminho (o banco recusa outro src); a tela mostra pela urlAssinada.
export async function enviarImagemDaDescricao({ clienteId, cartaoId }, arquivo) {
  if (!TIPOS_DE_IMAGEM[arquivo?.type]) return { erro: IMAGEM_DE_TIPO_ERRADO }
  if (!arquivo.size) return { erro: 'O arquivo está vazio.' }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return { erro: ARQUIVO_GRANDE_DEMAIS }
  const caminho = caminhoDaImagem(clienteId, cartaoId, arquivo.type)
  const { error } = await balde().upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: traduzirArquivo(error) }
  return { erro: null, caminho }
}

// Link temporário de um objeto do balde: com `nome`, baixa o anexo com o nome original (60 s); sem, mostra a imagem da
// descrição (1 h). { url } ou { erro } (quem não vê o cartão não recebe link).
export async function urlAssinada(caminho, { nome } = {}) {
  const { data, error } = nome
    ? await balde().createSignedUrl(caminho, VALIDADE_DO_DOWNLOAD, { download: nome })
    : await balde().createSignedUrl(caminho, VALIDADE_DA_IMAGEM)
  if (error) return { erro: traduzirArquivo(error) }
  return { url: data.signedUrl }
}

// Links das imagens de uma descrição num pedido só (1 h): { urls: { [caminho]: url } }; a que a pessoa não vê fica de
// fora.
export async function urlsAssinadas(caminhos) {
  if (!caminhos?.length) return { urls: {} }
  const { data, error } = await balde().createSignedUrls(caminhos, VALIDADE_DA_IMAGEM)
  if (error) return { erro: traduzirArquivo(error), urls: {} }
  const urls = {}
  for (const item of data ?? []) if (item.signedUrl && !item.error) urls[item.path] = item.signedUrl
  return { urls }
}

// Logo depois de apagar o cliente (o quadro vazio sai junto; os cartões já tinham saído): tira da pasta dele no balde o
// que sobrou de cartões apagados (quando tirar falhou). O banco diz o que tirar, 1000 por vez, só para a central (é ela
// quem apaga o cliente; os outros recebem sem_permissao). { erro }.
export async function limparQuadroDoCliente(clienteId) {
  if (!clienteId) return { erro: null }
  for (;;) {
    const { data, error } = await supabase.rpc('objetos_para_tirar_do_quadro', { p_cliente: clienteId })
    if (error) return { erro: OBJETOS_FICARAM }
    const caminhos = data ?? []
    if (!caminhos.length) return { erro: null }
    if (!(await tirarDoBalde(caminhos))) return { erro: OBJETOS_FICARAM }
    if (caminhos.length < POR_PEDIDO_NO_STORAGE) return { erro: null }
  }
}
