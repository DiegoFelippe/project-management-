import { describe, expect, it } from 'vitest'
import {
  burnupDoPainel, fraseDaFila, fraseDaOcupacao, fraseDasCidades, fraseDasEtapas, fraseDasHorasPorCliente, fraseDasHorasPorUnidade,
  fraseDasSemanas, fraseDasSemanasDoCliente, fraseDasTarefas, fraseDoBurnupDoPainel, fraseDoCalor, fraseDoMesDoCliente,
  fraseDoPeriodoDoCliente, fraseDoRisco, fraseDosConsultores, fraseDosMeses, fraseDosSeisMeses, nomeDaCidade, porcentoResolvido,
} from './frasesDosGraficos'

// As frases viram <Leitura partes>: texto corrido e { forte } (o número que importa, em negrito).
const texto = (partes) => partes.map((p) => (typeof p === 'string' ? p : p.forte)).join('')
const fortes = (partes) => partes.filter((p) => typeof p !== 'string').map((p) => p.forte)

const MES = { tipo: 'mes', mes: '2026-11-01' }
const ANO = { tipo: 'ano' }
const PERIODO = { tipo: 'ultimos-90' }

describe('fraseDosMeses (Realizado × capacidade)', () => {
  const painel = (realizado, capacidade_ate_hoje, intervalo = false) => ({ intervalo, indicadores: { realizado, capacidade: 1480, capacidade_ate_hoje } })

  it('com folga: "No mês: 1.020 h de 1.480 h (69%) · 460 h livres", com a capacidade do período efetivo', () => {
    const partes = fraseDosMeses(painel(1020, 1480), MES)
    expect(texto(partes)).toBe('No mês: 1.020 h de 1.480 h (69%) · 460 h livres')
    expect(fortes(partes)).toEqual(['1.020 h', '460 h'])
  })

  it('acima: "· 80 h acima da capacidade"; "No ano" e "No período" conforme o período', () => {
    expect(texto(fraseDosMeses(painel(1560, 1480, true), ANO))).toBe('No ano: 1.560 h de 1.480 h (105%) · 80 h acima da capacidade')
    expect(texto(fraseDosMeses(painel(700, 1000, true), PERIODO))).toBe('No período: 700 h de 1.000 h (70%) · 300 h livres')
    // Sem o período, o painel diz se é intervalo.
    expect(texto(fraseDosMeses(painel(700, 1000, true)))).toMatch(/^No período:/)
  })

  it('sem capacidade: só o realizado', () => {
    expect(texto(fraseDosMeses(painel(12, 0), MES))).toBe('No mês: 12 h realizadas')
  })
})

describe('fraseDaFila', () => {
  it('"Até ter consultor: 3,5 dias em média no período"', () => {
    const partes = fraseDaFila({ receberam_consultor: 4, espera_media_dias: 3.5 }, PERIODO)
    expect(texto(partes)).toBe('Até ter consultor: 3,5 dias em média no período')
    expect(fortes(partes)).toEqual(['3,5 dias'])
    expect(texto(fraseDaFila({ receberam_consultor: 1, espera_media_dias: 1 }, MES))).toBe('Até ter consultor: 1 dia em média no mês')
  })

  it('ninguém recebeu consultor', () => {
    expect(texto(fraseDaFila({ receberam_consultor: 0, espera_media_dias: null }, MES))).toBe('Ninguém recebeu consultor no mês')
  })
})

describe('fraseDaOcupacao (pelo ranking_resumo, contado sobre todos)', () => {
  const painel = (acima, folga, total = 14) => ({ ranking_resumo: { total, acima, folga, no_meio: 2 } })

  it('"2 consultores acima de 100% · 3 com folga" (consultorias na central)', () => {
    const partes = fraseDaOcupacao(painel(2, 3), 'consultoria')
    expect(texto(partes)).toBe('2 consultores acima de 100% · 3 com folga')
    expect(fortes(partes)).toEqual(['2 consultores', '3'])
    expect(texto(fraseDaOcupacao(painel(1, 0), 'tudo'))).toBe('1 consultoria acima de 100%')
  })

  it('ninguém acima / todos entre 70% e 100%', () => {
    expect(texto(fraseDaOcupacao(painel(0, 3), 'consultoria'))).toBe('Ninguém acima de 100% · 3 com folga')
    expect(texto(fraseDaOcupacao(painel(0, 0), 'consultoria'))).toBe('Todos entre 70% e 100%')
    expect(fraseDaOcupacao(painel(0, 0, 0), 'consultoria')).toEqual([])
  })
})

describe('fraseDoRisco', () => {
  it('"4 sem check-in há 30+ dias · 2 acima de 120% da previsão"', () => {
    const partes = fraseDoRisco({ total: 6, sem_checkin: 4, acima_do_ritmo: 2 })
    expect(texto(partes)).toBe('4 sem check-in há 30+ dias · 2 acima de 120% da previsão')
    expect(fortes(partes)).toEqual(['4', '2'])
  })

  it('nenhum em risco', () => {
    expect(texto(fraseDoRisco({ total: 0, sem_checkin: 0, acima_do_ritmo: 0 }))).toBe('Nenhum cliente em risco hoje')
  })
})

describe('fraseDasHorasPorCliente', () => {
  const dados = (total_clientes, total_horas = 1204) => ({ total_clientes, total_horas, participacao_3: 0.51, participacao_10: 0.34 })

  it('mais de 30 clientes: os 10 maiores', () => {
    const partes = fraseDasHorasPorCliente(dados(248), PERIODO)
    expect(texto(partes)).toBe('Os 10 maiores somam 34% das horas no período')
    expect(fortes(partes)).toEqual(['34%'])
  })

  it('de 4 a 30: os 3 maiores; até 3: o total', () => {
    expect(texto(fraseDasHorasPorCliente(dados(30), MES))).toBe('Os 3 maiores somam 51% das horas no mês')
    expect(texto(fraseDasHorasPorCliente(dados(4), MES))).toBe('Os 3 maiores somam 51% das horas no mês')
    expect(texto(fraseDasHorasPorCliente(dados(3, 42), MES))).toBe('42 h no mês')
    expect(fortes(fraseDasHorasPorCliente(dados(3, 42), MES))).toEqual(['42 h'])
  })

  it('nenhuma hora', () => {
    expect(texto(fraseDasHorasPorCliente(dados(0, 0), ANO))).toBe('Nenhuma hora no ano')
  })
})

describe('fraseDasSemanas (Início)', () => {
  it('média e pico: "Média de 38 por semana no período · pico na semana de 06/10"', () => {
    const partes = fraseDasSemanas({ media: 38.2, pico: { semana: '2026-10-06', checkins: 48 } }, PERIODO)
    expect(texto(partes)).toBe('Média de 38 por semana no período · pico na semana de 06/10')
    expect(fortes(partes)).toEqual(['38'])
    // Abaixo de 10, com uma casa.
    expect(texto(fraseDasSemanas({ media: 2.5, pico: { semana: '2026-11-02', checkins: 4 } }, MES))).toBe('Média de 2,5 por semana no mês · pico na semana de 02/11')
  })

  it('sem semana inteira ainda (média nula, 1ª semana do mês): nada de "Média de 0", só o pico', () => {
    const partes = fraseDasSemanas({ media: null, pico: { semana: '2026-11-02', checkins: 12 } }, MES)
    expect(texto(partes)).toBe('Ainda sem semana inteira no mês · pico de 12 na semana de 02/11')
    expect(fortes(partes)).toEqual(['12'])
    expect(texto(partes)).not.toMatch(/Média de 0/)
  })

  it('nenhum check-in', () => {
    expect(texto(fraseDasSemanas({ media: null, pico: null }, MES))).toBe('Nenhum check-in no mês')
    expect(texto(fraseDasSemanas({ media: 0, pico: null }, MES))).toBe('Nenhum check-in no mês')
    expect(texto(fraseDasSemanas({ media: 0, pico: { semana: '2026-11-02', checkins: 0 } }, MES))).toBe('Nenhum check-in no mês')
  })
})

describe('fraseDoMesDoCliente (burn-up)', () => {
  it('mês atual: a projeção do banco', () => {
    const partes = fraseDoMesDoCliente({ mes: '2026-11-01', realizado: 18, previsao: 30, projecao: 34 }, true)
    expect(texto(partes)).toBe('No ritmo atual, fecha o mês com ≈ 34 h (113% da previsão)')
    expect(fortes(partes)).toEqual(['≈ 34 h'])
  })

  it('começo do mês (sem projeção até o dia 6): só o que foi feito', () => {
    expect(texto(fraseDoMesDoCliente({ mes: '2026-11-01', realizado: 4, previsao: 30, projecao: null }, true))).toBe('4 h até agora')
  })

  it('mês passado: "Fechou o mês com 28 h (93% da previsão atual)"', () => {
    expect(texto(fraseDoMesDoCliente({ mes: '2026-10-01', realizado: 28, previsao: 30, projecao: null }, false))).toBe('Fechou o mês com 28 h (93% da previsão atual)')
    expect(texto(fraseDoMesDoCliente({ mes: '2026-10-01', realizado: 28, previsao: 0, projecao: null }, false))).toBe('Fechou o mês com 28 h')
  })
})

describe('fraseDoPeriodoDoCliente (burn-up num período que não é um mês)', () => {
  it('o realizado contra a previsão proporcional do banco, dizendo o período', () => {
    const partes = fraseDoPeriodoDoCliente({ realizado: 52, previsao: 60 }, { tipo: 'ultimos-90' })
    expect(texto(partes)).toBe('No período: 52 h de 60 h previstas (87%)')
    expect(fortes(partes)).toEqual(['52 h'])
    expect(texto(fraseDoPeriodoDoCliente({ realizado: 180, previsao: 300 }, ANO))).toBe('No ano: 180 h de 300 h previstas (60%)')
    expect(texto(fraseDoPeriodoDoCliente({ realizado: 5, previsao: null }, { tipo: 'personalizado' }))).toBe('No período: 5 h')
  })
})

describe('fraseDosConsultores (cliente)', () => {
  it('num período que não é um mês, a frase diz o período', () => {
    expect(texto(fraseDosConsultores([{ nome: 'Ana Lima', horas: 41 }, { nome: 'Bruno', horas: 9 }], { tipo: 'ultimos-30' })))
      .toBe('Ana Lima fez 82% das horas no período')
    expect(texto(fraseDosConsultores([{ nome: 'Ana Lima', horas: 12 }], ANO))).toBe('Só Ana Lima no ano')
    expect(texto(fraseDosConsultores([], { tipo: 'personalizado' }))).toBe('Sem horas no período')
    expect(texto(fraseDosConsultores([{ nome: 'Ana Lima', horas: 12 }], MES))).toBe('Só Ana Lima neste mês')
  })


  it('"Ana Lima fez 82% das horas" (a lista vem do banco, mais horas primeiro)', () => {
    const partes = fraseDosConsultores([{ nome: 'Ana Lima', horas: 41 }, { nome: 'Bruno', horas: 9 }])
    expect(texto(partes)).toBe('Ana Lima fez 82% das horas')
    expect(fortes(partes)).toEqual(['Ana Lima'])
  })

  it('só um consultor; nome que a pessoa não vê; nenhum', () => {
    expect(texto(fraseDosConsultores([{ nome: 'Ana Lima', horas: 12 }]))).toBe('Só Ana Lima neste mês')
    expect(texto(fraseDosConsultores([{ nome: null, horas: 12 }, { nome: 'Ana', horas: 2 }]))).toBe('Outro consultor fez 86% das horas')
    expect(texto(fraseDosConsultores([]))).toBe('Sem horas neste mês')
  })
})

describe('fraseDosSeisMeses (cliente)', () => {
  const meses = [
    { mes: '2026-06-01', realizado: 20 }, { mes: '2026-07-01', realizado: 32 }, { mes: '2026-08-01', realizado: 26 },
    { mes: '2026-09-01', realizado: 34 }, { mes: '2026-10-01', realizado: 18 }, { mes: '2026-11-01', realizado: 5 },
  ]

  it('média e meses acima da previsão, só dos meses fechados (o atual fica de fora)', () => {
    const partes = fraseDosSeisMeses(meses, 30, '2026-11-01')
    expect(texto(partes)).toBe('Média de 26 h/mês · 2 meses acima da previsão')
    expect(fortes(partes)).toEqual(['26 h'])
  })

  it('nenhum ou um mês acima; sem previsão; sem horas', () => {
    expect(texto(fraseDosSeisMeses(meses, 40, '2026-11-01'))).toBe('Média de 26 h/mês · nenhum mês acima da previsão')
    expect(texto(fraseDosSeisMeses(meses, 33, '2026-11-01'))).toBe('Média de 26 h/mês · 1 mês acima da previsão')
    expect(texto(fraseDosSeisMeses(meses, 0, '2026-11-01'))).toBe('Média de 26 h/mês')
    expect(texto(fraseDosSeisMeses(meses.map((m) => ({ ...m, realizado: 0 })), 30, '2026-11-01'))).toBe('Sem horas nos últimos 6 meses')
    expect(texto(fraseDosSeisMeses([...meses, ...meses].map((m) => ({ ...m, realizado: 0 })), 30, '2026-11-01'))).toBe('Sem horas nos últimos 12 meses')
  })
})

describe('fraseDasSemanasDoCliente', () => {
  it('"9 check-ins no mês · 2,1 h em média"', () => {
    const partes = fraseDasSemanasDoCliente([{ semana: '2026-11-02', quantidade: 4, horas: 8.4 }, { semana: '2026-11-09', quantidade: 5, horas: 10.5 }])
    expect(texto(partes)).toBe('9 check-ins no mês · 2,1 h em média')
    expect(fortes(partes)).toEqual(['9 check-ins'])
    expect(texto(fraseDasSemanasDoCliente([{ semana: '2026-11-02', quantidade: 1, horas: 2 }]))).toBe('1 check-in no mês · 2 h em média')
  })

  it('sem check-ins', () => {
    expect(texto(fraseDasSemanasDoCliente([{ semana: '2026-11-02', quantidade: 0, horas: 0 }]))).toBe('Sem check-ins neste mês')
  })

  it('num período que não é um mês, a frase diz o período', () => {
    const semanas = [{ semana: '2026-11-02', quantidade: 4, horas: 8.4 }, { semana: '2026-11-09', quantidade: 5, horas: 10.5 }]
    expect(texto(fraseDasSemanasDoCliente(semanas, { tipo: 'ultimos-90' }))).toBe('9 check-ins no período · 2,1 h em média')
    expect(texto(fraseDasSemanasDoCliente(semanas, MES))).toBe('9 check-ins no mês · 2,1 h em média')
    expect(texto(fraseDasSemanasDoCliente([], ANO))).toBe('Sem check-ins no ano')
  })
})

describe('fraseDasEtapas (check-list)', () => {
  it('a etapa com mais atrasadas', () => {
    const etapas = [{ nome: 'Implantação', tarefas: 10, feitas: 8, atrasadas: 1 }, { nome: 'Financeiro', tarefas: 12, feitas: 4, atrasadas: 3 }]
    const partes = fraseDasEtapas(etapas)
    expect(texto(partes)).toBe('Financeiro tem 3 tarefas atrasadas · situação de hoje')
    expect(fortes(partes)).toEqual(['Financeiro'])
    expect(texto(fraseDasEtapas([{ nome: 'Fiscal', tarefas: 2, feitas: 0, atrasadas: 1 }]))).toBe('Fiscal tem 1 tarefa atrasada · situação de hoje')
  })

  it('nenhuma atrasada', () => {
    expect(texto(fraseDasEtapas([{ nome: 'Fiscal', tarefas: 4, feitas: 2, atrasadas: 0 }]))).toBe('Nenhuma tarefa atrasada · situação de hoje')
  })
})

// Início, gráficos variados (pedido do Diego, 19/11).
describe('burnupDoPainel e fraseDoBurnupDoPainel (horas no período × capacidade)', () => {
  // 30 dias de novembro, 10 h em cada dia útil já passado; hoje = dia 19.
  const dias = (n, horas, ate = n) => Array.from({ length: n }, (_, i) => ({ dia: `2026-11-${String(i + 1).padStart(2, '0')}`, horas: i < ate ? horas : 0 }))
  const NOV = (extra = {}) => ({ dias: dias(30, 10, 19), capacidade: 400, hoje: '2026-11-19', ...extra })

  it('acumula dia a dia; hoje é o último ponto do realizado e a projeção é o ritmo de hoje até o fim', () => {
    const { acumulado, ultimo, realizado, projecao } = burnupDoPainel(NOV())
    expect(acumulado.slice(0, 3)).toEqual([10, 20, 30])
    expect(ultimo).toBe(18)
    expect(realizado).toBe(190)
    expect(projecao).toBe(300) // 190 h ÷ 19 dias × 30 dias
  })

  it('soma sem perder centavos (0,1 + 0,2)', () => {
    const { acumulado } = burnupDoPainel({ dias: [{ dia: '2026-11-01', horas: 0.1 }, { dia: '2026-11-02', horas: 0.2 }], capacidade: 0, hoje: '2026-11-02' })
    expect(acumulado).toEqual([0.1, 0.3])
  })

  it('sem projeção: período que já acabou, antes do 7º dia, sem horas ou período futuro', () => {
    expect(burnupDoPainel(NOV({ hoje: '2026-12-02' }))).toMatchObject({ ultimo: 29, realizado: 190, projecao: null })
    expect(burnupDoPainel(NOV({ dias: dias(30, 10, 6), hoje: '2026-11-06' })).projecao).toBeNull()
    expect(burnupDoPainel(NOV({ dias: dias(30, 10, 7), hoje: '2026-11-07' })).projecao).toBe(300)
    expect(burnupDoPainel(NOV({ dias: dias(30, 0) })).projecao).toBeNull()
    expect(burnupDoPainel(NOV({ dias: dias(30, 0), hoje: '2026-10-20' }))).toMatchObject({ ultimo: -1, realizado: 0, projecao: null })
  })

  it('no ritmo de hoje: "No ritmo de hoje, o mês fecha com ≈ 300 h: 75% da capacidade (400 h)"', () => {
    const partes = fraseDoBurnupDoPainel(NOV(), MES)
    expect(texto(partes)).toBe('No ritmo de hoje, o mês fecha com ≈ 300 h: 75% da capacidade (400 h)')
    expect(fortes(partes)).toEqual(['≈ 300 h'])
    expect(texto(fraseDoBurnupDoPainel(NOV({ capacidade: 0 }), { tipo: 'personalizado' }))).toBe('No ritmo de hoje, o período fecha com ≈ 300 h')
  })

  it('sem projeção: o realizado e a parte da capacidade ("até agora" se o período não acabou)', () => {
    expect(texto(fraseDoBurnupDoPainel(NOV({ hoje: '2026-12-02' }), MES))).toBe('No mês: 190 h · 48% da capacidade (400 h)')
    expect(texto(fraseDoBurnupDoPainel(NOV({ dias: dias(30, 10, 3), hoje: '2026-11-03' }), MES))).toBe('No mês, até agora: 30 h · 8% da capacidade (400 h)')
    expect(texto(fraseDoBurnupDoPainel({ ...NOV({ hoje: '2026-11-30' }), capacidade: 0 }, ANO))).toBe('No ano: 190 h')
  })
})

describe('fraseDasHorasPorUnidade (colunas empilhadas)', () => {
  const dados = {
    semanas: ['2026-10-26', '2026-11-02', '2026-11-09'],
    series: [{ nome: 'Ana Lima', horas: [10, 24, 8] }, { nome: 'Beto Silva', horas: [12, 14, 9] }, { nome: 'Outros', horas: [3, 4, 1] }],
  }

  it('a semana mais cheia (soma de todas as séries) e quem mais fez nela', () => {
    const partes = fraseDasHorasPorUnidade(dados, MES)
    expect(texto(partes)).toBe('Semana mais cheia: 02/11, com 42 h · Ana Lima, 24 h')
    expect(fortes(partes)).toEqual(['42 h'])
  })

  it('sem horas', () => {
    expect(texto(fraseDasHorasPorUnidade({ semanas: ['2026-11-02'], series: [] }, PERIODO))).toBe('Nenhuma hora no período')
  })
})

describe('fraseDoCalor (quando os check-ins acontecem)', () => {
  const celula = (dia_semana, hora, checkins) => ({ dia_semana, hora, checkins })

  it('o pico (dia e hora) e o dia mais cheio', () => {
    const partes = fraseDoCalor({ celulas: [celula(1, 9, 4), celula(1, 14, 4), celula(2, 10, 6), celula(3, 15, 1)] })
    expect(texto(partes)).toBe('Mais check-ins na terça às 10h (6) · dia mais cheio: segunda (8)')
    expect(fortes(partes)).toEqual(['terça às 10h'])
  })

  it('as pontas: 7h conta o que começou antes e 20h o que começou depois', () => {
    expect(texto(fraseDoCalor({ celulas: [celula(0, 20, 3)] }))).toBe('Mais check-ins no domingo às 20h ou depois (3) · dia mais cheio: domingo (3)')
    expect(texto(fraseDoCalor({ celulas: [celula(6, 7, 1)] }))).toBe('Mais check-ins no sábado às 7h ou antes (1) · dia mais cheio: sábado (1)')
  })

  it('sem check-ins', () => {
    expect(texto(fraseDoCalor({ celulas: [celula(1, 9, 0)] }))).toBe('Nenhum check-in nessas semanas')
  })
})

describe('fraseDasTarefas e porcentoResolvido (rosca dos check-lists)', () => {
  const T = { feitas: 128, nao_se_aplica: 14, andamento: 9, pausadas: 4, a_fazer: 61, atrasadas: 17, checklists: 31 }

  it('% resolvido (feitas + não se aplica) e as atrasadas', () => {
    const partes = fraseDasTarefas(T)
    expect(texto(partes)).toBe('61% resolvidas · 17 atrasadas')
    expect(fortes(partes)).toEqual(['61%', '17'])
    expect(texto(fraseDasTarefas({ ...T, a_fazer: 77, atrasadas: 1 }))).toBe('61% resolvidas · 1 atrasada')
    expect(texto(fraseDasTarefas({ ...T, a_fazer: 78, atrasadas: 0 }))).toBe('61% resolvidas · nenhuma atrasada')
  })

  it('nunca "100%" com tarefa pendente; o a fazer negativo (contador velho) conta 0; nada para dividir', () => {
    expect(porcentoResolvido({ feitas: 999, nao_se_aplica: 0, andamento: 0, pausadas: 0, a_fazer: 1, atrasadas: 0 })).toBe('99%')
    expect(porcentoResolvido({ feitas: 3, nao_se_aplica: 1, andamento: 0, pausadas: 0, a_fazer: -2, atrasadas: 0 })).toBe('100%')
    expect(porcentoResolvido({ feitas: 1, nao_se_aplica: 0, andamento: 0, pausadas: 0, a_fazer: 999, atrasadas: 0 })).toBe('1%')
    expect(texto(fraseDasTarefas({ feitas: 0, nao_se_aplica: 0, andamento: 0, pausadas: 0, a_fazer: 0, atrasadas: 0, checklists: 2 })))
      .toBe('Nenhuma tarefa nos check-lists ativos')
  })
})

describe('fraseDasCidades e nomeDaCidade (quadradinhos)', () => {
  const dados = { cidades: [{ cidade: 'Chapecó', uf: 'SC', clientes: 22 }, { cidade: 'Xanxerê', uf: 'SC', clientes: 12 }, { cidade: null, uf: null, clientes: 4 }], outras: 30, total: 68 }

  it('a cidade com mais clientes, com a parte do total', () => {
    const partes = fraseDasCidades(dados)
    expect(texto(partes)).toBe('Chapecó/SC tem 32% dos clientes (22 de 68)')
    expect(fortes(partes)).toEqual(['Chapecó/SC'])
  })

  it('só "Sem cidade", ou nenhum cliente', () => {
    expect(texto(fraseDasCidades({ cidades: [{ cidade: null, uf: null, clientes: 3 }], outras: 0, total: 3 }))).toBe('Nenhum cliente com cidade')
    expect(texto(fraseDasCidades({ cidades: [], outras: 0, total: 0 }))).toBe('Nenhum cliente ainda')
  })

  it('o nome: "Cidade/UF", sem UF só a cidade, sem cidade "Sem cidade"', () => {
    expect(nomeDaCidade({ cidade: 'Chapecó', uf: 'SC' })).toBe('Chapecó/SC')
    expect(nomeDaCidade({ cidade: 'Chapecó', uf: null })).toBe('Chapecó')
    expect(nomeDaCidade({ cidade: null, uf: null })).toBe('Sem cidade')
  })
})
