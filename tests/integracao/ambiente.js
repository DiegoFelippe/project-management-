// Ajudantes dos testes de integração: falam com o Supabase local de verdade.
// Tudo que um arquivo de teste cria é apagado no limparTudo() do afterAll.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from '../../scripts/supabase-local.mjs'

export const status = lerStatusLocal()
const semSessao = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(status.API_URL, status.SECRET_KEY, semSessao)

const criados = { consultorias: new Set(), usuarios: new Set() }

export const REDIRECT = 'http://localhost:5173/definir-senha'
export const SENHA_TESTE = 'teste-1234'

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

// Usuários criados pelas funções (não pelos ajudantes) entram na limpeza pelo e-mail.
export async function registrarEmail(email) {
  const { data } = await admin.from('perfis').select('id').eq('email', email)
  for (const linha of data ?? []) criados.usuarios.add(linha.id)
}

export async function limparTudo() {
  const consultorias = [...criados.consultorias]
  if (consultorias.length) {
    await admin.from('times').delete().in('consultoria_id', consultorias)
    const { data } = await admin.from('perfis').select('id').in('consultoria_id', consultorias)
    for (const linha of data ?? []) criados.usuarios.add(linha.id)
  }
  for (const id of criados.usuarios) await admin.auth.admin.deleteUser(id)
  if (consultorias.length) await admin.from('consultorias').delete().in('id', consultorias)
  criados.consultorias.clear()
  criados.usuarios.clear()
}
