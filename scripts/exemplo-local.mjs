// Dados de exemplo só para o Supabase local: npm run exemplo:local
// Cria a "Consultoria Exemplo" com admin, gestor, duas pessoas e o time Implantação,
// e a central de exemplo (central@exemplo.test, fora de qualquer consultoria).
// Contas NOVAS entram com a senha abaixo (logins @exemplo.test); o Auth exige senha forte desde 16/11.
// Contas que já existem são puladas e não mudam: as criadas antes de 16/11 seguem com exemplo-123.
// Nunca rode isto na nuvem.
import { createClient } from '@supabase/supabase-js'
import { lerStatusLocal } from './supabase-local.mjs'

export const SENHA_EXEMPLO = 'Exemplo-123!'
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

// A central de exemplo é garantida sempre, mesmo com a Consultoria Exemplo já criada.
const CENTRAL = { email: 'central@exemplo.test', nome: 'Cora Central' }
const { data: centralExiste } = await admin.from('perfis').select('id').eq('email', CENTRAL.email).maybeSingle()
if (centralExiste) {
  console.log(`${CENTRAL.email} já existe.`)
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: CENTRAL.email,
    password: SENHA_EXEMPLO,
    email_confirm: true,
    user_metadata: { nome: CENTRAL.nome },
  })
  if (error) parar(`Não consegui criar ${CENTRAL.email}: ${error.message}`)
  const { error: erroCentral } = await admin.from('perfis').insert({
    id: data.user.id,
    consultoria_id: null,
    nome: CENTRAL.nome,
    email: CENTRAL.email,
    papel: 'central',
  })
  if (erroCentral) parar(`Não consegui criar o perfil de ${CENTRAL.email}: ${erroCentral.message}`)
  console.log(`${CENTRAL.email} criada (central), senha ${SENHA_EXEMPLO}.`)
}

const { data: jaExiste } = await admin.from('consultorias').select('id').eq('nome', NOME_CONSULTORIA).maybeSingle()
const ids = {}
let consultoria
if (jaExiste) {
  consultoria = jaExiste
  console.log(`A ${NOME_CONSULTORIA} já existe (nada foi alterado). Contas criadas antes de 16/11 seguem com a senha exemplo-123; contas novas usam ${SENHA_EXEMPLO}.`)
} else {
  consultoria = await criarConsultoria()
}
await eventosDeExemplo()
await quadroDeExemplo()
process.exit(0)

async function criarConsultoria() {
  const { data: consultoria, error: erroConsultoria } = await admin
    .from('consultorias')
    .insert({ nome: NOME_CONSULTORIA })
    .select('id')
    .single()
  if (erroConsultoria) parar(`Não consegui criar a consultoria: ${erroConsultoria.message}`)
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
  return consultoria
}

// Eventos de exemplo da agenda, SEM Google (sem Meet, sem pasta): só para ver o Calendário e a aba Agenda do cliente.
// Ids fixos + "ignorar duplicados": rodar de novo não repete nada. Só mexe nas pessoas @exemplo.test e na consultoria de exemplo.
async function eventosDeExemplo() {
  const { data: perfis, error: erroPerfis } = await admin.from('perfis').select('id, email').in('email', PESSOAS.map((p) => p.email))
  if (erroPerfis) parar(`Não consegui ler as pessoas de exemplo: ${erroPerfis.message}`)
  const porEmail = Object.fromEntries(perfis.map((p) => [p.email, p.id]))
  const ana = porEmail['ana@exemplo.test']
  const bruno = porEmail['bruno@exemplo.test']
  if (!ana || !bruno) return

  // Um cliente de exemplo para as reuniões (se já houver um na consultoria, usa ele; se não der para criar, segue sem cliente).
  let clienteId = null
  const { data: clientes } = await admin.from('clientes').select('id').eq('consultoria_id', consultoria.id).limit(1)
  if (clientes?.length) clienteId = clientes[0].id
  else {
    const { data, error } = await admin.from('clientes')
      .insert({ nome: 'Provedor Exemplo', horas_mes: 20, consultoria_id: consultoria.id, consultor_id: ana, enviado_em: new Date().toISOString() })
      .select('id').single()
    if (error) console.log(`Não consegui criar o cliente de exemplo (${error.message}); as reuniões ficam sem cliente.`)
    else clienteId = data.id
  }

  const diaEm = (dias, hora, minutos = 0) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + dias)
    d.setUTCHours(hora, minutos, 0, 0)
    return d
  }
  const evento = (n, consultor, titulo, dias, hora, duracaoMin, extra = {}) => {
    const inicio = diaEm(dias, hora)
    return {
      id: `00000000-0000-4000-8000-0000000e${String(n).padStart(4, '0')}`,
      consultoria_id: consultoria.id,
      consultor_id: consultor,
      criado_por: consultor,
      titulo,
      inicio: inicio.toISOString(),
      fim: new Date(inicio.getTime() + duracaoMin * 60_000).toISOString(),
      ...extra,
    }
  }
  const eventos = [
    evento(1, ana, 'Reunião de acompanhamento', -7, 14, 60, { cliente_id: clienteId, cor: 2 }),
    evento(2, ana, 'Kickoff do projeto', 2, 13, 90, { cliente_id: clienteId, cor: 1 }),
    evento(3, bruno, 'Revisão de processos', 4, 17, 60, { cliente_id: clienteId, cor: 3 }),
    evento(4, ana, 'Planejamento interno', 1, 12, 45, { cor: 5 }),
    evento(5, bruno, 'Estudo da base de conhecimento', -3, 15, 120, { cor: 6 }),
  ]
  const { error } = await admin.from('agenda_eventos').upsert(eventos, { onConflict: 'id', ignoreDuplicates: true })
  if (error) parar(`Não consegui criar os eventos de exemplo: ${error.message}`)
  console.log(`${eventos.length} eventos de exemplo na agenda (sem Google); rodar de novo não repete.`)
}

// Quadro (Kanban) de exemplo: só na Consultoria Exemplo, no cliente "Provedor Teste Navegador" (ou o primeiro dela).
// Reaproveita o quadro se já existir (criado ao abrir a aba) e pula o cartão cujo título já está no quadro:
// rodar de novo não muda nada. Com a chave secreta (sem pessoa logada) o banco aceita a escrita direta; posição,
// autor e datas vêm dos gatilhos.
async function quadroDeExemplo() {
  const { data: ana } = await admin.from('perfis').select('id').eq('email', 'ana@exemplo.test').maybeSingle()
  if (!ana) return
  let { data: cliente } = await admin.from('clientes').select('id, nome')
    .eq('consultoria_id', consultoria.id).eq('nome', 'Provedor Teste Navegador').maybeSingle()
  if (!cliente) {
    const { data } = await admin.from('clientes').select('id, nome').eq('consultoria_id', consultoria.id)
      .order('criado_em').limit(1)
    cliente = data?.[0]
  }
  if (!cliente) {
    console.log('Quadro de exemplo: a consultoria de exemplo não tem cliente; nada criado.')
    return
  }

  let { data: quadro } = await admin.from('quadros').select('id').eq('cliente_id', cliente.id).eq('consultoria_id', consultoria.id).maybeSingle()
  if (!quadro) {
    const { data, error } = await admin.from('quadros').insert({ cliente_id: cliente.id, consultoria_id: consultoria.id }).select('id').single()
    if (error) parar(`Não consegui criar o quadro de exemplo: ${error.message}`)
    quadro = data
  }
  const { data: existentes } = await admin.from('quadro_colunas').select('id').eq('quadro_id', quadro.id)
  if (!existentes?.length) {
    const { error } = await admin.from('quadro_colunas').insert([
      { quadro_id: quadro.id, nome: 'A fazer', posicao: 1024 },
      { quadro_id: quadro.id, nome: 'Em andamento', posicao: 2048 },
      { quadro_id: quadro.id, nome: 'Concluído', posicao: 3072, concluidos: true },
    ])
    if (error) parar(`Não consegui criar as colunas do quadro: ${error.message}`)
  }
  const { data: colunas } = await admin.from('quadro_colunas').select('id, posicao').eq('quadro_id', quadro.id).order('posicao')
  const coluna = (i) => colunas[Math.min(i, colunas.length - 1)].id

  const dia = (dias) => {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const cartoes = [
    { titulo: 'Levantar DRE do trimestre', col: 0, prioridade: 'alta', prazo: dia(-3),
      checklist: [['Exportar balancetes', true], ['Conferir contas de receita', true], ['Montar o comparativo', false]],
      comentario: 'Já tenho os balancetes de janeiro e fevereiro; falta o de março.' },
    { titulo: 'Revisar plano de contas', col: 1, prioridade: 'media', prazo: dia(3),
      checklist: [['Listar contas duplicadas', true], ['Alinhar nomes com o cliente', false]] },
    { titulo: 'Reunião de alinhamento mensal', col: 0, prioridade: 'baixa', prazo: dia(20) },
    { titulo: 'Entregar relatório de indicadores', col: 2, prioridade: 'media', prazo: dia(-10),
      checklist: [['Fechar números do mês', true], ['Enviar ao cliente', true]] },
  ]
  let criados = 0
  for (const c of cartoes) {
    const { data: ja } = await admin.from('cartoes').select('id').eq('quadro_id', quadro.id).eq('titulo', c.titulo).limit(1)
    if (ja?.length) continue
    const { data: novo, error } = await admin.from('cartoes')
      .insert({ quadro_id: quadro.id, coluna_id: coluna(c.col), titulo: c.titulo, prioridade: c.prioridade, prazo: c.prazo, criado_por: ana.id })
      .select('id').single()
    if (error) parar(`Não consegui criar o cartão "${c.titulo}": ${error.message}`)
    const { error: erroResp } = await admin.from('cartao_responsaveis').insert({ cartao_id: novo.id, perfil_id: ana.id })
    if (erroResp) parar(`Não consegui pôr a Ana no cartão "${c.titulo}": ${erroResp.message}`)
    for (const [texto, feito] of c.checklist ?? []) {
      const { error: erroItem } = await admin.from('cartao_checklist').insert({ cartao_id: novo.id, texto, feito })
      if (erroItem) parar(`Não consegui criar o item "${texto}": ${erroItem.message}`)
    }
    if (c.comentario) {
      const { error: erroCom } = await admin.from('cartao_comentarios').insert({ cartao_id: novo.id, autor_id: ana.id, texto: c.comentario })
      if (erroCom) parar(`Não consegui criar o comentário: ${erroCom.message}`)
    }
    criados += 1
  }
  console.log(criados
    ? `Quadro de exemplo (${cliente.nome}): ${criados} cartões criados.`
    : `Quadro de exemplo (${cliente.nome}): já tinha os cartões, nada foi alterado.`)
}
