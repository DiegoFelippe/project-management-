// Integrações da consultoria (desenho em docs/superpowers/specs/2026-11-12-integracoes-design.md).
// Um lugar só: `conexaoDa` dá a configuração e o segredo de uma integração para qualquer função que
// precise usar IA, e-mail, Google, Slack ou WhatsApp, e os testes de conexão ficam aqui também (os que falam só por
// HTTP, sem Deno, em conexoes.ts).
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import {
  type ConfigSlack,
  type ConfigWhatsapp,
  perguntarAIa,
  testarSlack,
  testarWhatsapp,
  validarConfigSlack,
  validarConfigWhatsapp,
} from './conexoes.ts'
import { appDoGoogle, comLimite, emailDoGoogle, tokenDoGoogle } from './google-oauth.ts'
import { Falha } from './http.ts'

// O OAuth do Google mora em google-oauth.ts (sem Deno, para os testes); quem já importava daqui continua igual.
export { appDoGoogle, emailDoGoogle, tokenDoGoogle }

export type Tipo = 'ia' | 'smtp' | 'google' | 'slack' | 'whatsapp'
export const TIPOS: Tipo[] = ['ia', 'smtp', 'google', 'slack', 'whatsapp']

export const MODELO_PADRAO = { anthropic: 'claude-opus-5-5' } as const

export type ConfigIa = { provedor: 'anthropic' | 'openai'; modelo: string }
export type ConfigSmtp = {
  host: string
  porta: number
  seguranca: 'ssl' | 'starttls' | 'nenhuma'
  usuario?: string
  remetente: string
  nome_remetente?: string
}
export type ConfigGoogle = { email: string; escopos: string[] }

const LIMITE_DO_TESTE_MS = 10_000

function invalido(campo: string): never {
  throw new Falha(400, 'dados_invalidos', { campo })
}

function texto(valor: unknown, campo: string, { min = 1, max = 255, opcional = false } = {}): string | undefined {
  if (valor == null || valor === '') {
    if (opcional) return undefined
    invalido(campo)
  }
  if (typeof valor !== 'string') invalido(campo)
  const limpo = valor.trim()
  if (limpo.length < min || limpo.length > max) invalido(campo)
  return limpo
}

// Confere a configuração (sem segredo) que chega do navegador, por tipo.
export function validarConfig(tipo: Tipo, bruto: unknown): ConfigIa | ConfigSmtp | ConfigSlack | ConfigWhatsapp {
  if (tipo === 'slack') return validarConfigSlack(bruto)
  if (tipo === 'whatsapp') return validarConfigWhatsapp(bruto)
  const config = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>
  if (tipo === 'ia') {
    const provedor = config.provedor
    if (provedor !== 'anthropic' && provedor !== 'openai') invalido('provedor')
    const modelo = texto(config.modelo, 'modelo', { max: 100, opcional: provedor === 'anthropic' }) ?? MODELO_PADRAO.anthropic
    return { provedor, modelo }
  }
  if (tipo === 'smtp') {
    const host = texto(config.host, 'host')!.toLowerCase()
    if (!/^[a-z0-9._-]+$/.test(host)) invalido('host')
    const porta = Number(config.porta)
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) invalido('porta')
    const seguranca = config.seguranca
    if (seguranca !== 'ssl' && seguranca !== 'starttls' && seguranca !== 'nenhuma') invalido('seguranca')
    const remetente = texto(config.remetente, 'remetente')!.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(remetente)) invalido('remetente')
    return {
      host,
      porta,
      seguranca,
      usuario: texto(config.usuario, 'usuario', { opcional: true }),
      remetente,
      nome_remetente: texto(config.nome_remetente, 'nome_remetente', { max: 120, opcional: true }),
    }
  }
  invalido('tipo')
}

// A mesma conexão para todo o sistema: configuração + segredo da integração da consultoria (ou null).
export async function conexaoDa(admin: SupabaseClient, consultoriaId: string, tipo: Tipo) {
  const { data, error } = await admin
    .from('integracoes')
    .select('id, config, situacao')
    .eq('consultoria_id', consultoriaId)
    .eq('tipo', tipo)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: segredo, error: erroSegredo } = await admin.rpc('integracao_segredo', { p_id: data.id })
  if (erroSegredo) throw erroSegredo
  return { id: data.id as string, config: data.config, situacao: data.situacao as string, segredo: (segredo as string | null) ?? null }
}

// ---------- Testes de conexão (lançam Error com a mensagem para a tela) ----------

async function testarIa(config: ConfigIa, chave: string | null) {
  if (!chave) throw new Error('Falta a chave de API.')
  if (config.provedor === 'anthropic') {
    const cliente = new Anthropic({ apiKey: chave, maxRetries: 0, timeout: LIMITE_DO_TESTE_MS })
    try {
      await cliente.models.list({ limit: 1 })
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) throw new Error('A Anthropic recusou a chave de API.')
      if (erro instanceof Anthropic.PermissionDeniedError) throw new Error('A chave não tem permissão para usar a API.')
      if (erro instanceof Anthropic.APIConnectionError) throw new Error('Não foi possível falar com a Anthropic.')
      if (erro instanceof Anthropic.APIError) throw new Error(`A Anthropic respondeu com erro ${erro.status ?? ''}.`.trim())
      throw erro
    }
    return
  }
  let resposta: Response
  try {
    resposta = await comLimite(fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${chave}` } }))
  } catch {
    throw new Error('Não foi possível falar com a OpenAI.')
  }
  await resposta.body?.cancel()
  if (resposta.status === 401) throw new Error('A OpenAI recusou a chave de API.')
  if (!resposta.ok) throw new Error(`A OpenAI respondeu com erro ${resposta.status}.`)
}

// Fora do ambiente local, o teste de SMTP só fala com servidores públicos e nas portas de e-mail
// (não serve para sondar a rede interna). No Supabase local, o Mailpit fica na rede do Docker.
const AMBIENTE_LOCAL = (Deno.env.get('SUPABASE_URL') ?? '').startsWith('http://kong:')
const PORTAS_DE_EMAIL = [25, 465, 587, 2525]

function ipPrivado(ip: string): boolean {
  if (ip.includes(':')) return /^(::1?$|f[cd]|fe80|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip)
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127)
}

async function conferirDestino(config: ConfigSmtp) {
  if (AMBIENTE_LOCAL) return
  if (!PORTAS_DE_EMAIL.includes(config.porta)) throw new Error('Use uma porta de e-mail: 25, 465, 587 ou 2525.')
  if (!config.host.includes('.')) throw new Error('Use o endereço completo do servidor (ex.: smtp.empresa.com).')
  const enderecos = /^[\d.]+$/.test(config.host)
    ? [config.host]
    : [...(await Deno.resolveDns(config.host, 'A').catch(() => [])), ...(await Deno.resolveDns(config.host, 'AAAA').catch(() => []))]
  if (!enderecos.length) throw new Error('Não achamos esse servidor.')
  if (enderecos.some(ipPrivado)) throw new Error('Esse servidor não é público.')
}

const base64 = (valor: string) => btoa(String.fromCharCode(...new TextEncoder().encode(valor)))

// Nome no cabeçalho: entre aspas, ou codificado (RFC 2047) quando tem acento. Quebra de linha nunca entra.
function nomeNoCabecalho(nome: string): string {
  const limpo = nome.replace(/[\r\n]+/g, ' ')
  return /^[\x20-\x7e]*$/.test(limpo) ? `"${limpo.replace(/["\\]/g, '\\$&')}"` : `=?UTF-8?B?${base64(limpo)}?=`
}

// O e-mail do "Testar" na janela (texto simples, em base64 para os acentos).
function emailDeTeste(config: ConfigSmtp, para: string): string {
  const de = config.nome_remetente ? `${nomeNoCabecalho(config.nome_remetente)} <${config.remetente}>` : config.remetente
  const corpo = base64([
    'Este é um e-mail de teste da IXC Consult.',
    '',
    'Ele foi enviado pelo botão Testar da tela Integrações, para conferir o servidor de e-mail da consultoria.',
    'Se você recebeu, está funcionando.',
  ].join('\r\n'))
  return [
    `From: ${de}`,
    `To: <${para}>`,
    'Subject: Teste da IXC Consult',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@ixc-consult>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    ...(corpo.match(/.{1,76}/g) ?? []),
    '.',
  ].join('\r\n')
}

// Conecta, faz login quando há usuário e sai. Com `destinatario`, manda antes o e-mail de teste para ele.
async function testarSmtp(config: ConfigSmtp, senha: string | null, { destinatario }: { destinatario?: string } = {}) {
  await conferirDestino(config)
  let conexao: Deno.Conn | undefined
  const fechar = () => {
    try {
      conexao?.close()
    } catch {
      // já fechada
    }
  }
  const conversa = async () => {
    try {
      conexao = config.seguranca === 'ssl'
        ? await Deno.connectTls({ hostname: config.host, port: config.porta })
        : await Deno.connect({ hostname: config.host, port: config.porta })
    } catch {
      throw new Error('Não foi possível conectar ao servidor de e-mail.')
    }
    const decodificador = new TextDecoder()
    let acumulado = ''
    const ler = async (codigo: number): Promise<string> => {
      const pedaco = new Uint8Array(4096)
      while (true) {
        const linhas = acumulado.split('\r\n')
        const fim = linhas.findIndex((l) => /^\d{3} /.test(l))
        if (fim >= 0) {
          const resposta = linhas.slice(0, fim + 1).join('\n')
          acumulado = linhas.slice(fim + 1).join('\r\n')
          if (!resposta.startsWith(String(codigo))) {
            if (codigo === 235) throw new Error('O servidor recusou o usuário ou a senha.')
            throw new Error(`O servidor respondeu: ${resposta.split('\n').pop()?.slice(0, 120)}`)
          }
          return resposta
        }
        const lidos = await conexao!.read(pedaco)
        if (lidos === null) throw new Error('O servidor fechou a conexão.')
        acumulado += decodificador.decode(pedaco.subarray(0, lidos))
      }
    }
    const enviar = (linha: string) => conexao!.write(new TextEncoder().encode(`${linha}\r\n`))

    await ler(220)
    await enviar('EHLO ixc-consult')
    let ehlo = await ler(250)
    if (config.seguranca === 'starttls') {
      if (!/STARTTLS/i.test(ehlo)) throw new Error('O servidor não oferece STARTTLS nessa porta.')
      await enviar('STARTTLS')
      await ler(220)
      conexao = await Deno.startTls(conexao as Deno.TcpConn, { hostname: config.host })
      await enviar('EHLO ixc-consult')
      ehlo = await ler(250)
    }
    if (config.usuario) {
      if (!/AUTH/i.test(ehlo)) throw new Error('O servidor não pede login; deixe o usuário em branco.')
      await enviar('AUTH LOGIN')
      await ler(334)
      await enviar(base64(config.usuario))
      await ler(334)
      await enviar(base64(senha ?? ''))
      await ler(235)
    }
    if (destinatario) {
      await enviar(`MAIL FROM:<${config.remetente}>`)
      await ler(250)
      await enviar(`RCPT TO:<${destinatario}>`)
      await ler(250)
      await enviar('DATA')
      await ler(354)
      await enviar(emailDeTeste(config, destinatario))
      await ler(250)
    }
    await enviar('QUIT')
  }
  try {
    await comLimite(conversa(), fechar)
  } finally {
    fechar()
  }
}

// Google: troca o token guardado (refresh) por um de acesso e lê o e-mail da conta (funções em google-oauth.ts).
export const ESCOPOS_DO_GOOGLE = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.file',
]

async function testarGoogle(tokenGuardado: string | null) {
  const app = appDoGoogle()
  if (!app) throw new Error('Falta configurar o app do Google na plataforma.')
  if (!tokenGuardado) throw new Error('Conecte a conta do Google de novo.')
  const { access_token } = await tokenDoGoogle({
    client_id: app.id, client_secret: app.segredo, refresh_token: tokenGuardado, grant_type: 'refresh_token',
  })
  await emailDoGoogle(access_token)
}

const mensagemDoErro = (erro: unknown) =>
  (erro instanceof Error ? erro.message : 'Não foi possível testar a conexão.').slice(0, 500)

// Testa a conexão e grava o resultado na tabela. Devolve o estado para a tela.
// `enviar`: o Slack também manda a mensagem de teste no canal da configuração (o Testar da linha; salvar não manda).
// Slack e WhatsApp guardam na configuração o que o teste leu do serviço (workspace e bot; número e nome verificado).
export async function testarERegistrar(admin: SupabaseClient, id: string, { enviar = false } = {}) {
  const { data: linha, error } = await admin.from('integracoes').select('id, tipo, config').eq('id', id).single()
  if (error) throw error
  const { data: segredo } = await admin.rpc('integracao_segredo', { p_id: id })
  let ultimoErro: string | null = null
  let lido: Record<string, string> | undefined
  try {
    if (linha.tipo === 'ia') await testarIa(linha.config, segredo)
    else if (linha.tipo === 'smtp') await testarSmtp(linha.config, segredo)
    else if (linha.tipo === 'slack') lido = (await testarSlack(linha.config, segredo, { enviar })).dados
    else if (linha.tipo === 'whatsapp') lido = (await testarWhatsapp(linha.config, segredo)).dados
    else await testarGoogle(segredo)
  } catch (erro) {
    ultimoErro = mensagemDoErro(erro)
  }
  const situacao = ultimoErro ? 'com_erro' : 'conectada'
  const ultimoTesteEm = new Date().toISOString()
  const { error: erroGravar } = await admin
    .from('integracoes')
    .update({ situacao, ultimo_erro: ultimoErro, ultimo_teste_em: ultimoTesteEm, ...(lido ? { config: { ...linha.config, ...lido } } : {}) })
    .eq('id', id)
  if (erroGravar) throw erroGravar
  return { id, situacao, ultimo_erro: ultimoErro, ultimo_teste_em: ultimoTesteEm }
}

// "Testar" dentro da janela: testa o que foi digitado, sem gravar nada (nem o resultado). A IA responde a uma pergunta
// curta, o SMTP manda um e-mail para quem testa, o Slack manda a mensagem no canal (se houver) e o WhatsApp, o modelo
// hello_world para o número do teste (se houver). Devolve { funcionou, mensagem } ou { funcionou: false, erro }.
export async function testarRascunho(tipo: Tipo, config: any, segredo: string | null,
  { destinatario, numeroDeTeste = null }: { destinatario: string; numeroDeTeste?: string | null }) {
  try {
    let mensagem: string
    if (tipo === 'ia') mensagem = (await perguntarAIa(config, segredo)).mensagem
    else if (tipo === 'smtp') {
      await testarSmtp(config, segredo, { destinatario })
      mensagem = `E-mail de teste enviado para ${destinatario}.`
    } else if (tipo === 'slack') mensagem = (await testarSlack(config, segredo, { enviar: true })).mensagem
    else if (tipo === 'whatsapp') mensagem = (await testarWhatsapp(config, segredo, { numeroDeTeste })).mensagem
    else throw new Falha(400, 'dados_invalidos', { campo: 'tipo' })
    return { funcionou: true, mensagem }
  } catch (erro) {
    if (erro instanceof Falha) throw erro
    return { funcionou: false, erro: mensagemDoErro(erro) }
  }
}
