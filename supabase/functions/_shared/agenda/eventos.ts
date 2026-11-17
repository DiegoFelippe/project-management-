// Eventos da agenda: criar, editar, apagar e responder ao convite (núcleo da Edge Function agenda; desenho:
// docs/superpowers/specs/2026-11-16-calendario-design.md, "Janela de evento" e "Google — conta de cada consultor").
// Sem imports do Deno: recebe o cliente do Supabase (service_role), `googleDe(perfilId)` (o Google do organizador, ou
// null quando ele não conectou) e quem chama (o perfil que quemChama leu). Os testes passam o banco local e o Google
// falso.
//
// Quem faz o quê (tabela CRUD do desenho): o consultor nos próprios eventos; gestor e administrador nos da
// consultoria; central e dono em todos; o participante convidado só responde (Confirmar/Recusar).
//
// Salvar, nesta ordem: confere quem pode → ensaia a gravação no banco (as regras dos gatilhos e restrições: consultor,
// cliente e participantes da consultoria do evento, até 20 convidados de fora com e-mail válido e sem repetir, fim
// depois do início, até 31 dias; o banco é quem decide, aqui elas só viram mensagem) → grava no Google do organizador
// → grava no banco. Se o Google recusa, o que esta chamada já tinha feito no Google é desfeito e nada muda no banco;
// se o banco recusa depois do Google, o Google é desfeito. Organizador sem Google: fica só no app, sem Meet, com aviso.
import { Falha } from '../http.ts'
import { ErroDoGoogle, type EventoParaOGoogle, type GoogleDaPessoa } from './google.ts'
import type { Banco } from './tokens.ts'

export type Quem = { id: string; nome: string; papel: string; consultoria_id: string | null }
export type GoogleDe = (perfilId: string) => Promise<GoogleDaPessoa | null>

// Linha de agenda_eventos, como o banco devolve.
type Linha = {
  id: string
  consultoria_id: string
  consultor_id: string
  cliente_id: string | null
  titulo: string
  descricao: string | null
  inicio: string
  fim: string
  dia_inteiro: boolean
  cor: number
  com_meet: boolean
  gravar: boolean
  meet_link: string | null
  meet_codigo: string | null
  google_evento_id: string | null
  criado_por: string | null
}
type Pessoa = { id: string; nome: string; consultoria_id: string | null }
type Participantes = { perfis: string[]; emails: string[] }
type Passo = () => Promise<unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Teto das listas que chegam do navegador (o limite de verdade dos convidados de fora, 20, é do banco).
const MAXIMO_NA_LISTA = 100
const RESPOSTAS = ['confirmou', 'recusou']

const SO_QUEM_ORGANIZA = 'Só quem organiza e a gestão da consultoria editam.'
const NAO_EXISTE = 'Este evento não existe mais.'
const CLIENTE_INVALIDO = 'Escolha um cliente que você vê, da consultoria do consultor.'

// O id do evento no Google sai do id do app (base32hex: o uuid sem os hífens). Assim, tentar de novo não duplica.
export const idNoGoogle = (id: string) => id.replaceAll('-', '').toLowerCase()

// ── Erros ──

const recusa = (status: number, codigo: string, erro: string) => new Falha(status, codigo, { erro })

const MENSAGEM_DO_CAMPO: Record<string, string> = {
  evento: 'Confira os dados do evento.',
  id: 'Confira os dados do evento.',
  titulo: 'Escreva o título do evento (até 200 caracteres).',
  descricao: 'A descrição passa de 5.000 caracteres.',
  inicio: 'Confira a data e a hora de início.',
  fim: 'Confira a data e a hora de fim.',
  dia_inteiro: 'Confira se o evento é de dia inteiro.',
  cor: 'Escolha uma das cores da lista.',
  com_meet: 'Confira a opção do Google Meet.',
  gravar: 'Confira a opção de gravar e transcrever.',
  consultor_id: 'Escolha o consultor.',
  cliente_id: 'Escolha o cliente da lista.',
  participantes: 'Escolha os participantes da lista.',
  convidados: 'Confira a lista de convidados de fora.',
  resposta: 'Responda confirmando ou recusando o convite.',
}

function invalido(campo: string): never {
  throw new Falha(400, 'dados_invalidos', { campo, erro: MENSAGEM_DO_CAMPO[campo] ?? 'Confira os campos destacados.' })
}

// Erros levantados pelos gatilhos (raise exception '<código>') e pela função de gravar.
const ERROS_DO_BANCO: Record<string, [number, string, string]> = {
  consultor_invalido: [400, 'consultor_invalido', 'Escolha um consultor desta consultoria.'],
  cliente_invalido: [400, 'cliente_invalido', CLIENTE_INVALIDO],
  pasta_invalida: [400, 'pasta_invalida', 'A pasta da reunião não é deste cliente.'],
  participante_invalido: [400, 'participante_invalido', 'Convide só consultores da consultoria do evento.'],
  sem_permissao: [403, 'sem_permissao', SO_QUEM_ORGANIZA],
  evento_nao_encontrado: [404, 'evento_nao_encontrado', NAO_EXISTE],
}

// Restrições (23514) e índice único (23505), pelo nome que aparece na mensagem do banco. Texto = campo inválido.
const RESTRICOES: [string, [number, string, string] | string][] = [
  ['"agenda_eventos_check"', [400, 'fim_antes_do_inicio', 'O fim precisa ser depois do início.']],
  ['"agenda_eventos_duracao_max"', [400, 'evento_longo_demais', 'Um evento dura no máximo 31 dias.']],
  ['No máximo 20 convidados de fora', [400, 'convidados_demais', 'No máximo 20 convidados de fora por evento.']],
  ['"agenda_participantes_email_check"', [400, 'email_invalido', 'Confira o e-mail dos convidados de fora.']],
  ['"agenda_participantes_email_idx"', [400, 'convidado_repetido', 'Há um convidado de fora repetido.']],
  ['"agenda_eventos_titulo_check"', 'titulo'],
  ['"agenda_eventos_descricao_check"', 'descricao'],
  ['"agenda_eventos_cor_check"', 'cor'],
]

function traduzirErroDoBanco(erro: { code?: string; message?: string }): unknown {
  const mensagem = String(erro?.message ?? '')
  const doGatilho = erro?.code === 'P0001' ? ERROS_DO_BANCO[mensagem] : undefined
  if (doGatilho) return recusa(...doGatilho)
  if (erro?.code === '23514' || erro?.code === '23505') {
    const regra = RESTRICOES.find(([trecho]) => mensagem.includes(trecho))
    if (regra && typeof regra[1] === 'string') {
      return new Falha(400, 'dados_invalidos', { campo: regra[1], erro: MENSAGEM_DO_CAMPO[regra[1]] })
    }
    if (regra) return recusa(...(regra[1] as [number, string, string]))
  }
  return erro
}

// O Google recusou: a tela recebe o motivo. Quando quem chama não é o organizador, diz de quem é a conexão.
function falhaDoGoogle(erro: unknown, organizador: Pessoa, quem: Quem): unknown {
  if (!(erro instanceof ErroDoGoogle)) return erro
  const mensagem = erro.codigo === 'reconectar' && organizador.id !== quem.id
    ? `O Google de ${organizador.nome} não aceita mais a conexão: ${organizador.nome} precisa reconectar o Google.`
    : erro.message
  return new Falha(502, 'google_recusou', { motivo: erro.codigo, erro: mensagem })
}

// Desfaz no Google, do último passo para o primeiro. Melhor esforço: o erro que sobe é o que fez desfazer.
async function desfazer(passos: Passo[]) {
  for (const passo of [...passos].reverse()) {
    try {
      await passo()
    } catch {
      // segue desfazendo o resto
    }
  }
}

// ── O que chega do navegador ──

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) invalido('evento')
  return valor as Record<string, unknown>
}

function uuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) invalido(campo)
  return valor.toLowerCase()
}

function texto(valor: unknown, campo: string, maximo: number, obrigatorio: boolean): string | null {
  if (valor === null && !obrigatorio) return null
  if (typeof valor !== 'string') invalido(campo)
  const limpo = valor.trim()
  if (limpo.length > maximo || (obrigatorio && !limpo)) invalido(campo)
  return limpo || null
}

function instante(valor: unknown, campo: string): string {
  const data = typeof valor === 'string' ? new Date(valor) : null
  if (!data || Number.isNaN(data.getTime())) invalido(campo)
  return data.toISOString()
}

function simNao(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') invalido(campo)
  return valor
}

function cor(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > 7) invalido('cor')
  return valor
}

function listaDeIds(valor: unknown, campo: string): string[] {
  if (!Array.isArray(valor) || valor.length > MAXIMO_NA_LISTA) invalido(campo)
  return [...new Set(valor.map((id) => uuid(id, campo)))]
}

// E-mails de fora, em minúsculas. Formato, repetição e o limite de 20 são do banco (o ensaio recusa antes do Google).
function listaDeEmails(valor: unknown): string[] {
  if (!Array.isArray(valor) || valor.length > MAXIMO_NA_LISTA) invalido('convidados')
  return valor.map((email) => {
    if (typeof email !== 'string' || email.length > 320) invalido('convidados')
    return email.trim().toLowerCase()
  })
}

type Campos = {
  cliente_id: string | null
  titulo: string
  descricao: string | null
  inicio: string
  fim: string
  dia_inteiro: boolean
  cor: number
  com_meet: boolean
  gravar: boolean
}

// Os campos do evento: o que veio substitui; o que não veio fica como está (ao editar) ou ganha o padrão (ao criar).
function lerCampos(d: Record<string, unknown>, atual: Linha | null): Campos {
  const veio = (chave: string) => d[chave] !== undefined
  const obrigatorio = (chave: string): never => invalido(chave)
  const comMeet = veio('com_meet') ? simNao(d.com_meet, 'com_meet') : atual?.com_meet ?? false
  const gravar = veio('gravar') ? simNao(d.gravar, 'gravar') : atual?.gravar ?? false
  return {
    titulo: veio('titulo') ? texto(d.titulo, 'titulo', 200, true)! : atual?.titulo ?? obrigatorio('titulo'),
    descricao: veio('descricao') ? texto(d.descricao, 'descricao', 5000, false) : atual?.descricao ?? null,
    inicio: instante(veio('inicio') ? d.inicio : atual?.inicio ?? obrigatorio('inicio'), 'inicio'),
    fim: instante(veio('fim') ? d.fim : atual?.fim ?? obrigatorio('fim'), 'fim'),
    dia_inteiro: veio('dia_inteiro') ? simNao(d.dia_inteiro, 'dia_inteiro') : atual?.dia_inteiro ?? false,
    cor: veio('cor') ? cor(d.cor) : atual?.cor ?? 0,
    cliente_id: veio('cliente_id')
      ? (d.cliente_id === null ? null : uuid(d.cliente_id, 'cliente_id'))
      : atual?.cliente_id ?? null,
    com_meet: comMeet,
    // Gravar e transcrever só existe com Meet.
    gravar: comMeet && gravar,
  }
}

const paraOGoogle = (e: Pick<Campos, 'titulo' | 'descricao' | 'inicio' | 'fim' | 'dia_inteiro'>): EventoParaOGoogle => ({
  titulo: e.titulo,
  descricao: e.descricao,
  inicio: e.inicio,
  fim: e.fim,
  dia_inteiro: e.dia_inteiro,
})

// ── Leituras (service_role) ──

function conferir<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

async function lerEvento(db: Banco, id: string): Promise<Linha | null> {
  return conferir(await db.from('agenda_eventos').select('*').eq('id', id).maybeSingle())
}

async function lerPessoa(db: Banco, id: string): Promise<Pessoa | null> {
  return conferir(await db.from('perfis').select('id, nome, consultoria_id').eq('id', id).maybeSingle())
}

async function lerParticipantes(db: Banco, eventoId: string): Promise<Participantes> {
  const linhas: { perfil_id: string | null; email: string | null }[] =
    conferir(await db.from('agenda_participantes').select('perfil_id, email').eq('evento_id', eventoId)) ?? []
  return {
    perfis: linhas.flatMap((l) => (l.perfil_id ? [l.perfil_id] : [])),
    emails: linhas.flatMap((l) => (l.email ? [l.email] : [])),
  }
}

// E-mail de cada participante da casa no convite do Google: o da conta Google que a pessoa conectou (é onde ela usa a
// agenda); sem conexão, o do login. Uma leitura para a lista inteira.
async function emailsDosParticipantes(db: Banco, ids: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>()
  if (!ids.length) return emails
  const [perfis, googles] = await Promise.all([
    db.from('perfis').select('id, email').in('id', ids),
    db.from('google_pessoas').select('perfil_id, email').in('perfil_id', ids),
  ])
  for (const p of conferir(perfis) ?? []) emails.set(p.id, p.email)
  for (const g of conferir(googles) ?? []) emails.set(g.perfil_id, g.email)
  return emails
}

const convitesPara = (emails: Map<string, string>, lista: Participantes) => [
  ...lista.perfis.flatMap((id) => (emails.has(id) ? [emails.get(id)!] : [])),
  ...lista.emails,
]

async function consultoriaArquivada(db: Banco, id: string | null): Promise<boolean> {
  if (!id) return false
  const linha = conferir(await db.from('consultorias').select('arquivada_em').eq('id', id).maybeSingle())
  return Boolean(linha?.arquivada_em)
}

// ── Quem pode ──

const ehCentral = (q: Quem) => q.papel === 'dono' || q.papel === 'central'
const ehGestao = (q: Quem) => q.papel === 'admin' || q.papel === 'gestor'

// Quem é de consultoria arquivada não age (como private.liberado no banco).
async function conferirQuem(db: Banco, quem: Quem) {
  if (ehCentral(quem)) return
  if (!quem.consultoria_id || await consultoriaArquivada(db, quem.consultoria_id)) {
    throw recusa(403, 'sem_permissao', 'Você não tem permissão para isso.')
  }
}

// Editar e apagar: a central; a gestão da consultoria do evento; o consultor dono da agenda.
function cuidaDoEvento(quem: Quem, evento: Linha): boolean {
  if (ehCentral(quem)) return true
  if (evento.consultoria_id !== quem.consultoria_id) return false
  return ehGestao(quem) || evento.consultor_id === quem.id
}

// Não cuida: o participante (e o consultor que mudou de consultoria) vê o evento e recebe "só quem organiza"; os
// outros nem ficam sabendo que o evento existe.
function semPermissaoNoEvento(quem: Quem, evento: Linha, souConvidado: boolean): Falha {
  const vejo = evento.consultor_id === quem.id || (evento.consultoria_id === quem.consultoria_id && souConvidado)
  return vejo ? recusa(403, 'sem_permissao', SO_QUEM_ORGANIZA) : recusa(404, 'evento_nao_encontrado', NAO_EXISTE)
}

// Criar na agenda de alguém: o consultor só na própria; a gestão na de quem é da consultoria; a central em qualquer uma.
async function agendaDe(db: Banco, quem: Quem, consultorId: string): Promise<Pessoa> {
  if (!ehCentral(quem) && !ehGestao(quem) && consultorId !== quem.id) {
    throw recusa(403, 'sem_permissao', 'Você só cria eventos na sua própria agenda.')
  }
  const consultor = await lerPessoa(db, consultorId)
  if (ehGestao(quem) && consultor?.consultoria_id !== quem.consultoria_id) {
    throw recusa(403, 'sem_permissao', 'Você só cria eventos na agenda dos consultores da sua consultoria.')
  }
  if (!consultor?.consultoria_id) {
    throw recusa(400, 'consultor_invalido', 'Escolha o consultor: o evento fica na agenda de um consultor da consultoria.')
  }
  return consultor
}

// Cliente novo no evento: um que quem cria vê (as regras de private.vejo_cliente) e que não está arquivado. Que ele é
// da consultoria do evento, o banco confere.
async function conferirCliente(db: Banco, quem: Quem, clienteId: string) {
  const cliente = conferir(
    await db.from('clientes').select('consultoria_id, consultor_id, arquivado').eq('id', clienteId).maybeSingle(),
  )
  const vejo = cliente && (ehCentral(quem) ||
    (cliente.consultoria_id === quem.consultoria_id && (ehGestao(quem) || cliente.consultor_id === quem.id)))
  if (!vejo) throw recusa(400, 'cliente_invalido', CLIENTE_INVALIDO)
  if (cliente.arquivado) throw recusa(400, 'cliente_arquivado', 'Cliente arquivado não aceita evento novo.')
}

// ── Gravar ──

type EventoParaOBanco = Campos & {
  id: string
  consultoria_id: string
  consultor_id: string
  criado_por: string
  meet_link: string | null
  meet_codigo: string | null
  google_evento_id: string | null
}

// O evento e a lista inteira de participantes numa transação (public.gravar_evento_da_agenda). `ensaio`: confere as
// regras do banco e desfaz.
async function gravarNoBanco(db: Banco, evento: EventoParaOBanco, lista: Participantes, novo: boolean, ensaio: boolean) {
  const { data, error } = await db.rpc('gravar_evento_da_agenda', {
    p_evento: evento,
    p_participantes: lista.perfis,
    p_convidados: lista.emails,
    p_novo: novo,
    p_ensaio: ensaio,
  })
  if (error) throw traduzirErroDoBanco(error as { code?: string; message?: string })
  return data as Record<string, unknown>
}

type MeetNoGoogle = { googleEventoId: string; meetLink: string | null; meetCodigo: string | null }

async function ligarGravacao(google: GoogleDaPessoa, meetCodigo: string | null, ligar: boolean) {
  if (!meetCodigo) {
    throw new ErroDoGoogle('recusado', 'O Google ainda não criou a sala do Meet. Tente de novo em alguns minutos.')
  }
  await google.ligarGravacao(meetCodigo, { ligar })
}

// Evento novo no Google do organizador (ou um que ficou só no app e agora vai para lá). Com gravação, os convites só
// saem depois que o Meet aceitou gravar: se ele recusar, o evento é desfeito sem ninguém receber convite e cancelamento.
async function criarNoGoogle(
  google: GoogleDaPessoa, id: string, campos: Campos, convites: string[], passos: Passo[],
): Promise<MeetNoGoogle> {
  const gid = idNoGoogle(id)
  const evento = paraOGoogle(campos)
  const criado = await google.criarEvento(evento, { id: gid, meet: campos.com_meet, convidados: campos.gravar ? [] : convites })
  passos.push(() => google.apagarEvento(gid))
  if (campos.gravar) {
    await ligarGravacao(google, criado.meetCodigo, true)
    if (convites.length) await google.editarEvento(gid, evento, { convidados: convites })
  }
  return criado
}

// Evento que já está no Google. A gravação de um Meet que já existe muda antes (não avisa ninguém); se o resto falhar,
// cada passo volta como estava.
async function editarNoGoogle(
  google: GoogleDaPessoa, atual: Linha, campos: Campos, convites: string[], convitesAntes: string[], passos: Passo[],
): Promise<MeetNoGoogle> {
  const gid = atual.google_evento_id!
  const codigoAntes = atual.meet_codigo
  if (codigoAntes && campos.gravar !== atual.gravar) {
    await ligarGravacao(google, codigoAntes, campos.gravar)
    passos.push(() => ligarGravacao(google, codigoAntes, atual.gravar))
  }
  const editado = await google.editarEvento(gid, paraOGoogle(campos), {
    convidados: convites,
    meet: campos.com_meet && !atual.com_meet,
  })
  passos.push(() => google.editarEvento(gid, paraOGoogle(atual), { convidados: convitesAntes }))
  const meet = editado.meetCodigo ? editado : { meetLink: atual.meet_link, meetCodigo: atual.meet_codigo }
  if (campos.gravar && !codigoAntes) await ligarGravacao(google, meet.meetCodigo, true)
  return { googleEventoId: gid, meetLink: meet.meetLink, meetCodigo: meet.meetCodigo }
}

// Criar (dados.novo, com o id que a janela escolheu: tentar de novo não duplica) ou editar (dados.id) um evento.
// dados: { id?, novo?, consultor_id?, cliente_id?, titulo, descricao?, inicio, fim, dia_inteiro?, cor?, com_meet?,
// gravar?, participantes?: [perfil_id], convidados?: [e-mail] }. Ao editar, o que não vier fica como está.
// Devolve { evento } (no formato de eventos_do_periodo) e, quando ficou só no app, { aviso }.
export async function salvarEvento(db: Banco, googleDe: GoogleDe, quem: Quem, dados: unknown) {
  const d = objeto(dados)
  const novo = d.novo === true
  const id = d.id === undefined && novo ? crypto.randomUUID() : uuid(d.id, 'id')
  await conferirQuem(db, quem)

  const atual = await lerEvento(db, id)
  const antes: Participantes = atual ? await lerParticipantes(db, id) : { perfis: [], emails: [] }
  let consultor: Pessoa
  if (atual) {
    if (!cuidaDoEvento(quem, atual)) throw semPermissaoNoEvento(quem, atual, antes.perfis.includes(quem.id))
    if (d.consultor_id !== undefined && uuid(d.consultor_id, 'consultor_id') !== atual.consultor_id) {
      throw recusa(409, 'consultor_fixo',
        'O consultor do evento não muda. Para levar o evento para a agenda de outra pessoa, apague e crie de novo.')
    }
    consultor = (await lerPessoa(db, atual.consultor_id))!
  } else {
    if (!novo) throw recusa(404, 'evento_nao_encontrado', NAO_EXISTE)
    consultor = await agendaDe(db, quem, d.consultor_id == null ? quem.id : uuid(d.consultor_id, 'consultor_id'))
  }
  // A central também não grava em consultoria arquivada (quem é dela já foi recusado em conferirQuem).
  if (ehCentral(quem) && await consultoriaArquivada(db, atual?.consultoria_id ?? consultor.consultoria_id)) {
    throw recusa(409, 'consultoria_arquivada', 'Esta consultoria está arquivada.')
  }

  const campos = lerCampos(d, atual)
  if (campos.cliente_id && campos.cliente_id !== atual?.cliente_id) await conferirCliente(db, quem, campos.cliente_id)
  const lista: Participantes = {
    perfis: d.participantes === undefined
      ? antes.perfis
      : listaDeIds(d.participantes, 'participantes').filter((p) => p !== consultor.id),
    emails: d.convidados === undefined ? antes.emails : listaDeEmails(d.convidados),
  }

  const google = await googleDe(consultor.id)
  if (google && atual?.com_meet && !campos.com_meet) {
    throw recusa(409, 'meet_fixo',
      'O Meet desta reunião já foi criado no Google e não sai pelo app. Para tirar o Meet, apague o evento e crie de novo.')
  }
  const evento: EventoParaOBanco = {
    ...campos,
    id,
    consultoria_id: consultor.consultoria_id!,
    consultor_id: consultor.id,
    criado_por: quem.id,
    meet_link: atual?.meet_link ?? null,
    meet_codigo: atual?.meet_codigo ?? null,
    google_evento_id: atual?.google_evento_id ?? null,
  }
  // Sem Google não há como criar nem mudar o Meet: fica como estava (evento novo: sem Meet).
  if (!google) Object.assign(evento, { com_meet: atual?.com_meet ?? false, gravar: atual?.gravar ?? false })

  // As regras do banco antes de qualquer coisa no Google.
  await gravarNoBanco(db, evento, lista, !atual, true)

  if (!google) {
    return {
      evento: await gravarNoBanco(db, evento, lista, !atual, false),
      aviso: `Fica só no app: ${consultor.nome} não conectou o Google.`,
    }
  }

  const emails = await emailsDosParticipantes(db, [...new Set([...lista.perfis, ...antes.perfis])])
  const convites = convitesPara(emails, lista)
  const passos: Passo[] = []
  let noGoogle: MeetNoGoogle
  try {
    noGoogle = atual?.google_evento_id
      ? await editarNoGoogle(google, atual, campos, convites, convitesPara(emails, antes), passos)
      : await criarNoGoogle(google, id, campos, convites, passos)
  } catch (erro) {
    await desfazer(passos)
    throw falhaDoGoogle(erro, consultor, quem)
  }

  try {
    const salvo = await gravarNoBanco(db, {
      ...evento,
      google_evento_id: noGoogle.googleEventoId,
      meet_link: noGoogle.meetLink ?? null,
      meet_codigo: noGoogle.meetCodigo ?? null,
    }, lista, !atual, false)
    return { evento: salvo }
  } catch (erro) {
    await desfazer(passos)
    throw erro
  }
}

// Apagar: cancela no Google do organizador (o Google avisa os convidados) e depois sai do banco, com os participantes.
// A pasta da reunião fica nos Arquivos do cliente (só perde o vínculo com o evento). Organizador sem Google: sai só do
// app, com aviso. Google recusou: nada muda.
export async function apagarEvento(db: Banco, googleDe: GoogleDe, quem: Quem, id: unknown) {
  const eventoId = uuid(id, 'id')
  await conferirQuem(db, quem)
  const atual = await lerEvento(db, eventoId)
  if (!atual) throw recusa(404, 'evento_nao_encontrado', NAO_EXISTE)
  if (!cuidaDoEvento(quem, atual)) {
    throw semPermissaoNoEvento(quem, atual, (await lerParticipantes(db, eventoId)).perfis.includes(quem.id))
  }

  let aviso: string | undefined
  if (atual.google_evento_id) {
    const organizador = (await lerPessoa(db, atual.consultor_id))!
    const google = await googleDe(atual.consultor_id)
    if (google) {
      try {
        await google.apagarEvento(atual.google_evento_id)
      } catch (erro) {
        throw falhaDoGoogle(erro, organizador, quem)
      }
    } else {
      aviso = `Saiu só do app: ${organizador.nome} não conectou o Google, e o evento continua no Google Agenda.`
    }
  }
  conferir(await db.from('agenda_eventos').delete().eq('id', eventoId))
  return aviso ? { ok: true, aviso } : { ok: true }
}

// O participante da casa confirma ou recusa o convite (só no app: no Google, quem responde é a pessoa, na agenda dela).
export async function responder(db: Banco, quem: Quem, id: unknown, resposta: unknown) {
  const eventoId = uuid(id, 'id')
  if (typeof resposta !== 'string' || !RESPOSTAS.includes(resposta)) invalido('resposta')
  await conferirQuem(db, quem)
  const naoConvidado = () => recusa(404, 'convite_nao_encontrado', 'Você não foi convidado para este evento.')
  const evento = conferir(await db.from('agenda_eventos').select('consultoria_id').eq('id', eventoId).maybeSingle())
  // Convite só vale na consultoria de quem responde (como na leitura: o convidado vê o evento da própria consultoria).
  if (!evento || evento.consultoria_id !== quem.consultoria_id) throw naoConvidado()
  const respondidos = conferir(
    await db.from('agenda_participantes').update({ resposta }).eq('evento_id', eventoId).eq('perfil_id', quem.id).select('id'),
  )
  if (!respondidos?.length) throw naoConvidado()
  return { ok: true, resposta }
}
