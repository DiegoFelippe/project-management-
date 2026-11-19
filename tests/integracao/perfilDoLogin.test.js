// A leitura do perfil no login, exatamente como o app faz (AuthProvider, CAMPOS_PERFIL: perfis com a consultoria e as
// preferências embutidas). Em 17/11 uma tabela nova em public, com chaves para perfis e consultorias na chave primária,
// fez o PostgREST achar duas ligações entre perfis e consultorias: a leitura respondeu HTTP 300 e ninguém entrava.
// Este teste pega qualquer ambiguidade parecida, venha de onde vier.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAMPOS_DA_VERIFICACAO, CAMPOS_PERFIL } from '../../src/auth/camposDoPerfil.js'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo } from './ambiente.js'

const admin = clienteAdmin()
let consultoria, nomeDaConsultoria, pessoa, central

beforeAll(async () => {
  nomeDaConsultoria = `Login ${Date.now()}`
  consultoria = await criarConsultoriaDeTeste(nomeDaConsultoria)
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: consultoria })
  central = await criarPerfilDeTeste({ papel: 'central' })
  const { error } = await admin.from('preferencias').insert({ pessoa_id: pessoa.id, tema: 'escuro' })
  if (error) throw error
})

afterAll(async () => {
  await limparTudo()
})

describe('perfil do login', () => {
  it('consultor: 200 e uma linha, com a consultoria e as preferências embutidas', async () => {
    const cliente = await entrarComo(pessoa)
    const { data, error, status } = await cliente.from('perfis').select(CAMPOS_PERFIL).eq('id', pessoa.id).maybeSingle()
    expect(error).toBeNull()
    expect(status).toBe(200)
    expect(data.id).toBe(pessoa.id)
    expect(data.consultoria).toEqual({ nome: nomeDaConsultoria, logo: null })
    expect(data.preferencias).toEqual({ tema: 'escuro' })
  })

  it('central (sem consultoria): 200 e uma linha', async () => {
    const cliente = await entrarComo(central)
    const { data, error, status } = await cliente.from('perfis').select(CAMPOS_PERFIL).eq('id', central.id).maybeSingle()
    expect(error).toBeNull()
    expect(status).toBe(200)
    expect(data.id).toBe(central.id)
    expect(data.consultoria).toBeNull()
  })

  it('a conferência da verificação (a cada tela) também responde', async () => {
    const cliente = await entrarComo(pessoa)
    const { data, error, status } = await cliente.from('perfis').select(CAMPOS_DA_VERIFICACAO).eq('id', pessoa.id).maybeSingle()
    expect(error).toBeNull()
    expect(status).toBe(200)
    expect(data).toHaveProperty('exige_2fa')
  })
})
