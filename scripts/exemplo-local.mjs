// Dados de exemplo só para o Supabase local: npm run exemplo:local
// Cria a "Consultoria Exemplo" com admin, gestor, duas pessoas e o time Implantação,
// e a central de exemplo (central@exemplo.test, fora de qualquer consultoria).
// Depois: eventos na agenda, o quadro de um cliente, um quadro pessoal da Ana e um do time Implantação (menu Quadros) e os
// modelos de check-in (com um check-list num cliente), só na Consultoria Exemplo.
// Com --historico (npm run exemplo:local -- --historico): check-ins fechados nos últimos 6 meses, para os gráficos do Início.
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
await quadrosDoMenuDeExemplo()
await checklistsDeExemplo()
if (process.argv.includes('--historico')) await historicoDeExemplo()
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
// rodar de novo não muda nada. Com a chave secreta (sem pessoa logada) o banco aceita a escrita direta; posição e
// datas vêm dos gatilhos. Autor e responsável são o consultor do cliente (o banco só aceita como responsável quem
// enxerga o cliente; a Ana só é consultora do "Provedor Teste Navegador"); sem consultor ativo, a Ana escreve e os
// cartões ficam sem responsável.
async function quadroDeExemplo() {
  const { data: ana } = await admin.from('perfis').select('id').eq('email', 'ana@exemplo.test').maybeSingle()
  if (!ana) return
  let { data: cliente } = await admin.from('clientes').select('id, nome, consultor_id')
    .eq('consultoria_id', consultoria.id).eq('nome', 'Provedor Teste Navegador').maybeSingle()
  if (!cliente) {
    const { data } = await admin.from('clientes').select('id, nome, consultor_id').eq('consultoria_id', consultoria.id)
      .order('criado_em').limit(1)
    cliente = data?.[0]
  }
  if (!cliente) {
    console.log('Quadro de exemplo: a consultoria de exemplo não tem cliente; nada criado.')
    return
  }
  const { data: consultor } = cliente.consultor_id
    ? await admin.from('perfis').select('id').eq('id', cliente.consultor_id).eq('ativo', true).maybeSingle()
    : { data: null }
  const autor = consultor?.id ?? ana.id

  let { data: quadro } = await admin.from('quadros').select('id').eq('cliente_id', cliente.id).eq('consultoria_id', consultoria.id).maybeSingle()
  if (!quadro) {
    const { data, error } = await admin.from('quadros').insert({ cliente_id: cliente.id, consultoria_id: consultoria.id }).select('id').single()
    if (error) parar(`Não consegui criar o quadro de exemplo: ${error.message}`)
    quadro = data
  }
  const { data: existentes } = await admin.from('quadro_colunas').select('id').eq('quadro_id', quadro.id)
  if (!existentes?.length) {
    const { error } = await admin.from('quadro_colunas').insert([
      { quadro_id: quadro.id, nome: 'A fazer', posicao: 1024, concluidos: false },
      { quadro_id: quadro.id, nome: 'Em andamento', posicao: 2048, concluidos: false },
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
      .insert({ quadro_id: quadro.id, coluna_id: coluna(c.col), titulo: c.titulo, prioridade: c.prioridade, prazo: c.prazo, criado_por: autor })
      .select('id').single()
    if (error) parar(`Não consegui criar o cartão "${c.titulo}": ${error.message}`)
    if (consultor) {
      const { error: erroResp } = await admin.from('cartao_responsaveis').insert({ cartao_id: novo.id, perfil_id: consultor.id })
      if (erroResp) parar(`Não consegui pôr o consultor do cliente no cartão "${c.titulo}": ${erroResp.message}`)
    }
    for (const [texto, feito] of c.checklist ?? []) {
      const { error: erroItem } = await admin.from('cartao_checklist').insert({ cartao_id: novo.id, texto, feito })
      if (erroItem) parar(`Não consegui criar o item "${texto}": ${erroItem.message}`)
    }
    if (c.comentario) {
      const { error: erroCom } = await admin.from('cartao_comentarios').insert({ cartao_id: novo.id, autor_id: autor, texto: c.comentario })
      if (erroCom) parar(`Não consegui criar o comentário: ${erroCom.message}`)
    }
    criados += 1
  }
  console.log(criados
    ? `Quadro de exemplo (${cliente.nome}): ${criados} cartões criados.`
    : `Quadro de exemplo (${cliente.nome}): já tinha os cartões, nada foi alterado.`)
}

// Quadros do menu de exemplo (desenho: docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md), só na
// Consultoria Exemplo: o pessoal "Minhas tarefas" da Ana (só ela vê) e o "Rotina do time" do time Implantação (os
// membros e o gestor mexem; a admin vê), cada um com as colunas que criar_quadro põe e alguns cartões. Com a chave
// secreta (sem pessoa logada) o banco aceita a escrita direta, como no quadro do cliente acima: o dono, a consultoria do
// pessoal (a da Ana) e quem criou vão escritos; a consultoria do quadro do time vem do time (gatilho). Responsável só
// quem a regra do banco aceita: no pessoal, a Ana; no do time, quem é membro ou gestor dele hoje. Rodar de novo não muda
// nada: o quadro com o mesmo nome e dono (aberto ou arquivado) é reaproveitado, o arquivado fica como está, e o cartão
// cujo título já está no quadro é pulado. Sem a Ana na consultoria de exemplo (ou sem o time), o quadro dela (ou o do
// time) não é criado.
async function quadrosDoMenuDeExemplo() {
  const { data: perfis, error: erroPerfis } = await admin.from('perfis').select('id, email, consultoria_id, ativo')
    .in('email', PESSOAS.map((p) => p.email))
  if (erroPerfis) parar(`Não consegui ler as pessoas de exemplo: ${erroPerfis.message}`)
  const pessoa = Object.fromEntries(perfis
    .filter((p) => p.ativo && p.consultoria_id === consultoria.id)
    .map((p) => [PESSOAS.find((x) => x.email === p.email).chave, p.id]))
  if (!pessoa.ana) {
    console.log('Quadros do menu de exemplo: a Ana não está ativa na consultoria de exemplo; nada criado.')
    return
  }
  const dia = (dias) => diaEmSaoPaulo(dias)

  await quadroDoMenuDeExemplo({
    tipo: 'pessoa',
    nome: 'Minhas tarefas',
    dono: { pessoa_id: pessoa.ana, consultoria_id: consultoria.id },
    criadoPor: pessoa.ana,
    podeSerResponsavel: [pessoa.ana],
    cartoes: [
      { titulo: 'Preparar a pauta da reunião de segunda', col: 0, prioridade: 'alta', prazo: dia(2), autor: 'ana', resp: ['ana'],
        checklist: [['Listar as pendências dos clientes', true], ['Separar os números do mês', false]] },
      { titulo: 'Estudar o novo módulo de cobrança', col: 1, prioridade: 'media', prazo: dia(7), autor: 'ana', resp: ['ana'] },
      { titulo: 'Organizar as notas das visitas', col: 0, prioridade: 'baixa', autor: 'ana' },
      { titulo: 'Atualizar o relatório de horas', col: 2, prioridade: 'media', prazo: dia(-2), autor: 'ana', resp: ['ana'],
        checklist: [['Lançar as horas da semana', true], ['Conferir com a agenda', true]] },
    ],
    pessoa,
  })

  const { data: time, error: erroTime } = await admin.from('times').select('id, gestor_id')
    .eq('consultoria_id', consultoria.id).eq('nome', 'Implantação').maybeSingle()
  if (erroTime) parar(`Não consegui ler o time de exemplo: ${erroTime.message}`)
  if (!time) {
    console.log('Quadro do time de exemplo: a consultoria de exemplo não tem o time Implantação; nada criado.')
    return
  }
  const { data: membros, error: erroMembros } = await admin.from('time_membros').select('pessoa_id').eq('time_id', time.id)
  if (erroMembros) parar(`Não consegui ler os membros do time de exemplo: ${erroMembros.message}`)
  await quadroDoMenuDeExemplo({
    tipo: 'time',
    nome: 'Rotina do time',
    dono: { time_id: time.id },
    criadoPor: pessoa.gestor ?? pessoa.ana,
    podeSerResponsavel: [time.gestor_id, ...membros.map((m) => m.pessoa_id)],
    cartoes: [
      { titulo: 'Padronizar o roteiro de kickoff', col: 1, prioridade: 'alta', prazo: dia(5), autor: 'gestor', resp: ['ana'],
        checklist: [['Juntar os roteiros de cada um', true], ['Escrever a versão do time', false], ['Revisar com o gestor', false]],
        comentario: ['bruno', 'Mandei o meu roteiro no cartão; dá para aproveitar a parte da coleta de documentos.'] },
      { titulo: 'Revisar o modelo de relatório mensal', col: 0, prioridade: 'media', prazo: dia(10), autor: 'ana', resp: ['bruno'] },
      { titulo: 'Treinar o time no quadro do cliente', col: 0, prioridade: 'baixa', autor: 'gestor', resp: ['gestor'] },
      { titulo: 'Fechar a agenda de visitas de dezembro', col: 2, prioridade: 'media', prazo: dia(-4), autor: 'bruno', resp: ['ana', 'bruno'],
        checklist: [['Confirmar as datas com os clientes', true], ['Lançar no Calendário', true]] },
    ],
    pessoa,
  })
}

// Um quadro do menu (pessoal ou do time) com os cartões dados; veja quadrosDoMenuDeExemplo. `pessoa` = { chave: id }
// das contas de exemplo ativas na consultoria; autor ou responsável que não está ali (ou que a regra não aceita) fica de
// fora: o cartão é da Ana e sem esse responsável.
async function quadroDoMenuDeExemplo({ tipo, nome, dono, criadoPor, podeSerResponsavel, cartoes, pessoa }) {
  let busca = admin.from('quadros').select('id, arquivado_em').eq('tipo', tipo).eq('nome', nome)
  for (const [coluna, valor] of Object.entries(dono)) busca = busca.eq(coluna, valor)
  const { data: achados, error: erroBusca } = await busca.order('arquivado_em', { nullsFirst: true }).limit(1)
  if (erroBusca) parar(`Não consegui procurar o quadro "${nome}": ${erroBusca.message}`)
  let quadro = achados[0]
  if (quadro?.arquivado_em) {
    console.log(`Quadro "${nome}": está arquivado, nada foi alterado.`)
    return
  }
  if (!quadro) {
    const { data, error } = await admin.from('quadros').insert({ tipo, nome, ...dono, criado_por: criadoPor }).select('id').single()
    if (error) parar(`Não consegui criar o quadro "${nome}": ${error.message}`)
    quadro = data
  }
  const { data: existentes } = await admin.from('quadro_colunas').select('id').eq('quadro_id', quadro.id)
  if (!existentes?.length) {
    // Todas as linhas com as mesmas chaves: no insert de várias linhas, a chave que falta numa vai como nulo.
    const { error } = await admin.from('quadro_colunas').insert([
      { quadro_id: quadro.id, nome: 'A fazer', posicao: 1024, concluidos: false },
      { quadro_id: quadro.id, nome: 'Em andamento', posicao: 2048, concluidos: false },
      { quadro_id: quadro.id, nome: 'Concluído', posicao: 3072, concluidos: true },
    ])
    if (error) parar(`Não consegui criar as colunas do quadro "${nome}": ${error.message}`)
  }
  const { data: colunas } = await admin.from('quadro_colunas').select('id').eq('quadro_id', quadro.id).order('posicao')
  const coluna = (i) => colunas[Math.min(i, colunas.length - 1)].id
  const aceitos = new Set(podeSerResponsavel.filter(Boolean))

  let criados = 0
  for (const c of cartoes) {
    const { data: ja } = await admin.from('cartoes').select('id').eq('quadro_id', quadro.id).eq('titulo', c.titulo).limit(1)
    if (ja?.length) continue
    const autor = pessoa[c.autor] ?? pessoa.ana
    const { data: novo, error } = await admin.from('cartoes')
      .insert({ quadro_id: quadro.id, coluna_id: coluna(c.col), titulo: c.titulo, prioridade: c.prioridade, prazo: c.prazo ?? null, criado_por: autor })
      .select('id').single()
    if (error) parar(`Não consegui criar o cartão "${c.titulo}": ${error.message}`)
    const responsaveis = (c.resp ?? []).map((chave) => pessoa[chave]).filter((id) => aceitos.has(id))
    if (responsaveis.length) {
      const { error: erroResp } = await admin.from('cartao_responsaveis').insert(responsaveis.map((id) => ({ cartao_id: novo.id, perfil_id: id })))
      if (erroResp) parar(`Não consegui pôr os responsáveis no cartão "${c.titulo}": ${erroResp.message}`)
    }
    for (const [texto, feito] of c.checklist ?? []) {
      const { error: erroItem } = await admin.from('cartao_checklist').insert({ cartao_id: novo.id, texto, feito })
      if (erroItem) parar(`Não consegui criar o item "${texto}": ${erroItem.message}`)
    }
    if (c.comentario) {
      const [quem, texto] = c.comentario
      const { error: erroCom } = await admin.from('cartao_comentarios').insert({ cartao_id: novo.id, autor_id: pessoa[quem] ?? autor, texto })
      if (erroCom) parar(`Não consegui criar o comentário: ${erroCom.message}`)
    }
    criados += 1
  }
  const de = tipo === 'pessoa' ? 'pessoal da Ana' : 'do time Implantação'
  console.log(criados
    ? `Quadro "${nome}" (${de}): ${criados} cartões criados.`
    : `Quadro "${nome}" (${de}): já tinha os cartões, nada foi alterado.`)
}

// Modelos de check-in de exemplo: [título, descrição, obrigatória, prazo (dia N a partir do início), chaves de que
// depende]. "Depende de" só aponta para tarefa que vem antes (a regra do banco). Os mesmos do protótipo
// (docs/prototipo/checkins-modelo-poc.html); os da Central valem só para a Consultoria Exemplo. Função (e não const)
// porque o código de cima roda antes de chegar aqui.
function modelosDeExemplo() {
  return [
    { chave: 'financeira', dono: 'central', nome: 'Gestão financeira', tipo: 'gestao',
      descricao: 'Diagnóstico das finanças do provedor, plano de ação e rotina de acompanhamento.',
      etapas: [
        ['Diagnóstico', [
          ['f1', 'Reunião de alinhamento', 'Objetivos, escopo e quem participa do lado do cliente.', true, 2],
          ['f2', 'Coleta dos documentos financeiros', 'DRE, balancetes, extratos e contas a pagar e receber dos últimos 12 meses.', true, 5, ['f1']],
          ['f3', 'Análise do DRE', 'Receita, custos, margem bruta e EBITDA mês a mês; apontar desvios.', true, 10, ['f2']],
          ['f4', 'Levantamento do fluxo de caixa', 'Entradas e saídas reais dos últimos 6 meses, por categoria.', true, 10, ['f2']],
          ['f5', 'Análise de inadimplência', 'Taxa de inadimplência por plano e faixa de atraso.', false, 12, ['f2']],
        ]],
        ['Plano de ação', [
          ['f6', 'Mapa de custos fixos e variáveis', 'Separar os custos e achar cortes e renegociações.', true, 14, ['f3']],
          ['f7', 'Revisão da precificação dos planos', 'Margem por plano comparada com a concorrência da região.', false, 18, ['f3', 'f6']],
          ['f8', 'Plano de ação financeiro', 'Metas, responsáveis e prazos das ações do diagnóstico.', true, 20, ['f4', 'f6']],
          ['f9', 'Apresentação do plano à diretoria', 'Validar o plano e as metas com os sócios.', true, 22, ['f8']],
        ]],
        ['Implantação', [
          ['f10', 'Fluxo de caixa projetado', 'Projeção de 90 dias, atualizada toda semana.', true, 30, ['f4', 'f9']],
          ['f11', 'Rotina de conciliação bancária', 'Treinar o financeiro e fixar o dia da conciliação.', true, 35, ['f10']],
          ['f12', 'Política de cobrança', 'Régua de cobrança e regras para negociar débitos.', false, 35, ['f5', 'f9']],
        ]],
        ['Acompanhamento', [
          ['f13', 'Indicadores do mês', 'Margem, caixa, inadimplência e custo por assinante.', true, 45, ['f10', 'f11']],
          ['f14', 'Reunião de resultados', 'Comparar os indicadores com as metas e ajustar o plano.', true, 60, ['f13']],
        ]],
      ] },
    { chave: 'sucesso', dono: 'central', nome: 'Sucesso do Cliente — onboarding', tipo: 'sucesso_do_cliente',
      descricao: 'Organizar a jornada do assinante nos primeiros 90 dias para reduzir cancelamentos.',
      etapas: [
        ['Diagnóstico', [
          ['s1', 'Reunião de kickoff', 'Apresentar a metodologia e combinar a agenda.', true, 1],
          ['s2', 'Mapa da jornada do assinante', 'Da venda à instalação e ao primeiro boleto: onde o assinante trava.', true, 7, ['s1']],
          ['s3', 'Análise de NPS e reclamações', 'Últimos 3 meses de NPS, Reclame Aqui e chamados.', true, 5, ['s1']],
          ['s4', 'Mapa de processos do atendimento', 'Fluxos de suporte, retenção e cancelamento.', true, 10, ['s2']],
        ]],
        ['Plano de ação', [
          ['s5', 'Régua de relacionamento', 'Contatos programados nos primeiros 90 dias.', true, 15, ['s2', 's3']],
          ['s6', 'Roteiro de boas-vindas', 'Mensagem, ligação e checklist depois da instalação.', false, 15, ['s2']],
        ]],
        ['Implantação', [
          ['s7', 'Treinamento do atendimento', 'Novo roteiro e régua, com simulações.', true, 25, ['s4', 's5']],
          ['s8', 'Pesquisa de NPS automática', 'Disparo após a instalação e a cada 90 dias.', true, 25, ['s5']],
        ]],
        ['Acompanhamento', [
          ['s9', 'Indicadores do mês', 'NPS, churn, tempo de instalação e chamados por assinante.', true, 35, ['s8']],
          ['s10', 'Reunião de resultados', 'Resultados do onboarding e próximos passos.', true, 45, ['s7', 's9']],
        ]],
      ] },
    { chave: 'pessoas', dono: 'gestor', nome: 'Gestão de Pessoas', tipo: 'gestao_de_pessoas',
      descricao: 'Estrutura de cargos, clima e rituais de liderança — o jeito da Consultoria Exemplo de tocar pessoas.',
      etapas: [
        ['Diagnóstico', [
          ['p1', 'Reunião de alinhamento com a diretoria', 'Expectativas e prioridades da diretoria.', true, 2],
          ['p2', 'Organograma atual', 'Quem responde a quem, por área.', true, 7, ['p1']],
          ['p3', 'Pesquisa de clima', 'Questionário anônimo com toda a equipe.', true, 15, ['p1']],
        ]],
        ['Plano de ação', [
          ['p4', 'Descrição de cargos', 'Responsabilidades e requisitos de cada cargo.', true, 25, ['p2']],
          ['p5', 'Plano de cargos e salários', 'Faixas salariais e critérios de promoção.', false, 40, ['p4']],
          ['p6', 'Plano de treinamento', 'Trilhas por área, a partir da pesquisa de clima.', true, 40, ['p3', 'p4']],
        ]],
        ['Implantação', [
          ['p7', 'Avaliação de desempenho', 'Primeiro ciclo com os líderes.', true, 60, ['p4']],
          ['p8', 'Rituais de feedback', 'Reuniões 1:1 mensais dos líderes com a equipe.', true, 65, ['p6', 'p7']],
        ]],
        ['Acompanhamento', [
          ['p9', 'Indicadores de pessoas', 'Turnover, absenteísmo e horas de treinamento.', true, 80, ['p8']],
        ]],
      ] },
  ]
}

// O formato que o editor de modelos manda para salvar_modelo.
function dadosDoModelo(modelo, para) {
  return {
    nome: modelo.nome,
    descricao: modelo.descricao,
    tipo: modelo.tipo,
    para,
    etapas: modelo.etapas.map(([nome, tarefas]) => ({
      nome,
      tarefas: tarefas.map(([chave, titulo, descricao, obrigatoria, prazo_dias, depende_de = []]) =>
        ({ chave, titulo, descricao, obrigatoria, prazo_dias, depende_de })),
    })),
  }
}

// "Hoje" em São Paulo (a regra do banco) mais N dias, como 'aaaa-mm-dd'.
function diaEmSaoPaulo(dias) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const dia = new Date(`${hoje}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + dias)
  return dia.toISOString().slice(0, 10)
}

// Entra com uma conta de exemplo (a senha nova ou, nas contas de antes de 16/11, a antiga), sem guardar sessão. Nunca
// chama signOut: o padrão dele encerra todas as sessões da conta (as do navegador também).
async function entrarComoExemplo(email) {
  for (const senha of [SENHA_EXEMPLO, 'exemplo-123']) {
    const cliente = createClient(status.API_URL, status.PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
    if (!error) return cliente
  }
  return null
}

// Modelos de check-in e um check-list de exemplo, pelas mesmas funções do banco que a tela usa (salvar_modelo,
// aplicar_modelo, checklist_do_cliente, marcar_tarefa, anotar_tarefa) e entrando com as contas de exemplo (nunca com a
// chave secreta), para valer a regra de quem faz o quê: a central de exemplo cria "Gestão financeira" e "Sucesso do
// Cliente — onboarding" (da Central, só para a Consultoria Exemplo: as consultorias de verdade não os veem); o gestor de
// exemplo cria "Gestão de Pessoas" (da consultoria) e aplica a Gestão financeira no cliente do quadro de exemplo, com o
// início 12 dias atrás; e o consultor do cliente (só ele marca), se for uma das contas de exemplo, deixa 3 tarefas feitas,
// uma em andamento e uma nota. Rodar de novo não muda nada: modelo com o mesmo nome na consultoria de exemplo é pulado, e
// cliente que já tem check-list ativo (este ou outro) também.
async function checklistsDeExemplo() {
  const comoCentral = await entrarComoExemplo(CENTRAL.email)
  const comoGestor = await entrarComoExemplo('gestor@exemplo.test')
  if (!comoCentral || !comoGestor) {
    console.log('Check-lists de exemplo: não consegui entrar como a central e o gestor de exemplo; nada criado.')
    return
  }

  const modelos = {}
  const novos = []
  for (const modelo of modelosDeExemplo()) {
    const como = modelo.dono === 'central' ? comoCentral : comoGestor
    const { data: ja, error } = await como.from('modelos').select('id')
      .eq('nome', modelo.nome).eq('consultoria_id', consultoria.id).eq('da_central', modelo.dono === 'central').limit(1)
    if (error) parar(`Não consegui procurar o modelo "${modelo.nome}": ${error.message}`)
    if (ja.length) {
      modelos[modelo.chave] = ja[0].id
      continue
    }
    const { data: id, error: erroSalvar } = await como.rpc('salvar_modelo', { p_id: null, p_dados: dadosDoModelo(modelo, consultoria.id) })
    if (erroSalvar) parar(`Não consegui criar o modelo "${modelo.nome}": ${erroSalvar.message}`)
    modelos[modelo.chave] = id
    novos.push(modelo.nome)
  }
  console.log(novos.length
    ? `Modelos de check-in de exemplo criados: ${novos.join(', ')}.`
    : 'Modelos de check-in de exemplo: já existiam, nada foi alterado.')

  // O mesmo cliente do quadro de exemplo.
  let { data: cliente } = await admin.from('clientes').select('id, nome, consultor_id')
    .eq('consultoria_id', consultoria.id).eq('nome', 'Provedor Teste Navegador').is('arquivado_em', null).maybeSingle()
  if (!cliente) {
    const { data } = await admin.from('clientes').select('id, nome, consultor_id')
      .eq('consultoria_id', consultoria.id).is('arquivado_em', null).order('criado_em').limit(1)
    cliente = data?.[0]
  }
  if (!cliente) {
    console.log('Check-list de exemplo: a consultoria de exemplo não tem cliente ativo; nada aplicado.')
    return
  }
  const { data: ativo, error: erroAtivo } = await comoGestor.from('cliente_checklists').select('modelo_nome')
    .eq('cliente_id', cliente.id).is('encerrado_em', null).maybeSingle()
  if (erroAtivo) parar(`Não consegui ler o check-list de ${cliente.nome}: ${erroAtivo.message}`)
  if (ativo) {
    console.log(`Check-list de exemplo (${cliente.nome}): já tem o check-list "${ativo.modelo_nome}", nada foi alterado.`)
    return
  }
  const { error: erroAplicar } = await comoGestor.rpc('aplicar_modelo', {
    p_cliente: cliente.id,
    p_modelo: modelos.financeira,
    p_inicio: diaEmSaoPaulo(-12),
  })
  if (erroAplicar) parar(`Não consegui aplicar "Gestão financeira" em ${cliente.nome}: ${erroAplicar.message}`)

  // Só o consultor do cliente marca: entra como ele quando é uma das contas de exemplo. Se ele estiver com o check-in
  // aberto neste cliente, as tarefas entram no resumo daquele check-in (como na tela).
  const { data: consultor } = cliente.consultor_id
    ? await admin.from('perfis').select('email').eq('id', cliente.consultor_id).eq('ativo', true).maybeSingle()
    : { data: null }
  const comoConsultor = PESSOAS.some((p) => p.email === consultor?.email) ? await entrarComoExemplo(consultor.email) : null
  if (!comoConsultor) {
    console.log(`Check-list de exemplo (${cliente.nome}): "Gestão financeira" aplicado, sem tarefas feitas (o consultor do cliente não é uma conta de exemplo).`)
    return
  }
  const { data: lido, error: erroLer } = await comoConsultor.rpc('checklist_do_cliente', { p_cliente: cliente.id })
  if (erroLer) parar(`Não consegui ler o check-list de ${cliente.nome}: ${erroLer.message}`)
  const tarefa = Object.fromEntries((lido?.tarefas ?? []).map((t) => [t.titulo, t.id]))
  // Na ordem: cada uma depende das de cima.
  const marcas = [
    ['Reunião de alinhamento', 'feita'],
    ['Coleta dos documentos financeiros', 'feita'],
    ['Análise do DRE', 'feita'],
    ['Levantamento do fluxo de caixa', 'andamento'],
  ]
  for (const [titulo, estado] of marcas) {
    const { error } = await comoConsultor.rpc('marcar_tarefa', { p_tarefa: tarefa[titulo], p_estado: estado })
    if (error) parar(`Não consegui marcar "${titulo}": ${error.message}`)
  }
  const { error: erroNota } = await comoConsultor.rpc('anotar_tarefa', {
    p_tarefa: tarefa['Análise do DRE'],
    p_nota: 'Margem bruta caiu 4 pontos no 2º trimestre; o custo de link puxou a queda.',
  })
  if (erroNota) parar(`Não consegui escrever a nota de "Análise do DRE": ${erroNota.message}`)
  console.log(`Check-list de exemplo (${cliente.nome}): "Gestão financeira" aplicado pelo gestor, com 3 tarefas feitas e 1 em andamento.`)
}

// --historico: check-ins fechados em dias úteis dos últimos 6 meses, feitos pela Ana e pelo Bruno nos clientes deles da
// Consultoria Exemplo, para os gráficos do Início terem o que mostrar. Só grava com a consultoria sem nenhum check-in
// (rodar de novo não muda nada); entra com a conta de cada um, então vale a regra do banco (só o consultor do cliente
// lança horas, e nunca no futuro), e nunca apaga nada.
async function historicoDeExemplo() {
  const { count, error } = await admin.from('checkins').select('id', { count: 'exact', head: true })
    .eq('consultoria_id', consultoria.id)
  if (error) parar(`Não consegui contar os check-ins da ${NOME_CONSULTORIA}: ${error.message}`)
  if (count > 0) {
    console.log(`Histórico de exemplo: a ${NOME_CONSULTORIA} já tem check-ins, nada foi gravado.`)
    return
  }
  for (const email of ['ana@exemplo.test', 'bruno@exemplo.test']) {
    const como = await entrarComoExemplo(email)
    const { data: pessoa } = await admin.from('perfis').select('id').eq('email', email).maybeSingle()
    if (!como || !pessoa) {
      console.log(`Histórico de exemplo: não consegui entrar como ${email}; nada gravado para essa conta.`)
      continue
    }
    const { data: clientes, error: erroClientes } = await como.from('clientes').select('id')
      .eq('consultor_id', pessoa.id).eq('consultoria_id', consultoria.id).is('arquivado_em', null).order('criado_em').limit(4)
    if (erroClientes) parar(`Não consegui ler os clientes de ${email}: ${erroClientes.message}`)
    const linhas = []
    clientes.forEach((cliente, i) => {
      for (let dias = -182; dias < 0; dias++) {
        const dia = diaEmSaoPaulo(dias)
        const semana = new Date(`${dia}T12:00:00Z`).getUTCDay()
        // Fim de semana fica de fora, e um dia útil em cada cinco também (o ritmo não fica igual todo dia).
        if (semana === 0 || semana === 6 || (-dias + i) % 5 === 0) continue
        const inicio = new Date(`${dia}T${String(8 + i * 2).padStart(2, '0')}:00:00-03:00`) // cada cliente na sua faixa de 2 h
        const minutos = 30 + ((-dias * 7 + i * 3) % 4) * 25 // de 30 min a 1 h 45
        linhas.push({ cliente_id: cliente.id, inicio: inicio.toISOString(),
          fim: new Date(inicio.getTime() + minutos * 60_000).toISOString(), descricao: 'Acompanhamento (histórico de exemplo).' })
      }
    })
    if (!linhas.length) {
      console.log(`Histórico de exemplo: ${email} não tem clientes na ${NOME_CONSULTORIA}; nada gravado.`)
      continue
    }
    const { error: erroGravar } = await como.from('checkins').insert(linhas)
    if (erroGravar) parar(`Não consegui gravar o histórico de ${email}: ${erroGravar.message}`)
    console.log(`Histórico de exemplo: ${linhas.length} check-ins fechados de ${email} em ${clientes.length} cliente(s).`)
  }
}
