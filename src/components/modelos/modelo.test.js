import { describe, expect, it } from 'vitest'
import {
  LIMITES, acrescentarEtapa, acrescentarTarefa, alternarDependencia, dependentesDe, moverEtapa, moverTarefa, mudarEtapa,
  mudarTarefa, ordemGlobal, paraSalvar, rascunhoDe, rascunhoNovo, resumoDoRascunho, tarefasEmOrdem, tirarEtapa,
  tirarTarefas, validarModelo,
} from './modelo'

// O modelo como o banco devolve (modelo_completo).
const MODELO = {
  id: 'm1', nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', da_central: true, consultoria: null,
  criado_por: { nome: 'Carla Central' }, criado_em: '2026-11-10T13:00:00Z', arquivado_em: null, pode_editar: true,
  pode_duplicar: true,
  etapas: [
    { id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: [
      { id: 't1', titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, posicao: 1, depende_de: [] },
      { id: 't2', titulo: 'Análise do DRE', descricao: 'Últimos 12 meses', obrigatoria: true, prazo_dias: 10, posicao: 2, depende_de: ['t1'] },
    ] },
    { id: 'e2', nome: 'Plano', posicao: 2, tarefas: [
      { id: 't3', titulo: 'Plano de ação', descricao: null, obrigatoria: false, prazo_dias: 20, posicao: 3, depende_de: ['t2'] },
    ] },
  ],
}

const titulos = (r) => r.etapas.map((e) => e.tarefas.map((t) => t.id))

describe('rascunhoDe', () => {
  it('copia o modelo para o editor: textos sem nulo, prazo como texto (o CampoNumero trabalha com texto) e "para"', () => {
    const r = rascunhoDe(MODELO)
    expect(r).toEqual({
      nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', para: 'todas',
      etapas: [
        { id: 'e1', nome: 'Diagnóstico', tarefas: [
          { id: 't1', titulo: 'Reunião de início', descricao: '', obrigatoria: true, prazo_dias: '2', depende_de: [] },
          { id: 't2', titulo: 'Análise do DRE', descricao: 'Últimos 12 meses', obrigatoria: true, prazo_dias: '10', depende_de: ['t1'] },
        ] },
        { id: 'e2', nome: 'Plano', tarefas: [
          { id: 't3', titulo: 'Plano de ação', descricao: '', obrigatoria: false, prazo_dias: '20', depende_de: ['t2'] },
        ] },
      ],
    })
    expect(r.etapas[0].tarefas[1].depende_de).not.toBe(MODELO.etapas[0].tarefas[1].depende_de)
  })

  it('modelo de uma consultoria (da Central para ela, ou da gestão): "para" é o id dela; sem tipo vira ""', () => {
    expect(rascunhoDe({ ...MODELO, consultoria: { id: 'c1', nome: 'STI' } }).para).toBe('c1')
    expect(rascunhoDe({ ...MODELO, tipo: null }).tipo).toBe('')
  })

  it('duplicar: "Cópia de X" (até 80 letras)', () => {
    expect(rascunhoDe(MODELO, { duplicar: true }).nome).toBe('Cópia de Gestão financeira')
    const longo = 'x'.repeat(80)
    expect(rascunhoDe({ ...MODELO, nome: longo }, { duplicar: true }).nome).toHaveLength(80)
  })
})

describe('rascunhoNovo', () => {
  it('começa com uma etapa "Diagnóstico" e uma tarefa em branco, obrigatória, no dia 2', () => {
    const r = rascunhoNovo('todas')
    expect(r).toMatchObject({ nome: '', descricao: '', tipo: '', para: 'todas' })
    expect(r.etapas).toHaveLength(1)
    expect(r.etapas[0]).toMatchObject({ nome: 'Diagnóstico' })
    expect(r.etapas[0].tarefas).toEqual([
      { id: expect.any(String), titulo: '', descricao: '', obrigatoria: true, prazo_dias: '2', depende_de: [] },
    ])
  })
})

describe('ordemGlobal e tarefasEmOrdem', () => {
  it('a ordem do modelo inteiro é etapa por etapa (1..n)', () => {
    const r = rascunhoDe(MODELO)
    expect([...ordemGlobal(r)]).toEqual([['t1', 1], ['t2', 2], ['t3', 3]])
    expect(tarefasEmOrdem(r).map((t) => [t.id, t.etapa_id, t.ordem])).toEqual([['t1', 'e1', 1], ['t2', 'e1', 2], ['t3', 'e2', 3]])
  })
})

describe('paraSalvar', () => {
  it('monta o p_dados do salvar_modelo: textos aparados, vazio vira nulo, prazo em número, chave = id da tarefa', () => {
    const r = rascunhoDe(MODELO)
    r.nome = '  Gestão financeira  '
    r.etapas[0].nome = ' Diagnóstico '
    r.etapas[0].tarefas[0].titulo = ' Reunião de início '
    r.etapas[0].tarefas[1].descricao = '   '
    expect(paraSalvar(r)).toEqual({
      nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', para: 'todas',
      etapas: [
        { nome: 'Diagnóstico', tarefas: [
          { chave: 't1', titulo: 'Reunião de início', descricao: null, obrigatoria: true, prazo_dias: 2, depende_de: [] },
          { chave: 't2', titulo: 'Análise do DRE', descricao: null, obrigatoria: true, prazo_dias: 10, depende_de: ['t1'] },
        ] },
        { nome: 'Plano', tarefas: [
          { chave: 't3', titulo: 'Plano de ação', descricao: null, obrigatoria: false, prazo_dias: 20, depende_de: ['t2'] },
        ] },
      ],
    })
  })

  it('sem tipo e sem descrição: nulos; dependência repetida vai uma vez só', () => {
    const r = rascunhoDe({ ...MODELO, tipo: null, descricao: null })
    r.etapas[1].tarefas[0].depende_de = ['t2', 't2', 't1']
    const dados = paraSalvar(r)
    expect(dados).toMatchObject({ tipo: null, descricao: null })
    expect(dados.etapas[1].tarefas[0].depende_de).toEqual(['t2', 't1'])
  })
})

describe('validarModelo (as mesmas regras e limites do salvar_modelo)', () => {
  const valido = () => rascunhoDe(MODELO)

  it('modelo certo: sem mensagem e sem marcas', () => {
    expect(validarModelo(valido())).toEqual({ msg: null, nome: false, para: false, etapas: new Set(), tarefas: new Set() })
  })

  it('nome com menos de 2 letras (sem contar os espaços) ou acima de 80', () => {
    const r = valido()
    r.nome = '  a '
    expect(validarModelo(r)).toMatchObject({ nome: true, msg: 'Dê um nome ao modelo, com pelo menos 2 letras.' })
    r.nome = 'x'.repeat(81)
    expect(validarModelo(r)).toMatchObject({ nome: true, msg: 'O nome do modelo vai até 80 letras.' })
  })

  it('descrição do modelo acima de 400', () => {
    const r = valido()
    r.descricao = 'x'.repeat(401)
    expect(validarModelo(r).msg).toBe('A descrição do modelo vai até 400 letras.')
  })

  it('"Uma consultoria" sem escolher qual', () => {
    const r = valido()
    r.para = ''
    expect(validarModelo(r)).toMatchObject({ para: true, msg: 'Escolha para qual consultoria é o modelo.' })
  })

  it('sem nenhuma tarefa', () => {
    const r = valido()
    r.etapas = []
    expect(validarModelo(r).msg).toBe('O modelo precisa de pelo menos uma tarefa.')
  })

  it('etapa sem nome e etapa sem tarefas marcam a etapa', () => {
    const r = valido()
    r.etapas[0].nome = '  '
    r.etapas[1].tarefas = []
    const v = validarModelo(r)
    expect(v.etapas).toEqual(new Set(['e1', 'e2']))
    expect(v.msg).toBe('Dê um nome a cada etapa.')
    r.etapas[0].nome = 'Diagnóstico'
    expect(validarModelo(r).msg).toBe('A etapa "Plano" está sem tarefas: acrescente uma tarefa ou apague a etapa.')
    r.etapas[0].nome = 'x'.repeat(61)
    expect(validarModelo(r).msg).toBe('O nome da etapa vai até 60 letras.')
  })

  it('tarefa sem título, título longo e descrição longa marcam a tarefa', () => {
    const r = valido()
    r.etapas[0].tarefas[1].titulo = ' '
    expect(validarModelo(r)).toMatchObject({ tarefas: new Set(['t2']), msg: 'Dê um título a cada tarefa.' })
    r.etapas[0].tarefas[1].titulo = 'x'.repeat(81)
    expect(validarModelo(r).msg).toBe('O título da tarefa vai até 80 letras.')
    r.etapas[0].tarefas[1].titulo = 'Análise do DRE'
    r.etapas[0].tarefas[1].descricao = 'x'.repeat(161)
    expect(validarModelo(r)).toMatchObject({ tarefas: new Set(['t2']), msg: 'A descrição da tarefa vai até 160 letras.' })
  })

  it.each(['', '-1', '366', '2,5', 'abc'])('prazo "%s" fora do dia 0 a 365 marca a tarefa', (prazo) => {
    const r = valido()
    r.etapas[1].tarefas[0].prazo_dias = prazo
    expect(validarModelo(r)).toMatchObject({ tarefas: new Set(['t3']), msg: 'O prazo de cada tarefa vai do dia 0 ao dia 365.' })
  })

  it.each(['0', '365'])('prazo "%s" vale', (prazo) => {
    const r = valido()
    r.etapas[1].tarefas[0].prazo_dias = prazo
    expect(validarModelo(r).msg).toBeNull()
  })

  it('dependência para tarefa que vem depois: marca a tarefa e diz as duas', () => {
    // Análise do DRE sobe para antes da Reunião de início, de quem ela depende.
    const v = validarModelo(moverTarefa(valido(), 't2', -1))
    expect(v.tarefas).toEqual(new Set(['t2']))
    expect(v.msg).toBe('"Análise do DRE" depende de "Reunião de início", que vem depois. Mova uma das duas ou tire a dependência.')
  })

  it('dependência dela mesma ou de uma tarefa que não existe mais também é recusada', () => {
    const r = valido()
    r.etapas[0].tarefas[0].depende_de = ['t1']
    expect(validarModelo(r).tarefas).toEqual(new Set(['t1']))
    const r2 = valido()
    r2.etapas[0].tarefas[0].depende_de = ['sumiu']
    expect(validarModelo(r2)).toMatchObject({ tarefas: new Set(['t1']), msg: '"Reunião de início" depende de uma tarefa que não está mais no modelo. Tire a dependência.' })
  })

  it('limites: 50 etapas, 500 tarefas e 30 dependências por tarefa', () => {
    expect(LIMITES).toMatchObject({ etapas: 50, tarefas: 500, dependencias: 30 })
    const muitasEtapas = valido()
    muitasEtapas.etapas = Array.from({ length: 51 }, (_, i) => ({
      id: `e${i}`, nome: `E${i}`, tarefas: [{ id: `t${i}`, titulo: 'T', descricao: '', obrigatoria: true, prazo_dias: '1', depende_de: [] }],
    }))
    expect(validarModelo(muitasEtapas).msg).toBe('O modelo passou do limite: até 50 etapas e 500 tarefas.')
    const muitasTarefas = valido()
    muitasTarefas.etapas = [{ id: 'e', nome: 'E', tarefas: Array.from({ length: 501 }, (_, i) => (
      { id: `t${i}`, titulo: 'T', descricao: '', obrigatoria: true, prazo_dias: '1', depende_de: [] })) }]
    expect(validarModelo(muitasTarefas).msg).toBe('O modelo passou do limite: até 50 etapas e 500 tarefas.')
    muitasTarefas.etapas[0].tarefas = muitasTarefas.etapas[0].tarefas.slice(0, 32)
    expect(validarModelo(muitasTarefas).msg).toBeNull()
    muitasTarefas.etapas[0].tarefas[31].depende_de = Array.from({ length: 31 }, (_, i) => `t${i}`)
    expect(validarModelo(muitasTarefas)).toMatchObject({ tarefas: new Set(['t31']), msg: 'Cada tarefa depende de no máximo 30 outras.' })
  })
})

describe('moverTarefa (atravessa etapas)', () => {
  it('sobe e desce dentro da etapa', () => {
    const r = rascunhoDe(MODELO)
    expect(titulos(moverTarefa(r, 't2', -1))).toEqual([['t2', 't1'], ['t3']])
    expect(titulos(moverTarefa(r, 't1', 1))).toEqual([['t2', 't1'], ['t3']])
  })

  it('a primeira da etapa sobe para o fim da etapa de cima; a última desce para o começo da de baixo', () => {
    const r = rascunhoDe(MODELO)
    expect(titulos(moverTarefa(r, 't3', -1))).toEqual([['t1', 't2', 't3'], []])
    expect(titulos(moverTarefa(r, 't2', 1))).toEqual([['t1'], ['t2', 't3']])
  })

  it('a primeira do modelo não sobe e a última não desce; o original não muda', () => {
    const r = rascunhoDe(MODELO)
    expect(titulos(moverTarefa(r, 't1', -1))).toEqual([['t1', 't2'], ['t3']])
    expect(titulos(moverTarefa(r, 't3', 1))).toEqual([['t1', 't2'], ['t3']])
    moverTarefa(r, 't2', 1)
    expect(titulos(r)).toEqual([['t1', 't2'], ['t3']])
  })
})

describe('tirarTarefas e tirarEtapa', () => {
  it('tira as tarefas e as dependências para elas; as outras tarefas continuam as mesmas', () => {
    const r = rascunhoDe(MODELO)
    const sem = tirarTarefas(r, ['t2'])
    expect(titulos(sem)).toEqual([['t1'], ['t3']])
    expect(sem.etapas[1].tarefas[0].depende_de).toEqual([])
    expect(sem.etapas[0].tarefas[0]).toBe(r.etapas[0].tarefas[0])
    expect(titulos(r)).toEqual([['t1', 't2'], ['t3']])
  })

  it('apagar a etapa leva as tarefas dela e as dependências para elas', () => {
    const r = rascunhoDe(MODELO)
    const sem = tirarEtapa(r, 'e1')
    expect(sem.etapas.map((e) => e.id)).toEqual(['e2'])
    expect(sem.etapas[0].tarefas[0].depende_de).toEqual([])
  })

  it('dependentesDe: quem perde a dependência', () => {
    const r = rascunhoDe(MODELO)
    expect(dependentesDe(r, 't2').map((t) => t.titulo)).toEqual(['Plano de ação'])
    expect(dependentesDe(r, 't3')).toEqual([])
  })
})

describe('mudanças do editor', () => {
  it('mudarTarefa e mudarEtapa trocam só aquela (as outras continuam o mesmo objeto)', () => {
    const r = rascunhoDe(MODELO)
    const novo = mudarTarefa(r, 't2', { titulo: 'DRE' })
    expect(novo.etapas[0].tarefas[1].titulo).toBe('DRE')
    expect(novo.etapas[0].tarefas[0]).toBe(r.etapas[0].tarefas[0])
    expect(novo.etapas[1]).toBe(r.etapas[1])
    expect(mudarEtapa(r, 'e2', { nome: 'Execução' }).etapas[1].nome).toBe('Execução')
  })

  it('moverEtapa troca de lugar com a vizinha (nas pontas, nada muda)', () => {
    const r = rascunhoDe(MODELO)
    expect(moverEtapa(r, 'e2', -1).etapas.map((e) => e.id)).toEqual(['e2', 'e1'])
    expect(moverEtapa(r, 'e1', -1).etapas.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('acrescentar: tarefa na etapa (prazo da última dela) e etapa nova com uma tarefa (prazo do maior, pelo menos 7)', () => {
    const r = rascunhoDe(MODELO)
    const comTarefa = acrescentarTarefa(r, 'e1')
    expect(comTarefa.rascunho.etapas[0].tarefas.at(-1)).toMatchObject({ id: comTarefa.id, titulo: '', prazo_dias: '10' })
    const comEtapa = acrescentarEtapa(r)
    expect(comEtapa.rascunho.etapas.at(-1)).toMatchObject({ id: comEtapa.id, nome: '' })
    expect(comEtapa.rascunho.etapas.at(-1).tarefas[0]).toMatchObject({ prazo_dias: '20' })
  })

  it('alternarDependencia põe e tira', () => {
    const r = rascunhoDe(MODELO)
    const com = alternarDependencia(r, 't3', 't1')
    expect(com.etapas[1].tarefas[0].depende_de).toEqual(['t2', 't1'])
    expect(alternarDependencia(com, 't3', 't2').etapas[1].tarefas[0].depende_de).toEqual(['t1'])
  })

  it('resumoDoRascunho: etapas, tarefas, obrigatórias, opcionais e o maior prazo', () => {
    expect(resumoDoRascunho(rascunhoDe(MODELO))).toEqual({ etapas: 2, tarefas: 3, obrigatorias: 2, opcionais: 1, maiorPrazo: 20 })
  })
})
