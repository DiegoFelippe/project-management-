// Ajudantes dos testes de integração: falam com o Supabase local de verdade.
// Tudo que um arquivo de teste cria é apagado no limparTudo() do afterAll.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from '../../scripts/supabase-local.mjs'
import { caminhosNaPasta } from '../../src/lib/arquivos.js'

export const status = lerStatusLocal()
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
  if (consultorias.length) {
    const resposta = await admin.from('cliente_arquivos').select('caminho').in('consultoria_id', consultorias)
    conferirLimpeza('ler os arquivos das consultorias de teste', resposta)
    for (const linha of resposta.data ?? []) caminhos.add(linha.caminho)
  }
  if (caminhos.size) {
    conferirLimpeza('apagar os objetos dos arquivos de teste', await admin.storage.from('arquivos').remove([...caminhos]))
  }
  if (clientes.length) {
    conferirLimpeza('apagar os arquivos dos clientes de teste',
      await admin.from('cliente_arquivos').delete().in('cliente_id', clientes))
  }
  if (consultorias.length) {
    conferirLimpeza('apagar os arquivos das consultorias de teste',
      await admin.from('cliente_arquivos').delete().in('consultoria_id', consultorias))
    // As pastas seguram a consultoria (restrict); as dos clientes de teste saem com o cliente.
    conferirLimpeza('apagar as pastas das consultorias de teste',
      await admin.from('cliente_pastas').delete().in('consultoria_id', consultorias))
  }
}

export async function limparTudo() {
  const consultorias = [...criados.consultorias]
  // Arquivos, check-ins e clientes seguram consultorias e clientes (restrict): saem antes.
  const clientes = new Set(criados.clientes)
  if (consultorias.length) {
    const resposta = await admin.from('clientes').select('id').in('consultoria_id', consultorias)
    conferirLimpeza('ler os clientes das consultorias de teste', resposta)
    for (const linha of resposta.data ?? []) clientes.add(linha.id)
  }
  await limparArquivos([...clientes], consultorias)
  if (clientes.size) {
    conferirLimpeza('apagar os check-ins dos clientes de teste',
      await admin.from('checkins').delete().in('cliente_id', [...clientes]))
  }
  if (consultorias.length) {
    conferirLimpeza('apagar os check-ins das consultorias de teste',
      await admin.from('checkins').delete().in('consultoria_id', consultorias))
  }
  if (clientes.size) {
    conferirLimpeza('apagar os clientes de teste', await admin.from('clientes').delete().in('id', [...clientes]))
  }
  if (consultorias.length) {
    conferirLimpeza('apagar os times das consultorias de teste',
      await admin.from('times').delete().in('consultoria_id', consultorias))
    const resposta = await admin.from('perfis').select('id').in('consultoria_id', consultorias)
    conferirLimpeza('ler as pessoas das consultorias de teste', resposta)
    for (const linha of resposta.data ?? []) criados.usuarios.add(linha.id)
  }
  for (const id of criados.usuarios) {
    const resposta = await admin.auth.admin.deleteUser(id)
    // Usuário que já não existe é o que se queria.
    if (resposta.error?.status !== 404) conferirLimpeza(`apagar o usuário de teste ${id}`, resposta)
  }
  if (consultorias.length) {
    conferirLimpeza('apagar as consultorias de teste', await admin.from('consultorias').delete().in('id', consultorias))
  }
  criados.consultorias.clear()
  criados.usuarios.clear()
  criados.clientes.clear()
}
