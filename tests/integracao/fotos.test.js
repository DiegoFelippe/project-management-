import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  criarTimeDeTeste,
  entrarComo,
  limparTudo,
  status,
} from './ambiente.js'

const admin = clienteAdmin()
const enviados = new Set()
let A, pessoa, pessoaSolta, gestor, adminA, dono
let comoPessoa, comoGestor, comoAdminA, comoDono

const imagem = () => new Blob([new Uint8Array(64).fill(7)], { type: 'image/webp' })
const caminhoDe = (id) => `${id}/${randomUUID()}.webp`

async function enviar(cliente, caminho, arquivo = imagem(), contentType = 'image/webp', bucket = 'fotos') {
  const { error } = await cliente.storage.from(bucket).upload(caminho, arquivo, { contentType })
  if (!error) enviados.add(`${bucket}:${caminho}`)
  return error
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  dono = await criarPerfilDeTeste({ papel: 'dono' })
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaSolta = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  const time = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor.id })
  await admin.from('time_membros').insert({ time_id: time, pessoa_id: pessoa.id })
  comoPessoa = await entrarComo(pessoa)
  comoGestor = await entrarComo(gestor)
  comoAdminA = await entrarComo(adminA)
  comoDono = await entrarComo(dono)
})

afterAll(async () => {
  for (const bucket of ['fotos', 'logos']) {
    const caminhos = [...enviados].filter((e) => e.startsWith(`${bucket}:`)).map((e) => e.slice(bucket.length + 1))
    if (caminhos.length) await admin.storage.from(bucket).remove(caminhos)
  }
  await limparTudo()
})

describe('foto das pessoas', () => {
  it('a pessoa coloca a própria foto, que aparece pelo endereço público, e depois tira', async () => {
    const caminho = caminhoDe(pessoa.id)
    expect(await enviar(comoPessoa, caminho)).toBeNull()
    const { error } = await comoPessoa.from('perfis').update({ foto: caminho }).eq('id', pessoa.id)
    expect(error).toBeNull()
    const resposta = await fetch(`${status.API_URL}/storage/v1/object/public/fotos/${caminho}`)
    expect(resposta.status).toBe(200)
    const { error: erroTirar } = await comoPessoa.storage.from('fotos').remove([caminho])
    expect(erroTirar).toBeNull()
    await comoPessoa.from('perfis').update({ foto: null }).eq('id', pessoa.id)
    expect((await admin.from('perfis').select('foto').eq('id', pessoa.id).single()).data.foto).toBeNull()
  })

  it('ninguém coloca foto na pasta de quem não pode editar', async () => {
    expect(await enviar(comoPessoa, caminhoDe(pessoaSolta.id))).not.toBeNull()
    expect(await enviar(comoGestor, caminhoDe(pessoaSolta.id))).not.toBeNull()
    expect(await enviar(comoPessoa, `qualquer/${randomUUID()}.webp`)).not.toBeNull()
  })

  it('o gestor põe a foto de quem está no time dele; o administrador troca a de qualquer pessoa', async () => {
    expect(await enviar(comoGestor, caminhoDe(pessoa.id))).toBeNull()
    expect(await enviar(comoAdminA, caminhoDe(pessoaSolta.id))).toBeNull()
  })

  it('arquivo que não é imagem é recusado', async () => {
    const texto = new Blob(['oi'], { type: 'text/plain' })
    expect(await enviar(comoPessoa, `${pessoa.id}/${randomUUID()}.webp`, texto, 'text/plain')).not.toBeNull()
  })
})

describe('logo da consultoria', () => {
  it('o dono coloca a logo; o administrador não', async () => {
    const caminho = caminhoDe(A)
    expect(await enviar(comoDono, caminho, imagem(), 'image/webp', 'logos')).toBeNull()
    const { error } = await comoDono.from('consultorias').update({ logo: caminho }).eq('id', A)
    expect(error).toBeNull()
    expect((await admin.from('consultorias').select('logo').eq('id', A).single()).data.logo).toBe(caminho)
    expect(await enviar(comoAdminA, caminhoDe(A), imagem(), 'image/webp', 'logos')).not.toBeNull()
  })
})

describe('meu perfil', () => {
  it('cada um muda o próprio nome, mas não o próprio papel nem se desativa', async () => {
    const r = await chamarFuncao(comoPessoa, 'gerenciar-acesso', { acao: 'editar', pessoa_id: pessoa.id, nome: 'Meu Nome Novo' })
    expect(r.status).toBe(200)
    expect((await admin.from('perfis').select('nome').eq('id', pessoa.id).single()).data.nome).toBe('Meu Nome Novo')
    expect((await chamarFuncao(comoAdminA, 'gerenciar-acesso', { acao: 'editar', pessoa_id: adminA.id, papel: 'gestor' })).status).toBe(403)
    expect((await chamarFuncao(comoAdminA, 'gerenciar-acesso', { acao: 'desativar', pessoa_id: adminA.id })).status).toBe(403)
  })

  it('o tema escolhido fica salvo nas preferências da própria pessoa', async () => {
    const { error } = await comoPessoa.from('preferencias').upsert({ pessoa_id: pessoa.id, tema: 'escuro' })
    expect(error).toBeNull()
    const { error: deNovo } = await comoPessoa.from('preferencias').upsert({ pessoa_id: pessoa.id, tema: 'claro' })
    expect(deNovo).toBeNull()
    expect((await admin.from('preferencias').select('tema').eq('pessoa_id', pessoa.id).single()).data.tema).toBe('claro')
    const { error: deOutra } = await comoPessoa.from('preferencias').upsert({ pessoa_id: pessoaSolta.id, tema: 'escuro' })
    expect(deOutra).not.toBeNull()
  })
})
