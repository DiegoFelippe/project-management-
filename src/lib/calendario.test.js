import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  agruparPorDia, cuidaDoEvento, diaDaSemana, diaEmSP, diasDoEvento, gradeDoMes, horaEmSP, horarioNoDia, instanteEmSP,
  limitesEmSP, montarHorario, navegar, nomeDoFeriado, periodoDaVisao, rotuloDoPeriodo, semanaDe, somarDias,
} from './calendario'

// O computador num fuso longe de São Paulo (antes de qualquer data ser criada): nada aqui pode depender dele.
const fusoOriginal = vi.hoisted(() => {
  const original = process.env.TZ
  process.env.TZ = 'Asia/Tokyo'
  return original
})
afterAll(() => {
  if (fusoOriginal === undefined) delete process.env.TZ
  else process.env.TZ = fusoOriginal
})

describe('dias', () => {
  it('soma dias atravessando mês e ano, e sabe o dia da semana (domingo = 0)', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(diaDaSemana('2026-11-01')).toBe(0)
    expect(diaDaSemana('2026-11-17')).toBe(2)
  })

  it('grade do mês começa no domingo e termina no sábado, com semanas inteiras', () => {
    const novembro = gradeDoMes('2026-11-17')
    expect(novembro.dias[0]).toBe('2026-11-01')
    expect(novembro.dias.at(-1)).toBe('2026-12-05')
    expect(novembro.dias).toHaveLength(35)
    expect(novembro).toMatchObject({ de: '2026-11-01', ate: '2026-12-06' })
    const dezembro = gradeDoMes('2026-12-01')
    expect(dezembro.dias[0]).toBe('2026-11-29')
    expect(dezembro.dias.at(-1)).toBe('2027-01-02')
    for (let i = 0; i < dezembro.dias.length; i += 7) expect(diaDaSemana(dezembro.dias[i])).toBe(0)
    // Mês que começa no sábado e tem 31 dias: 6 semanas.
    expect(gradeDoMes('2026-08-10').dias).toHaveLength(42)
  })

  it('semana de domingo a sábado', () => {
    expect(semanaDe('2026-11-17')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
    expect(semanaDe('2026-11-15')[0]).toBe('2026-11-15')
    expect(semanaDe('2026-11-21')[0]).toBe('2026-11-15')
  })

  it('período de cada visão: o mês da grade, a semana, e a agenda dos próximos 60 dias a partir de hoje', () => {
    expect(periodoDaVisao('mes', '2026-11-17', '2026-11-17')).toMatchObject({ de: '2026-11-01', ate: '2026-12-06' })
    expect(periodoDaVisao('semana', '2026-11-17', '2026-11-17')).toMatchObject({ de: '2026-11-15', ate: '2026-11-22' })
    const agenda = periodoDaVisao('agenda', '2026-03-02', '2026-11-17')
    expect(agenda).toMatchObject({ de: '2026-11-17', ate: '2027-01-16' })
    expect(agenda.dias).toHaveLength(60)
  })

  it('anda um período para trás e para a frente', () => {
    expect(navegar('mes', '2026-11-17', 1)).toBe('2026-12-01')
    expect(navegar('mes', '2026-01-31', -1)).toBe('2025-12-01')
    expect(navegar('semana', '2026-11-17', 1)).toBe('2026-11-24')
    expect(navegar('semana', '2026-11-17', -1)).toBe('2026-11-10')
  })

  it('rótulo do período', () => {
    expect(rotuloDoPeriodo('mes', '2026-11-17')).toBe('Novembro de 2026')
    expect(rotuloDoPeriodo('semana', '2026-11-17')).toBe('15 a 21 de novembro de 2026')
    expect(rotuloDoPeriodo('semana', '2026-12-01')).toBe('29 de novembro a 5 de dezembro de 2026')
    expect(rotuloDoPeriodo('semana', '2026-12-31')).toBe('27 de dezembro de 2026 a 2 de janeiro de 2027')
    expect(rotuloDoPeriodo('agenda', '2026-11-17')).toBe('Próximos 60 dias')
  })
})

describe('instantes no fuso de São Paulo', () => {
  it('dia e hora de São Paulo viram instante, e o instante volta para o dia e a hora de lá', () => {
    expect(instanteEmSP('2026-11-20', '14:00')).toBe('2026-11-20T14:00:00-03:00')
    expect(instanteEmSP('2026-11-20')).toBe('2026-11-20T00:00:00-03:00')
    // Horário de verão de 2018/2019: o fuso daquele dia, não o de hoje.
    expect(instanteEmSP('2019-01-10', '10:00')).toBe('2019-01-10T10:00:00-02:00')
    expect(diaEmSP('2026-11-18T01:30:00Z')).toBe('2026-11-17')
    expect(horaEmSP('2026-11-18T01:30:00Z')).toBe('22:30')
    expect(limitesEmSP('2026-11-01', '2026-12-06')).toEqual({ de: '2026-11-01T00:00:00-03:00', ate: '2026-12-06T00:00:00-03:00' })
  })
})

const evento = (inicio, fim, extra = {}) => ({ id: 'e', titulo: 'Reunião', inicio, fim, dia_inteiro: false, ...extra })

describe('dias do evento', () => {
  it('evento que atravessa a meia-noite aparece nos dois dias de São Paulo', () => {
    expect(diasDoEvento(evento('2026-11-17T22:00:00-03:00', '2026-11-18T02:00:00-03:00'))).toEqual(['2026-11-17', '2026-11-18'])
  })

  it('fim exatamente à meia-noite não ocupa o dia seguinte', () => {
    expect(diasDoEvento(evento('2026-11-17T23:00:00-03:00', '2026-11-18T00:00:00-03:00'))).toEqual(['2026-11-17'])
  })

  it('dia inteiro: da meia-noite do primeiro dia à do dia seguinte ao último (fim exclusivo)', () => {
    const feriadao = evento('2026-11-20T00:00:00-03:00', '2026-11-22T00:00:00-03:00', { dia_inteiro: true })
    expect(diasDoEvento(feriadao)).toEqual(['2026-11-20', '2026-11-21'])
    // Vindo do banco em UTC, o dia continua o de São Paulo.
    expect(diasDoEvento(evento('2026-11-20T03:00:00Z', '2026-11-21T03:00:00Z', { dia_inteiro: true }))).toEqual(['2026-11-20'])
  })

  it('horário no dia: mesmo dia, primeiro dia, último dia e dia do meio', () => {
    expect(horarioNoDia(evento('2026-11-17T14:00:00-03:00', '2026-11-17T15:30:00-03:00'), '2026-11-17')).toBe('14:00 – 15:30')
    const longo = evento('2026-11-17T22:00:00-03:00', '2026-11-19T02:00:00-03:00')
    expect(horarioNoDia(longo, '2026-11-17')).toBe('22:00 – 19/11 02:00')
    expect(horarioNoDia(longo, '2026-11-18')).toBe('O dia todo')
    expect(horarioNoDia(longo, '2026-11-19')).toBe('Até 02:00')
    expect(horarioNoDia(evento('2026-11-20T00:00:00-03:00', '2026-11-21T00:00:00-03:00', { dia_inteiro: true }), '2026-11-20')).toBe('Dia inteiro')
  })
})

describe('itens por dia', () => {
  it('eventos, ausências e feriados nos dias pedidos, em ordem: feriado, ausência, dia inteiro, horário', () => {
    const dias = ['2026-11-19', '2026-11-20', '2026-11-21']
    const porDia = agruparPorDia({
      dias,
      eventos: [
        evento('2026-11-20T15:00:00-03:00', '2026-11-20T16:00:00-03:00', { id: 'tarde' }),
        evento('2026-11-20T09:00:00-03:00', '2026-11-20T10:00:00-03:00', { id: 'manha' }),
        evento('2026-11-20T00:00:00-03:00', '2026-11-21T00:00:00-03:00', { id: 'todo', dia_inteiro: true }),
        evento('2026-11-25T09:00:00-03:00', '2026-11-25T10:00:00-03:00', { id: 'fora' }),
      ],
      ausencias: [{ id: 'a1', de: '2026-11-18', ate: '2026-11-20', motivo: 'Férias', pessoa: { id: 'p1', nome: 'Ana' } }],
      feriados: ['2026-11-20'],
    })
    expect(porDia.get('2026-11-20').map((i) => `${i.tipo}:${i.id}`)).toEqual([
      'feriado:2026-11-20', 'ausencia:a1', 'evento:todo', 'evento:manha', 'evento:tarde',
    ])
    expect(porDia.get('2026-11-19').map((i) => i.id)).toEqual(['a1'])
    expect(porDia.has('2026-11-21')).toBe(false)
    expect([...porDia.keys()]).not.toContain('2026-11-25')
  })

  it('nome do feriado nacional, inclusive a Sexta-feira Santa', () => {
    expect(nomeDoFeriado('2026-11-20')).toBe('Consciência Negra')
    expect(nomeDoFeriado('2026-04-03')).toBe('Sexta-feira Santa')
  })
})

describe('montar o horário da janela', () => {
  it('com horário: início e fim em São Paulo', () => {
    expect(montarHorario({ data: '2026-11-20', horaInicio: '14:00', horaFim: '15:00' })).toEqual({
      inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00', dia_inteiro: false,
    })
  })

  it('só o início: dura uma hora', () => {
    expect(montarHorario({ data: '2026-11-20', horaInicio: '23:30', horaFim: '' })).toMatchObject({
      inicio: '2026-11-20T23:30:00-03:00', fim: '2026-11-21T00:30:00-03:00',
    })
  })

  it('sem horário: dia inteiro, até o dia em que termina (inclusive)', () => {
    expect(montarHorario({ data: '2026-11-20', horaInicio: '', horaFim: '', dataFim: '2026-11-22' })).toEqual({
      inicio: '2026-11-20T00:00:00-03:00', fim: '2026-11-23T00:00:00-03:00', dia_inteiro: true,
    })
  })

  it('termina em outro dia, com horário', () => {
    expect(montarHorario({ data: '2026-11-20', horaInicio: '22:00', horaFim: '02:00', dataFim: '2026-11-21' })).toMatchObject({
      inicio: '2026-11-20T22:00:00-03:00', fim: '2026-11-21T02:00:00-03:00',
    })
  })

  it('recusa o que o banco recusaria', () => {
    expect(montarHorario({ data: '' }).erro).toBe('Escolha a data do evento.')
    expect(montarHorario({ data: '2026-11-20', horaInicio: '15:00', horaFim: '14:00' }).erro).toBe('O fim precisa ser depois do início.')
    expect(montarHorario({ data: '2026-11-20', dataFim: '2026-11-19' }).erro).toBe('O dia em que termina não pode ser antes do início.')
    expect(montarHorario({ data: '2026-11-20', horaFim: '15:00' }).erro).toMatch(/horário de início/)
    expect(montarHorario({ data: '2026-11-01', dataFim: '2026-12-02' }).erro).toBe('Um evento dura no máximo 31 dias.')
    expect(montarHorario({ data: '2026-11-01', dataFim: '2026-12-01' }).erro).toBeUndefined()
  })
})

describe('quem cuida do evento (a mesma regra da Edge Function)', () => {
  const ev = { consultoria_id: 's1', consultor_id: 'p1' }
  it('central e dono em todos; gestão na consultoria; consultor só nos dele', () => {
    expect(cuidaDoEvento({ id: 'c0', papel: 'central' }, ev)).toBe(true)
    expect(cuidaDoEvento({ id: 'd0', papel: 'dono' }, ev)).toBe(true)
    expect(cuidaDoEvento({ id: 'g1', papel: 'gestor', consultoria_id: 's1' }, ev)).toBe(true)
    expect(cuidaDoEvento({ id: 'g2', papel: 'admin', consultoria_id: 's2' }, ev)).toBe(false)
    expect(cuidaDoEvento({ id: 'p1', papel: 'pessoa', consultoria_id: 's1' }, ev)).toBe(true)
    expect(cuidaDoEvento({ id: 'p2', papel: 'pessoa', consultoria_id: 's1' }, ev)).toBe(false)
  })
})
