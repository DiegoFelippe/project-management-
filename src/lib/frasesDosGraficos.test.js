import { describe, expect, it } from 'vitest'
import {
  fraseDaFila, fraseDaOcupacao, fraseDasEtapas, fraseDasHorasPorCliente, fraseDasSemanas, fraseDasSemanasDoCliente,
  fraseDoMesDoCliente, fraseDoRisco, fraseDosConsultores, fraseDosMeses, fraseDosSeisMeses,
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

describe('fraseDosConsultores (cliente)', () => {
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
