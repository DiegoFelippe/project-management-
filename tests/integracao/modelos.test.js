// Os modelos de check-in contra o Supabase local de verdade: roda as funções de src/data/modelos.js (as mesmas chamadas
// que o app faz) como cada tipo de usuário. Pega o que um mock esconde: permissão de coluna que falta no grant, regra de
// leitura errada por papel, função que a API não enxerga e a tradução do erro que o banco devolve de verdade.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo } from './ambiente.js'

// O cliente do Supabase de quem está "logado" no teste (entrar).
const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get: (_, nome) => {
      const valor = atual.cliente[nome]
      return typeof valor === 'function' ? valor.bind(atual.cliente) : valor
    },
  }),
}))

const { apagarModelo, arquivarModelo, lerModelo, listarModelos, reativarModelo, salvarModelo } =
  await import('../../src/data/modelos.js')
const { indicadoresDeModelos } = await import('../../src/data/indicadores.js')

const admin = clienteAdmin()
const SEM_PERMISSAO = 'Você não tem permissão para isso.'
// Marca dos nomes deste arquivo, para a busca achar só o que ele criou.
const marca = `Zm${Date.now().toString(36)}`

let A, B
let sessoes = {}
const modelo = {}

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}

// O modelo como o editor manda: Diagnóstico (Análise do DRE, dia 5; Mapa de custos, dia 10, opcional, depende da
// Análise) e Plano (Plano de ação, dia 20, depende das duas).
const dados = (nome, para = 'todas') => ({
  nome,
  descricao: `Descrição de ${nome}`,
  tipo: 'gestao',
  para,
  etapas: [
    {
      nome: 'Diagnóstico',
      tarefas: [
        { chave: 'a', titulo: 'Análise do DRE', descricao: 'Ler o DRE', obrigatoria: true, prazo_dias: 5, depende_de: [] },
        { chave: 'b', titulo: 'Mapa de custos', obrigatoria: false, prazo_dias: 10, depende_de: ['a'] },
      ],
    },
    { nome: 'Plano', tarefas: [{ chave: 'c', titulo: 'Plano de ação', obrigatoria: true, prazo_dias: 20, depende_de: ['a', 'b'] }] },
  ],
})

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  const central = await criarPerfilDeTeste({ papel: 'central' })
  const gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  const pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  const gestorB = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: B })
  sessoes = {
    central: await entrarComo(central),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    gestorB: await entrarComo(gestorB),
  }
})

afterAll(limparTudo)

describe('modelos de check-in contra o banco de verdade', () => {
  it('a Central e a gestão salvam; o banco grava a consultoria de quem é da gestão', async () => {
    entrar('central')
    const daCentral = await salvarModelo(null, dados(`${marca} Central`))
    expect(daCentral.erro).toBeNull()
    modelo.central = daCentral.id
    const paraB = await salvarModelo(null, dados(`${marca} Central para B`, B))
    expect(paraB.erro).toBeNull()
    modelo.paraB = paraB.id

    entrar('gestor')
    const doGestor = await salvarModelo(null, dados(`${marca} Gestão A`))
    expect(doGestor.erro).toBeNull()
    modelo.gestor = doGestor.id

    const { data } = await admin.from('modelos').select('da_central, consultoria_id').eq('id', modelo.gestor).single()
    expect(data).toEqual({ da_central: false, consultoria_id: A })
  })

  it('ler o modelo inteiro: etapas e tarefas em ordem, "depende de" com os ids', async () => {
    entrar('gestor')
    const lido = await lerModelo(modelo.central)
    expect(lido).toMatchObject({
      nome: `${marca} Central`, da_central: true, consultoria: null, criado_por: { nome: 'Central' },
      pode_editar: false, pode_duplicar: true,
    })
    expect(lido.etapas.map((e) => e.nome)).toEqual(['Diagnóstico', 'Plano'])
    const [analise, mapa] = lido.etapas[0].tarefas
    expect(lido.etapas[1].tarefas[0]).toMatchObject({ titulo: 'Plano de ação', posicao: 3, depende_de: [analise.id, mapa.id] })
    expect(mapa).toMatchObject({ obrigatoria: false, prazo_dias: 10, depende_de: [analise.id] })

    expect(await lerModelo(modelo.paraB)).toBeNull()
  })

  it('listar com paginação vinda do banco, busca sem acento e o filtro da Central', async () => {
    entrar('gestor')
    for (let i = 1; i <= 15; i += 1) {
      const r = await salvarModelo(null, dados(`${marca} Lote ${String(i).padStart(2, '0')}`))
      expect(r.erro).toBeNull()
    }
    const pagina1 = await listarModelos({ busca: `${marca} lote` })
    expect(pagina1.total).toBe(15)
    expect(pagina1.itens).toHaveLength(15)
    await salvarModelo(null, dados(`${marca} Lote 16`))
    const pagina2 = await listarModelos({ busca: `${marca} lote`, pagina: 2 })
    expect(pagina2).toMatchObject({ total: 16 })
    expect(pagina2.itens.map((m) => m.nome)).toEqual([`${marca} Lote 16`])

    // A busca olha o nome e a descrição do modelo, sem acento e sem maiúscula.
    const busca = await listarModelos({ busca: `DESCRIÇÃO DE ${marca} GESTAO` })
    expect(busca.itens.map((m) => m.nome)).toEqual([`${marca} Gestão A`])
    expect(busca.itens[0]).toMatchObject({
      consultoria: { id: A }, etapas: 2, tarefas: 3, obrigatorias: 2, maior_prazo: 20, clientes_usando: 0,
      pode_editar: true, pode_duplicar: true,
    })

    entrar('gestorB')
    expect((await listarModelos({ busca: marca })).itens.map((m) => m.nome)).toEqual([`${marca} Central`, `${marca} Central para B`])

    entrar('central')
    const deA = await listarModelos({ busca: marca, consultoriaId: A, pagina: 1 })
    expect(deA.total).toBe(18)
    expect(deA.itens.map((m) => m.nome)).not.toContain(`${marca} Central para B`)
  })

  it('arquivar e reativar: o arquivado vai para a aba Arquivados e não se edita', async () => {
    entrar('gestor')
    expect(await arquivarModelo(modelo.gestor)).toEqual({ erro: null })
    const arquivados = await listarModelos({ aba: 'arquivados', busca: marca })
    expect(arquivados.itens.map((m) => m.id)).toEqual([modelo.gestor])
    expect(arquivados.itens[0].arquivado_em).toBeTruthy()
    expect(await salvarModelo(modelo.gestor, dados(`${marca} Gestão A`))).toEqual({
      id: null,
      erro: 'Este modelo está arquivado. Reative o modelo antes de editar.',
    })
    expect(await reativarModelo(modelo.gestor)).toEqual({ erro: null })
    expect((await listarModelos({ aba: 'arquivados', busca: marca })).total).toBe(0)
  })

  it('quem não pode recebe o erro traduzido', async () => {
    entrar('gestor')
    expect(await arquivarModelo(modelo.central)).toEqual({ erro: SEM_PERMISSAO })
    expect(await apagarModelo(modelo.central)).toEqual({ erro: SEM_PERMISSAO })
    expect(await salvarModelo(modelo.central, dados('Mexido'))).toEqual({ id: null, erro: SEM_PERMISSAO })
    const ciclo = dados(`${marca} Ciclo`)
    ciclo.etapas[0].tarefas[0].depende_de = ['b']
    expect(await salvarModelo(null, ciclo)).toEqual({
      id: null,
      erro: 'Uma tarefa só pode depender de tarefas que vêm antes dela na lista.',
    })
    const longo = dados(`${marca} Longo`)
    longo.etapas[0].tarefas[0].titulo = 'x'.repeat(81)
    expect((await salvarModelo(null, longo)).erro).toMatch(/até 80 letras/)

    entrar('pessoa')
    expect(await salvarModelo(null, dados(`${marca} Consultor`))).toEqual({ id: null, erro: SEM_PERMISSAO })
    expect(await arquivarModelo(modelo.gestor)).toEqual({ erro: SEM_PERMISSAO })
    // Pela API, nada se grava direto nas tabelas (só arquivado_em, pela regra).
    const direto = await sessoes.gestor.from('modelos').insert({ nome: 'Direto', da_central: false, consultoria_id: A })
    expect(direto.error?.code).toBe('42501')
    const nome = await sessoes.gestor.from('modelos').update({ nome: 'Direto' }).eq('id', modelo.gestor)
    expect(nome.error?.code).toBe('42501')
  })

  it('os números da tela vêm do banco, no recorte de quem vê', async () => {
    entrar('gestor')
    const numeros = await indicadoresDeModelos()
    const { count: daConsultoria } = await admin.from('modelos').select('id', { count: 'exact', head: true })
      .eq('consultoria_id', A).eq('da_central', false).is('arquivado_em', null)
    expect(numeros).toMatchObject({ recorte: 'consultoria', da_consultoria: daConsultoria, clientes_usando: 0 })
    expect(numeros.ativos).toBe(numeros.da_central + numeros.da_consultoria)
    entrar('central')
    expect(await indicadoresDeModelos({ consultoriaId: A })).toEqual({ ...numeros, recorte: 'tudo' })
  })

  it('apagar: o modelo some com as etapas e as tarefas', async () => {
    entrar('gestor')
    expect(await apagarModelo(modelo.gestor)).toEqual({ erro: null })
    expect(await lerModelo(modelo.gestor)).toBeNull()
    const { count } = await admin.from('modelo_etapas').select('id', { count: 'exact', head: true }).eq('modelo_id', modelo.gestor)
    expect(count).toBe(0)
    entrar('central')
    expect(await apagarModelo(modelo.paraB)).toEqual({ erro: null })
  })
})
