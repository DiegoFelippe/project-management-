// Agenda. O banco (RLS) decide quem vê cada evento; quem grava é a Edge Function `agenda`, que mexe no Google junto.
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

// Eventos que tocam o período [de, ate) (ISO), com consultor, cliente e participantes (com nome) numa chamada só:
// { itens, haMais }. O banco decide quem vê o quê e usa índice por papel; consultorId, consultoriaId, clienteId e tipo
// ('reunioes' = com cliente, 'compromissos' = sem cliente; o "Mostrar" da tela) são filtros opcionais rodados lá.
// haMais avisa que o período tem mais eventos do que o teto da chamada (1.000).
export async function eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId, tipo } = {}) {
  const { data, error } = await supabase.rpc('eventos_do_periodo', {
    p_de: de,
    p_ate: ate,
    p_consultor: consultorId ?? null,
    p_consultoria: consultoriaId ?? null,
    p_cliente: clienteId ?? null,
    p_tipo: tipo ?? null,
  })
  if (error) throw error
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// Quem a janela do evento oferece para convidar: as pessoas ativas da consultoria do evento, pelo nome (busca no banco,
// sem acento), `limite` por vez: { itens: [{ id, nome, cor }], total }. O consultor não lê os colegas direto; a função
// do banco devolve só isso, e só da consultoria de quem pergunta (a central, de qualquer uma). total = os que vieram.
export async function pessoasParaConvidar({ consultoriaId, termo = '', limite = 20 } = {}) {
  if (!consultoriaId) return { itens: [], total: 0 }
  const { data, error } = await supabase.rpc('pessoas_para_convidar', {
    p_consultoria: consultoriaId,
    p_busca: termo?.trim() || null,
    p_limite: limite,
  })
  if (error) throw error
  const itens = data ?? []
  return { itens, total: itens.length }
}

// Um evento no mesmo formato dos itens acima; null quando não existe ou a pessoa não pode vê-lo.
export async function buscarEvento(id) {
  const { data, error } = await supabase.rpc('evento_da_agenda', { p_id: id })
  if (error) throw error
  return data
}

// { semana, mes, aguardando, pastas_no_mes } no recorte de quem chama; dia: 'AAAA-MM-DD'. clienteId (a aba Agenda do
// cliente): só as reuniões daquele cliente, ainda dentro do que a pessoa vê (o banco recorta).
export async function indicadoresDaAgenda(dia, { clienteId } = {}) {
  const { data, error } = await supabase.rpc('indicadores_da_agenda', { p_dia: dia, p_cliente: clienteId ?? null })
  if (error) throw error
  return data
}

// Ausências (dias inteiras) que tocam o período, com o nome de quem se ausenta: { itens, haMais }; de e ate:
// 'AAAA-MM-DD' (inclusive). Vem de uma função do banco (o gestor lê as ausências da consultoria sem precisar ler o
// perfil de cada consultor); cada item: { id, perfil_id, de, ate, motivo, pessoa: { id, nome, cor } }.
export async function ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId } = {}) {
  const { data, error } = await supabase.rpc('ausencias_do_periodo', {
    p_de: de,
    p_ate: ate,
    p_consultor: consultorId ?? null,
    p_consultoria: consultoriaId ?? null,
  })
  if (error) throw error
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// Feriados nacionais entre duas datas ('AAAA-MM-DD', inclusive): lista de datas.
export async function feriadosDoPeriodo(de, ate) {
  const { data, error } = await supabase.rpc('feriados_do_periodo', { p_de: de, p_ate: ate })
  if (error) throw error
  return data ?? []
}

// O Google que eu conectei: { conectado, email, erro }. O banco só devolve e-mail, quando conectou e o erro
// (nunca o token), e só da minha linha.
export async function meuGoogle() {
  const { data, error } = await supabase.from('google_pessoas').select('email, conectado_em, erro').maybeSingle()
  if (error) throw error
  return { conectado: Boolean(data), email: data?.email ?? null, erro: data?.erro ?? null }
}

// ── Criar, editar, apagar e responder (Edge Function agenda: grava no Google do organizador e depois no banco) ──

// Id de um evento novo. A janela de "Novo evento" pede um quando abre e manda o mesmo em todas as tentativas: se a
// resposta de uma tentativa se perder, a próxima não duplica o evento no Google (o id do evento no Google sai deste).
export const novoIdDeEvento = () => crypto.randomUUID()

async function agenda(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('agenda', corpo)
  if (status === 200) return { erro: null, ...resposta }
  // A função manda o motivo em português (inclusive a recusa do Google); sem ele, vale a tradução do código.
  return { erro: resposta.erro ?? traduzirErroFuncao(resposta.codigo), campo: resposta.campo ?? null }
}

// Criar ({ id: novoIdDeEvento(), novo: true, ... }) ou editar ({ id, ... }; o que não vier fica como está):
// { erro, evento, aviso }. Campos: consultor_id (de quem é a agenda; padrão: quem cria), cliente_id, titulo, descricao,
// inicio e fim (ISO), dia_inteiro, cor (0 a 7), com_meet, gravar, participantes (ids dos consultores) e convidados
// (e-mails de fora, até 20). O evento volta no formato de eventosDoPeriodo. aviso: "Fica só no app: <nome> não conectou
// o Google." quando o organizador não conectou (o evento fica sem Meet). Erro: { erro, campo } (campo nos dados
// inválidos). O consultor de um evento não muda, e o Meet, depois de criado, não sai pelo app.
export async function salvarEvento(evento) {
  const r = await agenda({ acao: 'salvar', evento })
  return r.erro ? { erro: r.erro, campo: r.campo } : { erro: null, evento: r.evento, aviso: r.aviso ?? null }
}

// Apaga: cancela no Google do organizador (o Google avisa os convidados); a pasta da reunião fica nos Arquivos do
// cliente. { erro, aviso } (aviso quando saiu só do app).
export async function apagarEvento(id) {
  const r = await agenda({ acao: 'apagar', id })
  return r.erro ? { erro: r.erro, campo: r.campo } : { erro: null, aviso: r.aviso ?? null }
}

// O participante da casa responde ao convite: resposta 'confirmou' | 'recusou' → { erro, resposta }.
export async function responderConvite(id, resposta) {
  const r = await agenda({ acao: 'responder', id, resposta })
  return r.erro ? { erro: r.erro, campo: r.campo } : { erro: null, resposta: r.resposta }
}

// ── Depois da reunião (Edge Function reunioes-depois: a pasta com a transcrição e a documentação) ──

async function reunioesDepois(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('reunioes-depois', corpo)
  if (status === 200) return { erro: null, reuniao: resposta.reuniao }
  return { erro: resposta.erro ?? traduzirErroFuncao(resposta.codigo) }
}

// "Buscar agora" no detalhe de uma reunião com Meet que já terminou (quem edita o evento): busca no Google do
// organizador a gravação e a transcrição e, se a transcrição está pronta, cria a pasta da reunião no cliente.
// { erro, reuniao: { reuniao, reuniao_erro, pasta_id, gravacao_url } }. reuniao: 'aguardando' (a transcrição ainda não
// ficou pronta), 'pasta_criada', 'sem_artefatos' (48 h sem transcrição) ou 'erro' (reuniao_erro diz o motivo, ex.:
// "Conecte o Google para buscar a gravação"). Reunião já fechada volta como está.
export function buscarAgora(id) {
  return reunioesDepois({ acao: 'buscarAgora', id })
}

// "Tentar de novo" numa reunião com erro ou sem gravação/transcrição: volta a buscar. Mesma resposta de buscarAgora.
export function tentarDeNovo(id) {
  return reunioesDepois({ acao: 'tentarDeNovo', id })
}

// ── Conectar o meu Google (Edge Function google-pessoa; o token nunca chega ao navegador) ──

async function googlePessoa(corpo) {
  const { status, corpo: resposta } = await chamarFuncao('google-pessoa', corpo)
  if (status === 200) return { erro: null, ...resposta }
  return { erro: traduzirErroFuncao(resposta.codigo) }
}

// "Conectar Google": { erro, url }. A tela leva a pessoa para a url (window.location.assign); o Google volta para
// /calendario com ?code=…&state=… (ou ?error=…), e a tela chama concluirGoogle com o que voltaDoGoogle leu.
export async function conectarGoogle() {
  const { erro, url } = await googlePessoa({ acao: 'conectar' })
  return erro ? { erro } : { erro: null, url }
}

// O que o Google devolveu na volta para /calendario: { estado, codigo, recusou } ou null quando a página não veio
// do Google. busca: location.search (texto) ou URLSearchParams.
export function voltaDoGoogle(busca) {
  const parametros = busca instanceof URLSearchParams ? busca : new URLSearchParams(busca ?? '')
  const estado = parametros.get('state')
  if (!estado) return null
  const codigo = parametros.get('code')
  if (codigo) return { estado, codigo, recusou: false }
  return parametros.get('error') ? { estado, codigo: null, recusou: true } : null
}

// Nomes, para a pessoa, das permissões que ela pode desmarcar na tela do Google.
const PERMISSOES_DO_GOOGLE = {
  openid: 'a identificação da conta',
  email: 'o e-mail da conta',
  'https://www.googleapis.com/auth/calendar.events': 'os eventos da agenda',
  'https://www.googleapis.com/auth/meetings.space.settings': 'as configurações do Meet (gravação e transcrição)',
  'https://www.googleapis.com/auth/meetings.space.readonly': 'a leitura das reuniões do Meet',
}

function faltouNoGoogle(faltam) {
  const nomes = (Array.isArray(faltam) ? faltam : []).map((e) => PERMISSOES_DO_GOOGLE[e]).filter(Boolean)
  if (!nomes.length) return traduzirErroFuncao('google_sem_permissoes')
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]
  return `Faltou autorizar no Google ${lista}. Clique em Conectar Google de novo e marque todas as permissões.`
}

// Termina a conexão: { erro, email } (o e-mail da conta do Google conectada). Quando a pessoa desmarcou permissões no
// Google, o erro diz quais e `faltam` traz os escopos.
export async function concluirGoogle({ estado, codigo }) {
  const { status, corpo } = await chamarFuncao('google-pessoa', { acao: 'concluir', estado, codigo })
  if (status === 200) return { erro: null, email: corpo.email }
  if (corpo.codigo === 'google_sem_permissoes') return { erro: faltouNoGoogle(corpo.faltam), faltam: corpo.faltam ?? [] }
  return { erro: traduzirErroFuncao(corpo.codigo) }
}

// Desconectar: revoga no Google e apaga a conexão. revogado false = apagou aqui, mas o Google não confirmou.
export async function desconectarGoogle() {
  const { erro, revogado } = await googlePessoa({ acao: 'desconectar' })
  return erro ? { erro } : { erro: null, revogado }
}
