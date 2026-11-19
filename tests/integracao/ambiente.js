// Ajudantes dos testes de integração: falam com o Supabase local de verdade.
// Tudo que um arquivo de teste cria é apagado no limparTudo() do afterAll.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from '../../scripts/supabase-local.mjs'
import { caminhosNaPasta } from '../../src/lib/arquivos.js'

export const status = lerStatusLocal()

// Os contêineres do Supabase local se chamam supabase_<serviço>_<project_id do supabase/config.toml>; dentro da rede
// do Docker, a Edge Function acha o Mailpit (SMTP na porta 1025) por esse nome.
const PROJETO_LOCAL = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)[1]
export const MAILPIT_SMTP = `supabase_inbucket_${PROJETO_LOCAL}`
const semSessao = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(status.API_URL, status.SECRET_KEY, semSessao)

const criados = { consultorias: new Set(), usuarios: new Set(), clientes: new Set() }

export const REDIRECT = 'http://localhost:5173/definir-senha'
export const SENHA_TESTE = 'Teste-1234!x'

export function clienteAdmin() {
  return admin
}

export function emailDeTeste(prefixo = 'teste') {
  return `${prefixo}-${randomUUID()}@exemplo.test`
}

export async function criarConsultoriaDeTeste(nome = `Teste ${randomUUID().slice(0, 8)}`) {
  const { data, error } = await admin.from('consultorias').insert({ nome }).select('id').single()
  if (error) throw error
  criados.consultorias.add(data.id)
  return data.id
}

export async function criarPerfilDeTeste({ papel, consultoriaId = null, precisaTrocar = false }) {
  const email = emailDeTeste(papel)
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA_TESTE, email_confirm: true })
  if (error) throw error
  const id = data.user.id
  criados.usuarios.add(id)
  const { error: erroPerfil } = await admin.from('perfis').insert({
    id,
    consultoria_id: consultoriaId,
    nome: `Teste ${papel}`,
    email,
    papel,
    precisa_trocar_senha: precisaTrocar,
  })
  if (erroPerfil) throw erroPerfil
  return { id, email, senha: SENHA_TESTE }
}

export async function criarTimeDeTeste({ consultoriaId, gestorId, nome = `Time ${randomUUID().slice(0, 8)}` }) {
  const { data, error } = await admin
    .from('times')
    .insert({ consultoria_id: consultoriaId, gestor_id: gestorId, nome })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function entrarComo({ email, senha }) {
  const cliente = createClient(status.API_URL, status.PUBLISHABLE_KEY, semSessao)
  const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw error
  return cliente
}

export async function chamarFuncao(cliente, nome, corpo) {
  const headers = { 'content-type': 'application/json', apikey: status.PUBLISHABLE_KEY }
  if (cliente) {
    const { data } = await cliente.auth.getSession()
    headers.authorization = `Bearer ${data.session.access_token}`
  }
  const resposta = await fetch(`${status.API_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
  })
  let corpoResposta = {}
  try {
    corpoResposta = await resposta.json()
  } catch {
    // resposta sem JSON (ex.: 404 da plataforma)
  }
  return { status: resposta.status, corpo: corpoResposta }
}

export async function emailsPara(email) {
  const consulta = encodeURIComponent(`to:"${email}"`)
  const resposta = await fetch(`${status.MAILPIT_URL}/api/v1/search?query=${consulta}`)
  const dados = await resposta.json()
  return dados.messages ?? []
}

// Consultorias criadas pelas funções entram na limpeza pelo id.
export function registrarConsultoria(id) {
  if (id) criados.consultorias.add(id)
}

// Clientes criados pelos testes entram na limpeza pelo id (os das consultorias de teste também são apagados).
export function registrarCliente(id) {
  if (id) criados.clientes.add(id)
}

// Usuários criados pelas funções (não pelos ajudantes) entram na limpeza pelo e-mail.
export async function registrarEmail(email) {
  const { data } = await admin.from('perfis').select('id').eq('email', email)
  for (const linha of data ?? []) criados.usuarios.add(linha.id)
}

// Cada passo da limpeza é conferido: um erro aqui deixava sobras de teste no banco local em silêncio.
export function conferirLimpeza(acao, { error }) {
  if (!error) return
  const codigo = error.code ?? error.status ?? 'sem código'
  throw new Error(`limparTudo: não foi possível ${acao} (${codigo}: ${error.message}). ` +
    'Os dados de teste que sobraram continuam no banco local.')
}

// O filtro in(...) do PostgREST vai na URL: com centenas de ids ela passa do limite ("URI too long", 414 já com 300
// no Supabase local). Por isso cada passo da limpeza manda os ids em lotes de 50, todos os lotes de um passo antes do
// próximo (a mesma ordem de antes). Os objetos do Storage vão no corpo do pedido, em lotes de 1000.
const LOTE = 50
const LOTE_DO_STORAGE = 1000

export function lotes(lista, tamanho = LOTE) {
  const todos = [...lista]
  const pedacos = []
  for (let inicio = 0; inicio < todos.length; inicio += tamanho) pedacos.push(todos.slice(inicio, inicio + tamanho))
  return pedacos
}

// Um passo da limpeza: `pedir(lote)` para cada lote de ids, cada resposta conferida; devolve as linhas lidas.
async function emLotes(acao, ids, pedir) {
  const linhas = []
  for (const lote of lotes(ids)) {
    const resposta = await pedir(lote)
    conferirLimpeza(acao, resposta)
    linhas.push(...(resposta.data ?? []))
  }
  return linhas
}

async function removerDoStorage(acao, balde, caminhos) {
  for (const lote of lotes(caminhos, LOTE_DO_STORAGE)) {
    conferirLimpeza(acao, await admin.storage.from(balde).remove(lote))
  }
}

// Objetos do bucket "arquivos" na pasta de cada cliente de teste, inclusive os que ficaram sem linha.
async function objetosNasPastas(clientes) {
  const caminhos = []
  for (const cliente of clientes) {
    const resposta = await caminhosNaPasta(admin.storage.from('arquivos'), cliente)
    conferirLimpeza(`listar os objetos do cliente de teste ${cliente}`, resposta)
    caminhos.push(...resposta.caminhos)
  }
  return caminhos
}

// Arquivos dos clientes e das consultorias de teste: os objetos do Storage e as linhas (as linhas seguram a
// consultoria, restrict; o objeto não sai junto com o cliente).
async function limparArquivos(clientes, consultorias) {
  const caminhos = new Set(await objetosNasPastas(clientes))
  const linhas = await emLotes('ler os arquivos das consultorias de teste', consultorias,
    (lote) => admin.from('cliente_arquivos').select('caminho').in('consultoria_id', lote))
  for (const linha of linhas) caminhos.add(linha.caminho)
  await removerDoStorage('apagar os objetos dos arquivos de teste', 'arquivos', caminhos)
  await emLotes('apagar os arquivos dos clientes de teste', clientes,
    (lote) => admin.from('cliente_arquivos').delete().in('cliente_id', lote))
  await emLotes('apagar os arquivos das consultorias de teste', consultorias,
    (lote) => admin.from('cliente_arquivos').delete().in('consultoria_id', lote))
  // As pastas seguram a consultoria (restrict); as dos clientes de teste saem com o cliente.
  await emLotes('apagar as pastas das consultorias de teste', consultorias,
    (lote) => admin.from('cliente_pastas').delete().in('consultoria_id', lote))
}

// Objetos do balde "quadros" numa pasta e nas subpastas (cartões e imagens): a pasta de um cliente de teste.
async function objetosDoQuadro(pasta) {
  const caminhos = []
  for (let inicio = 0; ; inicio += 1000) {
    const resposta = await admin.storage.from('quadros').list(pasta, { limit: 1000, offset: inicio })
    conferirLimpeza(`listar os objetos do quadro em ${pasta}`, resposta)
    for (const item of resposta.data) {
      if (item.id) caminhos.push(`${pasta}/${item.name}`)
      else caminhos.push(...await objetosDoQuadro(`${pasta}/${item.name}`))
    }
    if (resposta.data.length < 1000) return caminhos
  }
}

// Quadros dos clientes, das consultorias e das pessoas de teste. Os cartões seguram as colunas (restrict, e por elas o
// cliente) e saem antes; checklist, comentários, responsáveis e anexos saem com o cartão, e as colunas com o quadro (os
// quadros seguram o time e a pessoa: saem antes deles). Depois das linhas, os objetos do balde "quadros" na pasta de
// cada cliente de teste e na de cada quadro pessoal ou de time de teste (quadro/<id>: anexos, imagens e o que ficou sem
// linha).
async function limparQuadros(clientes, consultorias) {
  const pastas = await limparQuadrosDoBanco(clientes, consultorias)
  const caminhos = []
  // Só as pastas dos clientes e dos quadros de teste (nunca a raiz do balde nem a pasta "quadro", que têm as de todos).
  for (const pasta of [...clientes.filter(Boolean), ...pastas]) caminhos.push(...await objetosDoQuadro(pasta))
  await removerDoStorage('apagar os objetos dos quadros de teste', 'quadros', caminhos)
}

// Apaga os quadros de teste; devolve as pastas no balde dos que não são de cliente (quadro/<id>).
async function limparQuadrosDoBanco(clientes, consultorias) {
  const quadros = new Map()
  const juntar = (linhas) => {
    for (const linha of linhas) quadros.set(linha.id, linha.tipo)
  }
  juntar(await emLotes('ler os quadros dos clientes de teste', clientes,
    (lote) => admin.from('quadros').select('id, tipo').in('cliente_id', lote)))
  juntar(await emLotes('ler os quadros das consultorias de teste', consultorias,
    (lote) => admin.from('quadros').select('id, tipo').in('consultoria_id', lote)))
  // Os quadros pessoais da central e do dono (de teste) não têm consultoria.
  juntar(await emLotes('ler os quadros pessoais das pessoas de teste', criados.usuarios,
    (lote) => admin.from('quadros').select('id, tipo').in('pessoa_id', lote)))
  if (!quadros.size) return []
  await emLotes('apagar os cartões dos quadros de teste', quadros.keys(),
    (lote) => admin.from('cartoes').delete().in('quadro_id', lote))
  await emLotes('apagar os quadros de teste', quadros.keys(), (lote) => admin.from('quadros').delete().in('id', lote))
  return [...quadros].filter(([, tipo]) => tipo !== 'cliente').map(([id]) => `quadro/${id}`)
}

// Modelos de check-in das consultorias de teste (seguram a consultoria, restrict) e os que as pessoas de teste criaram
// (os da Central para todas não têm consultoria). Etapas, tarefas e dependências saem junto. Antes de apagar as pessoas:
// depois, quem criou fica nulo e o modelo não seria mais achado.
async function limparModelos(consultorias) {
  await emLotes('apagar os modelos das consultorias de teste', consultorias,
    (lote) => admin.from('modelos').delete().in('consultoria_id', lote))
  await emLotes('apagar os modelos das pessoas de teste', criados.usuarios,
    (lote) => admin.from('modelos').delete().in('criado_por', lote))
}

// Check-lists dos clientes e das consultorias de teste: seguram o cliente e a consultoria (restrict), e o modelo com
// check-list ativo não se apaga. Saem antes dos clientes e dos modelos; etapas, tarefas, dependências e as tarefas
// marcadas nos check-ins saem junto.
async function limparChecklists(clientes, consultorias) {
  await emLotes('apagar os check-lists dos clientes de teste', clientes,
    (lote) => admin.from('cliente_checklists').delete().in('cliente_id', lote))
  await emLotes('apagar os check-lists das consultorias de teste', consultorias,
    (lote) => admin.from('cliente_checklists').delete().in('consultoria_id', lote))
}

export async function limparTudo() {
  const consultorias = [...criados.consultorias]
  // Arquivos, check-lists, check-ins, quadros e clientes seguram consultorias e clientes (restrict): saem antes.
  const clientes = new Set(criados.clientes)
  const dasConsultorias = await emLotes('ler os clientes das consultorias de teste', consultorias,
    (lote) => admin.from('clientes').select('id').in('consultoria_id', lote))
  for (const linha of dasConsultorias) clientes.add(linha.id)
  await limparQuadros([...clientes], consultorias)
  await limparArquivos([...clientes], consultorias)
  await limparChecklists([...clientes], consultorias)
  // Eventos da agenda seguram consultoria e consultor (restrict); os participantes saem com o evento.
  await emLotes('apagar os eventos da agenda das consultorias de teste', consultorias,
    (lote) => admin.from('agenda_eventos').delete().in('consultoria_id', lote))
  await emLotes('apagar os check-ins dos clientes de teste', clientes,
    (lote) => admin.from('checkins').delete().in('cliente_id', lote))
  await emLotes('apagar os check-ins das consultorias de teste', consultorias,
    (lote) => admin.from('checkins').delete().in('consultoria_id', lote))
  await emLotes('apagar os clientes de teste', clientes, (lote) => admin.from('clientes').delete().in('id', lote))
  await emLotes('apagar os times das consultorias de teste', consultorias,
    (lote) => admin.from('times').delete().in('consultoria_id', lote))
  const pessoas = await emLotes('ler as pessoas das consultorias de teste', consultorias,
    (lote) => admin.from('perfis').select('id').in('consultoria_id', lote))
  for (const linha of pessoas) criados.usuarios.add(linha.id)
  await limparModelos(consultorias)
  for (const id of criados.usuarios) {
    const resposta = await admin.auth.admin.deleteUser(id)
    // Usuário que já não existe é o que se queria.
    if (resposta.error?.status !== 404) conferirLimpeza(`apagar o usuário de teste ${id}`, resposta)
  }
  await emLotes('apagar as consultorias de teste', consultorias,
    (lote) => admin.from('consultorias').delete().in('id', lote))
  criados.consultorias.clear()
  criados.usuarios.clear()
  criados.clientes.clear()
}
