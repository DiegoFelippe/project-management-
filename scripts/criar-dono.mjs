// Cria o dono da plataforma: npm run dono:criar -- <email> "<nome>"
// Local: usa o Supabase do Docker. Nuvem: passe SUPABASE_URL, SUPABASE_SECRET_KEY e APP_URL no ambiente.
// O dono recebe um convite por e-mail para criar a senha; nenhuma senha passa por aqui.
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from './supabase-local.mjs'

const [emailDigitado, ...partesDoNome] = process.argv.slice(2)
const email = (emailDigitado ?? '').trim().toLowerCase()
const nome = partesDoNome.join(' ').trim()
if (!email.includes('@') || nome.length < 2) {
  console.error('Uso: npm run dono:criar -- <email> "<nome>"')
  process.exit(1)
}

let url = process.env.SUPABASE_URL
let chave = process.env.SUPABASE_SECRET_KEY
if (!url || !chave) {
  try {
    const local = lerStatusLocal()
    url = local.API_URL
    chave = local.SECRET_KEY
  } catch (erro) {
    console.error(erro.message)
    process.exit(1)
  }
}
const appUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: existente, error: erroBusca } = await admin.from('perfis').select('papel').eq('email', email).maybeSingle()
if (erroBusca) {
  console.error(`Não consegui ler os perfis: ${erroBusca.message}`)
  process.exit(1)
}
if (existente) {
  console.log(`${email} já tem acesso (${existente.papel}). Nada a fazer.`)
  process.exit(0)
}

const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${appUrl}/definir-senha`,
  data: { nome },
})
if (error) {
  console.error(`Não consegui convidar ${email}: ${error.message}`)
  process.exit(1)
}

const { error: erroPerfil } = await admin.from('perfis').insert({
  id: data.user.id,
  consultoria_id: null,
  nome,
  email,
  papel: 'dono',
  convite_pendente: true,
})
if (erroPerfil) {
  await admin.auth.admin.deleteUser(data.user.id)
  console.error(`Não consegui criar o perfil de dono: ${erroPerfil.message}`)
  process.exit(1)
}

console.log(`Convite enviado para ${email}. Abra o e-mail e crie a senha em ${appUrl}/definir-senha.`)
