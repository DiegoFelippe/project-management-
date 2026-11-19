// Caminho completo dos clientes no Supabase local: central cria e manda, o gestor (sem times) escolhe
// o consultor, a lista traz as relações calculadas, a busca é escapada e o realizado respeita as permissões.
import { padraoDeBusca } from '../../src/lib/busca.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const admin = clienteAdmin()
const CAMPOS_DA_LISTA =
  'id, nome, cidade, horas_mes, consultoria_id, consultor_id, consultoria:consultorias(id, nome), ' +
  'consultor(id, nome, foto, ativo), realizado_no_mes'
// Os mesmos campos de src/data/checkins.js.
const CAMPOS_DOS_CHECKINS =
  'id, inicio, fim, descricao, consultor_id, consultoria_id, consultor:consultor_do_checkin(nome), ' +
  'cliente:cliente_do_checkin(id, nome)'

let A, B
let central, gestorA, pessoaA, adminB
let comoCentral, comoGestor, comoPessoa, comoAdminB
let clienteId

async function novoCliente(nome, extras = {}) {
  const { data, error } = await comoCentral
    .from('clientes')
    .insert({ nome, horas_mes: 10, ...extras })
    .select('id')
    .single()
  if (error) throw error
  registrarCliente(data.id)
  return data.id
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  central = await criarPerfilDeTeste({ papel: 'central' })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  // Desempate da ordem por nome: a pessoa vem antes do gestor quando os dois estão sem clientes.
  await admin.from('perfis').update({ nome: 'Aaa pessoa' }).eq('id', pessoaA.id)
  comoCentral = await entrarComo(central)
  comoGestor = await entrarComo(gestorA)
  comoPessoa = await entrarComo(pessoaA)
  comoAdminB = await entrarComo(adminB)
})

afterAll(limparTudo)

describe('clientes de ponta a ponta', () => {
  it('central cria o cliente e manda para a consultoria A', async () => {
    clienteId = await novoCliente('Cooperativa Chapecó', { cidade: 'Chapecó', uf: 'SC' })
    const { error } = await comoCentral.from('clientes').update({ consultoria_id: A }).eq('id', clienteId)
    expect(error).toBeNull()
  })

  it('gestor sem times vê a pessoa na ocupação e a escolhe como consultor', async () => {
    const { data, error } = await comoGestor.rpc('consultores_por_ocupacao', { p_consultoria: A })
    expect(error).toBeNull()
    const nossos = data.filter((l) => [pessoaA.id, gestorA.id].includes(l.id))
    expect(nossos[0].id).toBe(pessoaA.id)
    expect(data[0].id).toBe(pessoaA.id)
    expect(data[0].total).toBeGreaterThanOrEqual(2)

    const { data: linhas, error: erroEscolha } = await comoGestor
      .from('clientes')
      .update({ consultor_id: pessoaA.id })
      .eq('id', clienteId)
      .select('id')
    expect(erroEscolha).toBeNull()
    expect(linhas).toHaveLength(1)

    const { data: lista, error: erroLista } = await comoGestor
      .from('clientes')
      .select(CAMPOS_DA_LISTA)
      .eq('id', clienteId)
      .not('consultoria_id', 'is', null)
      .not('consultor_id', 'is', null)
      .eq('arquivado', false)
    expect(erroLista).toBeNull()
    expect(lista).toHaveLength(1)
    expect(lista[0].consultor.nome).toBe('Aaa pessoa')
    expect(lista[0].consultoria.id).toBe(A)
  })

  it('16 clientes em A: a primeira página traz 15 e o total é 16', async () => {
    for (let i = 0; i < 15; i += 1) {
      await novoCliente(`Paginado ${String(i).padStart(2, '0')}`, { consultoria_id: A })
    }
    const { data, count, error } = await comoCentral
      .from('clientes')
      .select('id', { count: 'exact' })
      .eq('consultoria_id', A)
      .order('nome')
      .order('id')
      .range(0, 14)
    expect(error).toBeNull()
    expect(data).toHaveLength(15)
    expect(count).toBe(16)
  })

  it('busca sem acento acha Chapecó; termo com caracteres especiais não dá erro nem amplia', async () => {
    const achou = await comoCentral.from('clientes').select('id').eq('consultoria_id', A).ilike('busca', '%chapeco%')
    expect(achou.error).toBeNull()
    expect(achou.data.map((l) => l.id)).toEqual([clienteId])

    const estranho = await comoCentral.from('clientes').select('id').ilike('busca', padraoDeBusca('50%_(x),y*'))
    expect(estranho.error).toBeNull()
    expect(estranho.data).toHaveLength(0)
    expect(padraoDeBusca('50%_(x),y*')).toBe('%50\\%\\_(x),y%')
    expect(padraoDeBusca('cHAPeCó*')).toBe('%chapeco%')
  })

  it('check-in e check-out; realizado_no_mes aparece para a pessoa, o gestor e a central, não para a outra consultoria', async () => {
    const { data: aberto, error } = await comoPessoa.from('checkins').insert({ cliente_id: clienteId }).select('id').single()
    expect(error).toBeNull()
    // fecha 1 hora depois do início (o início vai para uma hora atrás)
    const inicio = new Date(Date.now() - 3600_000).toISOString()
    await admin.from('checkins').update({ inicio }).eq('id', aberto.id)
    const { error: erroFim } = await comoPessoa
      .from('checkins')
      .update({ fim: new Date().toISOString(), descricao: 'Reunião de alinhamento' })
      .eq('id', aberto.id)
    expect(erroFim).toBeNull()

    for (const quem of [comoPessoa, comoGestor, comoCentral]) {
      const { data } = await quem.from('clientes').select('id, realizado_no_mes').eq('id', clienteId).single()
      expect(Number(data.realizado_no_mes)).toBeGreaterThan(0.9)
    }
    const { data: deB } = await comoAdminB.from('checkins').select('id').eq('cliente_id', clienteId)
    expect(deB).toHaveLength(0)

    const { data: dela } = await comoPessoa
      .from('checkins')
      .select(CAMPOS_DOS_CHECKINS)
      .order('inicio', { ascending: false })
    expect(dela[0].cliente.nome).toBe('Cooperativa Chapecó')
    expect(dela[0].consultor.nome).toBe('Aaa pessoa')
  })

  it('o gestor sem times vê o nome de quem fez o check-in (pela relação calculada, não por perfis)', async () => {
    const { data, error } = await comoGestor
      .from('checkins')
      .select(`${CAMPOS_DOS_CHECKINS}, pelo_perfil:perfis(nome)`)
      .eq('cliente_id', clienteId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0].consultor.nome).toBe('Aaa pessoa')
    // Em perfis o gestor só enxerga quem criou e as pessoas dos times dele: por isso a relação calculada.
    expect(data[0].pelo_perfil).toBeNull()

    const { data: deB } = await comoAdminB.from('checkins').select(CAMPOS_DOS_CHECKINS).eq('cliente_id', clienteId)
    expect(deB).toHaveLength(0)
  })

  it('central pede as consultorias por ocupação e A vem primeiro se estiver menos ocupada', async () => {
    const { data, error } = await comoCentral.rpc('consultorias_por_ocupacao', { p_limite: 50 })
    expect(error).toBeNull()
    const ids = data.map((l) => l.id)
    expect(ids).toContain(A)
    expect(ids).toContain(B)
    const a = data.find((l) => l.id === A)
    const b = data.find((l) => l.id === B)
    // Ocupação é número ou nulo (capacidade 0), nunca ausente; nulo vai para o fim.
    for (const l of [a, b]) expect(l.ocupacao === null || typeof Number(l.ocupacao) === 'number').toBe(true)
    expect('ocupacao' in a && 'ocupacao' in b).toBe(true)
    const chave = (l) => (l.ocupacao === null ? Infinity : Number(l.ocupacao))
    expect(ids.indexOf(A) < ids.indexOf(B)).toBe(chave(a) <= chave(b))
    expect(a.reservado).not.toBeUndefined()
  })
})

// "Desfazer" dos avisos de Mandar e Escolher consultor (usabilidade, U3): pela API, com a RLS de verdade, o banco só volta
// atrás se o cliente está como a ação deixou.
describe('Desfazer o envio e a escolha', () => {
  const estado = async (id) =>
    (await admin.from('clientes').select('consultoria_id, consultor_id').eq('id', id).single()).data

  it('a Central desfaz o envio que ninguém mexeu: o cliente volta para a Central', async () => {
    const id = await novoCliente('Desfazer envio')
    await comoCentral.from('clientes').update({ consultoria_id: A }).eq('id', id)
    const { error } = await comoCentral.rpc('desfazer_envio', { p_cliente: id, p_consultoria: A })
    expect(error).toBeNull()
    expect(await estado(id)).toEqual({ consultoria_id: null, consultor_id: null })
  })

  it('a consultoria escolheu o consultor nos 10 s do aviso: o Desfazer da Central é recusado e nada muda', async () => {
    const id = await novoCliente('Desfazer depois da escolha')
    await comoCentral.from('clientes').update({ consultoria_id: A }).eq('id', id)
    await comoGestor.from('clientes').update({ consultor_id: pessoaA.id }).eq('id', id)
    const { error } = await comoCentral.rpc('desfazer_envio', { p_cliente: id, p_consultoria: A })
    expect(error?.message).toBe('cliente_mudou')
    expect(await estado(id)).toEqual({ consultoria_id: A, consultor_id: pessoaA.id })
  })

  it('a gestão desfaz a escolha enquanto o consultor é o mesmo; trocado no meio, é recusado', async () => {
    const id = await novoCliente('Desfazer escolha')
    await comoCentral.from('clientes').update({ consultoria_id: A }).eq('id', id)
    await comoGestor.from('clientes').update({ consultor_id: pessoaA.id }).eq('id', id)
    expect((await comoGestor.rpc('desfazer_escolha', { p_cliente: id, p_consultor: gestorA.id })).error?.message)
      .toBe('cliente_mudou')
    expect((await comoGestor.rpc('desfazer_escolha', { p_cliente: id, p_consultor: pessoaA.id })).error).toBeNull()
    expect(await estado(id)).toEqual({ consultoria_id: A, consultor_id: null })
    // Outra consultoria nem alcança o cliente.
    expect((await comoAdminB.rpc('desfazer_escolha', { p_cliente: id, p_consultor: pessoaA.id })).error?.message)
      .toBe('sem_permissao')
  })
})
