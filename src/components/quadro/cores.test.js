import { describe, expect, it } from 'vitest'
import { atalhosDoPrazo, corDaColuna, CORES_DAS_COLUNAS, OPCOES_DE_PRIORIDADE, PRIORIDADES, seloDoPrazo } from './cores'

describe('cores das colunas', () => {
  it('10 cores, na ordem que o banco guarda (0 a 9)', () => {
    expect(CORES_DAS_COLUNAS.map((c) => c.nome)).toEqual([
      'Cinza', 'Índigo', 'Azul', 'Turquesa', 'Verde', 'Amarelo', 'Laranja', 'Vermelho', 'Rosa', 'Roxo',
    ])
  })

  it('a cor escolhida vale; sem cor, a automática pela posição', () => {
    expect(corDaColuna({ cor: 7 }, 0)).toBe(7)
    expect(corDaColuna({ cor: 0 }, 3)).toBe(0)
    expect(corDaColuna({ cor: null }, 0)).toBe(1)
    expect(corDaColuna({ cor: null }, 1)).toBe(4)
    expect(corDaColuna({ cor: null }, 5)).toBe(0)
  })
})

describe('prioridade', () => {
  it('baixa, média e alta, com rótulo', () => {
    expect(OPCOES_DE_PRIORIDADE).toEqual([
      { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'media', rotulo: 'Média' }, { valor: 'alta', rotulo: 'Alta' },
    ])
    expect(PRIORIDADES.alta.rotulo).toBe('Alta')
  })
})

describe('selo do prazo', () => {
  const HOJE = '2026-11-17'
  it('atrasado há N dias, Hoje, Amanhã e a data', () => {
    expect(seloDoPrazo('2026-11-16', HOJE)).toMatchObject({ texto: 'Atrasado há 1 dia', tom: 'perigo' })
    expect(seloDoPrazo('2026-11-10', HOJE)).toMatchObject({ texto: 'Atrasado há 7 dias', tom: 'perigo' })
    expect(seloDoPrazo('2026-11-17', HOJE)).toMatchObject({ texto: 'Hoje', tom: 'aviso' })
    expect(seloDoPrazo('2026-11-18', HOJE)).toMatchObject({ texto: 'Amanhã', tom: 'aviso' })
    expect(seloDoPrazo('2026-11-25', HOJE)).toMatchObject({ texto: '25 nov', tom: 'neutro' })
    expect(seloDoPrazo('2027-01-03', HOJE)).toMatchObject({ texto: '03 jan 2027', tom: 'neutro' })
  })

  it('na coluna de concluídos o prazo não conta como atrasado', () => {
    expect(seloDoPrazo('2026-11-10', HOJE, true)).toMatchObject({ texto: '10 nov', tom: 'neutro', concluido: true })
  })

  it('sem prazo, sem selo', () => {
    expect(seloDoPrazo(null, HOJE)).toBeNull()
  })
})

describe('atalhos do prazo (Amanhã e Sexta, além do Hoje do calendário)', () => {
  it('amanhã e a próxima sexta; numa sexta, a da semana que vem', () => {
    // 2026-11-18 é quarta; 2026-11-20 é sexta.
    expect(atalhosDoPrazo('2026-11-18')).toEqual([{ rotulo: 'Amanhã', valor: '2026-11-19' }, { rotulo: 'Sexta', valor: '2026-11-20' }])
    expect(atalhosDoPrazo('2026-11-20')).toEqual([{ rotulo: 'Amanhã', valor: '2026-11-21' }, { rotulo: 'Sexta', valor: '2026-11-27' }])
    expect(atalhosDoPrazo('2026-11-22')[1]).toEqual({ rotulo: 'Sexta', valor: '2026-11-27' })
  })
})
