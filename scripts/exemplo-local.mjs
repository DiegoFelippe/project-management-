// Dados de exemplo só para o Supabase local: npm run exemplo:local
// Cria a "Consultoria Exemplo" com admin, gestor, duas pessoas e o time Implantação.
// Todos entram com a senha abaixo (logins @exemplo.test). Nunca rode isto na nuvem.
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from './supabase-local.mjs'

export const SENHA_EXEMPLO = 'exemplo-123'
const NOME_CONSULTORIA = 'Consultoria Exemplo'
const PESSOAS = [
  { chave: 'admin', email: 'admin@exemplo.test', nome: 'Alice Admin', papel: 'admin' },
  { chave: 'gestor', email: 'gestor@exemplo.test', nome: 'Gabriel Gestor', papel: 'gestor' },
  { chave: 'ana', email: 'ana@exemplo.test', nome: 'Ana Lima', papel: 'pessoa' },
  { chave: 'bruno', email: 'bruno@exemplo.test', nome: 'Bruno Reis', papel: 'pessoa' },
]

let status
try {
  status = lerStatusLocal()
} catch (erro) {
  console.error(erro.message)
  process.exit(1)
}
const { hostname } = new URL(status.API_URL)
if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
  console.error(`Recusado: ${status.API_URL} não é o Supabase local.`)
  process.exit(1)
}

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

function parar(mensagem) {
  console.error(mensagem)
  process.exit(1)
}

const { data: jaExiste } = await admin.from('consultorias').select('id').eq('nome', NOME_CONSULTORIA).maybeSingle()
if (jaExiste) {
  console.log(`A ${NOME_CONSULTORIA} já existe. Logins @exemplo.test, senha ${SENHA_EXEMPLO}.`)
  process.exit(0)
}

const { data: consultoria, error: erroConsultoria } = await admin
  .from('consultorias')
  .insert({ nome: NOME_CONSULTORIA })
  .select('id')
  .single()
if (erroConsultoria) parar(`Não consegui criar a consultoria: ${erroConsultoria.message}`)

const ids = {}
for (const pessoa of PESSOAS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: pessoa.email,
    password: SENHA_EXEMPLO,
    email_confirm: true,
    user_metadata: { nome: pessoa.nome },
  })
  if (error) parar(`Não consegui criar ${pessoa.email} (${error.message}). Rode "npx supabase db reset" e tente de novo.`)
  ids[pessoa.chave] = data.user.id
  const { error: erroPerfil } = await admin.from('perfis').insert({
    id: data.user.id,
    consultoria_id: consultoria.id,
    nome: pessoa.nome,
    email: pessoa.email,
    papel: pessoa.papel,
    criado_por: pessoa.chave === 'admin' ? null : ids.admin,
  })
  if (erroPerfil) parar(`Não consegui criar o perfil de ${pessoa.email}: ${erroPerfil.message}`)
}

const { data: time, error: erroTime } = await admin
  .from('times')
  .insert({ consultoria_id: consultoria.id, nome: 'Implantação', gestor_id: ids.gestor, criado_por: ids.gestor })
  .select('id')
  .single()
if (erroTime) parar(`Não consegui criar o time: ${erroTime.message}`)

const { error: erroMembros } = await admin.from('time_membros').insert([
  { time_id: time.id, pessoa_id: ids.ana, adicionado_por: ids.gestor },
  { time_id: time.id, pessoa_id: ids.bruno, adicionado_por: ids.gestor },
])
if (erroMembros) parar(`Não consegui colocar as pessoas no time: ${erroMembros.message}`)

console.log(`${NOME_CONSULTORIA} criada. Entre com ${PESSOAS.map((p) => p.email).join(', ')} e a senha ${SENHA_EXEMPLO}.`)
