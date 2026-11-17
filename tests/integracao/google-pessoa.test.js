// Conectar e desconectar o Google de cada pessoa: o núcleo da Edge Function `google-pessoa` com o Google falso e
// o banco local de verdade (estado de uso único preso a quem pediu, escopos, Vault), e a função no ar (sem o app do
// Google configurado no local, ela para antes de falar com o Google).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { concluir, conectar, desconectar } from '../../supabase/functions/_shared/agenda/conexao.ts'
import { criarGoogleFalso } from '../../supabase/functions/_shared/agenda/google-falso.ts'
import { ESCOPOS_DA_PESSOA } from '../../supabase/functions/_shared/agenda/google.ts'
import { lerTokenDaPessoa } from '../../supabase/functions/_shared/agenda/tokens.ts'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  status,
} from './ambiente.js'

const admin = clienteAdmin()
const google = criarGoogleFalso()
const APP = { id: google.cliente.id, segredo: google.cliente.segredo, volta: 'http://localhost:5173/calendario' }
let consultoria

beforeAll(async () => {
  consultoria = await criarConsultoriaDeTeste()
})
afterAll(limparTudo)

const novaPessoa = () => criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
const conexao = async (id) =>
  (await admin.from('google_pessoas').select('email, escopos, erro, segredo_id').eq('perfil_id', id).maybeSingle()).data
const estadosDe = async (id) => (await admin.from('google_estados').select('estado').eq('perfil_id', id)).data
const trocasDeCodigo = () => google.pedidosPara('oauth2.googleapis.com/token').filter((p) => p.corpo.grant_type === 'authorization_code')

// A pessoa clica em "Conectar Google", autoriza com a conta `email` e volta para o app.
async function conectarDoComeco(pessoa, { email, escopos, semRefresh } = {}) {
  const { url } = await conectar({ banco: admin, app: APP, quem: pessoa })
  const volta = google.autorizar(url, { email: email ?? `g-${crypto.randomUUID()}@gmail.test`, escopos, semRefresh })
  return { url, ...volta }
}

describe('conectar', () => {
  it('monta o endereço do Google com os escopos da pessoa, acesso offline, consentimento e PKCE', async () => {
    const pessoa = await novaPessoa()
    const { url } = await conectar({ banco: admin, app: APP, quem: pessoa })
    const endereco = new URL(url)
    expect(`${endereco.origin}${endereco.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const busca = Object.fromEntries(endereco.searchParams)
    expect(busca).toMatchObject({
      client_id: APP.id,
      redirect_uri: APP.volta,
      response_type: 'code',
      scope: ESCOPOS_DA_PESSOA.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      login_hint: pessoa.email,
    })
    expect(busca).not.toHaveProperty('include_granted_scopes')
    expect(busca.state.length).toBeGreaterThanOrEqual(40)

    // o estado fica no banco preso a quem pediu, com o verificador do PKCE (que nunca vai no endereço)
    const { data: estado } = await admin.from('google_estados').select('perfil_id, verificador').eq('estado', busca.state).single()
    expect(estado.perfil_id).toBe(pessoa.id)
    expect(url).not.toContain(estado.verificador)
  })

  it('um pedido por pessoa: conectar de novo troca o estado anterior', async () => {
    const pessoa = await novaPessoa()
    await conectar({ banco: admin, app: APP, quem: pessoa })
    const { url } = await conectar({ banco: admin, app: APP, quem: pessoa })
    expect((await estadosDe(pessoa.id)).map((e) => e.estado)).toEqual([new URL(url).searchParams.get('state')])
  })

  it('sem o app do Google configurado avisa e não cria estado', async () => {
    const pessoa = await novaPessoa()
    await expect(conectar({ banco: admin, app: null, quem: pessoa })).rejects.toMatchObject({ status: 409, codigo: 'google_nao_configurado' })
    expect(await estadosDe(pessoa.id)).toEqual([])
  })
})

describe('concluir (volta do Google)', () => {
  it('troca o código com o PKCE, confere os escopos e guarda o token só no Vault', async () => {
    const pessoa = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(pessoa, { email: 'Ana.Consultora@Gmail.test' })
    const r = await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado, codigo })
    expect(r).toEqual({ email: 'ana.consultora@gmail.test' })

    const troca = trocasDeCodigo().at(-1)
    expect(troca.corpo).toMatchObject({ code: codigo, redirect_uri: APP.volta, client_id: APP.id })
    expect(troca.corpo.code_verifier.length).toBeGreaterThanOrEqual(43)

    const linha = await conexao(pessoa.id)
    expect(linha).toMatchObject({ email: 'ana.consultora@gmail.test', erro: null })
    expect([...linha.escopos].sort()).toEqual([...ESCOPOS_DA_PESSOA].sort())
    expect(linha.segredo_id).toBeTruthy()
    const token = await lerTokenDaPessoa(admin, pessoa.id)
    expect(token.refresh_token).toMatch(/^1\/\/falso-/)
    expect(JSON.stringify(r)).not.toContain(token.refresh_token)
    expect(await estadosDe(pessoa.id)).toEqual([]) // estado gasto

    // a pessoa lê só e-mail, quando conectou e o erro; nunca o segredo
    const comoPessoa = await entrarComo(pessoa)
    const { data: minha } = await comoPessoa.from('google_pessoas').select('email, conectado_em, erro').single()
    expect(minha.email).toBe('ana.consultora@gmail.test')
    expect((await comoPessoa.from('google_pessoas').select('segredo_id')).error).not.toBeNull()
  })

  it('estado de outra pessoa falha, é gasto e nada é gravado', async () => {
    const dona = await novaPessoa()
    const outra = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(dona)
    const trocasAntes = trocasDeCodigo().length

    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: outra, estado, codigo }))
      .rejects.toMatchObject({ status: 400, codigo: 'estado_invalido' })
    expect(trocasDeCodigo().length).toBe(trocasAntes) // o código nem foi trocado
    expect(await conexao(outra.id)).toBeNull()
    expect(await conexao(dona.id)).toBeNull()
    // o estado foi gasto: nem a dona consegue usá-lo depois
    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: dona, estado, codigo }))
      .rejects.toMatchObject({ codigo: 'estado_invalido' })
  })

  it('estado vale uma vez só e por 10 minutos', async () => {
    const pessoa = await novaPessoa()
    const primeira = await conectarDoComeco(pessoa)
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: primeira.estado, codigo: primeira.codigo })
    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: primeira.estado, codigo: primeira.codigo }))
      .rejects.toMatchObject({ codigo: 'estado_invalido' })

    const vencida = await conectarDoComeco(pessoa)
    const daquiOnzeMinutos = () => Date.now() + 11 * 60_000
    await expect(concluir({
      banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: vencida.estado, codigo: vencida.codigo, agora: daquiOnzeMinutos,
    })).rejects.toMatchObject({ codigo: 'estado_invalido' })
    expect(await estadosDe(pessoa.id)).toEqual([])
  })

  it('o código só vale com o verificador do mesmo estado (PKCE)', async () => {
    const pessoa = await novaPessoa()
    const primeira = await conectarDoComeco(pessoa)
    const { url } = await conectar({ banco: admin, app: APP, quem: pessoa })
    const outroEstado = new URL(url).searchParams.get('state')
    // código de um pedido com o estado (e o verificador) de outro
    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: outroEstado, codigo: primeira.codigo }))
      .rejects.toMatchObject({ status: 502, codigo: 'google_recusou' })
    expect(await conexao(pessoa.id)).toBeNull()
  })

  it('Google sem todas as permissões: recusa, revoga o que veio e não grava', async () => {
    const pessoa = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(pessoa, {
      escopos: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'],
    })
    const erro = await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado, codigo }).catch((e) => e)
    expect(erro).toMatchObject({ status: 400, codigo: 'google_sem_permissoes' })
    expect(erro.extra.faltam).toEqual([
      'https://www.googleapis.com/auth/meetings.space.settings',
      'https://www.googleapis.com/auth/meetings.space.readonly',
    ])
    expect(await conexao(pessoa.id)).toBeNull()
    const revogacao = google.pedidosPara('oauth2.googleapis.com/revoke').at(-1)
    expect(google.revogado(revogacao.corpo.token)).toBe(true)
  })

  it('sem token de renovação: recusa e não grava', async () => {
    const pessoa = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(pessoa, { semRefresh: true })
    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado, codigo }))
      .rejects.toMatchObject({ status: 502, codigo: 'google_recusou' })
    expect(await conexao(pessoa.id)).toBeNull()
  })

  it('reconectar troca o token no mesmo segredo do Vault, limpa o erro e troca a conta', async () => {
    const pessoa = await novaPessoa()
    const primeira = await conectarDoComeco(pessoa, { email: 'primeira@gmail.test' })
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: primeira.estado, codigo: primeira.codigo })
    const antes = await conexao(pessoa.id)
    const tokenAntes = await lerTokenDaPessoa(admin, pessoa.id)
    await admin.from('google_pessoas').update({ erro: 'O Google não aceita mais esta conexão. Reconecte o Google.' }).eq('perfil_id', pessoa.id)

    const segunda = await conectarDoComeco(pessoa, { email: 'segunda@gmail.test' })
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: segunda.estado, codigo: segunda.codigo })
    const depois = await conexao(pessoa.id)
    expect(depois).toMatchObject({ email: 'segunda@gmail.test', erro: null, segredo_id: antes.segredo_id })
    expect((await lerTokenDaPessoa(admin, pessoa.id)).refresh_token).not.toBe(tokenAntes.refresh_token)
  })

  it('reconectar sem todas as permissões mantém a conexão que já existia e não revoga nada', async () => {
    const pessoa = await novaPessoa()
    const primeira = await conectarDoComeco(pessoa, { email: 'mantida@gmail.test' })
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: primeira.estado, codigo: primeira.codigo })
    const tokenAntes = await lerTokenDaPessoa(admin, pessoa.id)
    const revogacoesAntes = google.pedidosPara('oauth2.googleapis.com/revoke').length

    const parcial = await conectarDoComeco(pessoa, { email: 'mantida@gmail.test', escopos: ['openid', 'email'] })
    await expect(concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado: parcial.estado, codigo: parcial.codigo }))
      .rejects.toMatchObject({ codigo: 'google_sem_permissoes' })
    expect(google.pedidosPara('oauth2.googleapis.com/revoke').length).toBe(revogacoesAntes)
    expect((await conexao(pessoa.id)).email).toBe('mantida@gmail.test')
    expect((await lerTokenDaPessoa(admin, pessoa.id)).refresh_token).toBe(tokenAntes.refresh_token)
    expect(google.revogado(tokenAntes.refresh_token)).toBe(false)
  })
})

describe('desconectar', () => {
  it('revoga no Google e apaga a conexão e o token do Vault', async () => {
    const pessoa = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(pessoa)
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado, codigo })
    const { refresh_token: renovacao } = await lerTokenDaPessoa(admin, pessoa.id)

    expect(await desconectar({ banco: admin, fetch: google.fetch, quem: pessoa })).toEqual({ ok: true, revogado: true })
    expect(google.pedidosPara('oauth2.googleapis.com/revoke').at(-1).corpo).toEqual({ token: renovacao })
    expect(google.revogado(renovacao)).toBe(true)
    expect(await conexao(pessoa.id)).toBeNull()
    expect(await lerTokenDaPessoa(admin, pessoa.id)).toBeNull()
  })

  it('Google fora do ar: apaga aqui mesmo assim e avisa que o Google não confirmou', async () => {
    const pessoa = await novaPessoa()
    const { estado, codigo } = await conectarDoComeco(pessoa)
    await concluir({ banco: admin, app: APP, fetch: google.fetch, quem: pessoa, estado, codigo })
    google.falhar({ url: 'oauth2.googleapis.com/revoke', status: 503 })
    expect(await desconectar({ banco: admin, fetch: google.fetch, quem: pessoa })).toEqual({ ok: true, revogado: false })
    expect(await conexao(pessoa.id)).toBeNull()
    expect(await lerTokenDaPessoa(admin, pessoa.id)).toBeNull()
  })

  it('sem conexão não fala com o Google', async () => {
    const pessoa = await novaPessoa()
    const antes = google.pedidosPara('oauth2.googleapis.com/revoke').length
    expect(await desconectar({ banco: admin, fetch: google.fetch, quem: pessoa })).toEqual({ ok: true, revogado: null })
    expect(google.pedidosPara('oauth2.googleapis.com/revoke').length).toBe(antes)
  })
})

// O Supabase local só serve uma Edge Function nova depois de recriar o runtime (npx supabase stop && npx supabase
// start; os dados ficam): `npm run functions:reiniciar` recarrega o código, mas não a lista de funções.
const servida = (await fetch(`${status.API_URL}/functions/v1/google-pessoa`, { method: 'OPTIONS' })).status !== 404
if (!servida) console.warn('google-pessoa ainda não está no runtime local: recrie-o (npx supabase stop && npx supabase start).')

describe.skipIf(!servida)('Edge Function google-pessoa (no ar)', () => {
  const funcao = (cliente, corpo) => chamarFuncao(cliente, 'google-pessoa', corpo)
  const novoEstado = async (pessoaId) => {
    const estado = `teste-${crypto.randomUUID()}${crypto.randomUUID()}`
    const { error } = await admin.from('google_estados').insert({ estado, perfil_id: pessoaId, verificador: 'v'.repeat(64) })
    if (error) throw error
    return estado
  }

  it('sem login: 401', async () => {
    expect((await funcao(null, { acao: 'conectar' })).status).toBe(401)
  })

  it('conectar sem o app do Google configurado na plataforma avisa', async () => {
    const pessoa = await novaPessoa()
    const r = await funcao(await entrarComo(pessoa), { acao: 'conectar' })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('google_nao_configurado')
  })

  it('concluir com o estado de outra pessoa: 400, e o estado é gasto', async () => {
    const dona = await novaPessoa()
    const outra = await novaPessoa()
    const estado = await novoEstado(dona.id)
    const r = await funcao(await entrarComo(outra), { acao: 'concluir', estado, codigo: '4/qualquer' })
    expect(r.status).toBe(400)
    expect(r.corpo.codigo).toBe('estado_invalido')
    expect(await estadosDe(dona.id)).toEqual([])

    // com o próprio estado a função passa da conferência e para no app que falta (sem falar com o Google)
    const meu = await novoEstado(dona.id)
    const minha = await funcao(await entrarComo(dona), { acao: 'concluir', estado: meu, codigo: '4/qualquer' })
    expect(minha.status).toBe(409)
    expect(minha.corpo.codigo).toBe('google_nao_configurado')
    expect(await estadosDe(dona.id)).toEqual([])
  })

  it('desconectar sem conexão responde ok; ação desconhecida é recusada', async () => {
    const pessoa = await novaPessoa()
    const como = await entrarComo(pessoa)
    const r = await funcao(como, { acao: 'desconectar' })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ ok: true, revogado: null })
    expect((await funcao(como, { acao: 'outra' })).status).toBe(400)
    expect((await funcao(como, { acao: 'concluir', estado: 123 })).corpo).toMatchObject({ codigo: 'dados_invalidos' })
  })
})
