import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { atalhosDoPrazo, corDaColuna, CORES_DAS_COLUNAS, OPCOES_DE_PRIORIDADE, PRIORIDADES, seloDoPrazo, TONS_DO_PRAZO } from './cores'

// Classe com cor do Tailwind (bg-indigo-50, text-rose-700…): o quadro usa só os tokens do tema (cores vivas, 19/11).
const COR_DO_TAILWIND = /(?:^|[\s:'"])(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/

describe('cores das colunas', () => {
  it('10 cores, na ordem que o banco guarda (0 a 9)', () => {
    expect(CORES_DAS_COLUNAS.map((c) => c.nome)).toEqual([
      'Cinza', 'Índigo', 'Azul', 'Turquesa', 'Verde', 'Amarelo', 'Laranja', 'Vermelho', 'Rosa', 'Roxo',
    ])
  })

  it('cada cor nos tokens da paleta: contador e amostra no cheio + sobre (4,5:1, src/lib/contraste.test.js), fundo no véu do suave, bolinha no forte', () => {
    for (const c of CORES_DAS_COLUNAS.filter((cor) => cor.nome !== 'Vermelho')) {
      expect(c.cheio, c.nome).toBe(`bg-cor-${c.paleta}-cheio text-cor-${c.paleta}-sobre`)
      expect(c.corpo, c.nome).toBe(`bg-cor-${c.paleta}-suave/40 border-cor-${c.paleta}-suave`)
      expect(c.ponto, c.nome).toBe(`bg-cor-${c.paleta}-forte`)
    }
  })

  it('o Vermelho fica no vermelho de estado (a paleta não tem vermelho): as 10 cores continuam diferentes', () => {
    const vermelho = CORES_DAS_COLUNAS.find((c) => c.nome === 'Vermelho')
    expect(vermelho).toMatchObject({ cheio: 'bg-destructive-cheio text-sobre-destructive', corpo: 'bg-destructive-soft/40 border-destructive-soft', ponto: 'bg-destructive-cheio' })
    expect(new Set(CORES_DAS_COLUNAS.map((c) => c.cheio)).size).toBe(10)
  })

  it('nenhuma cor do Tailwind nem hex no arquivo: só os tokens do tema', () => {
    const codigo = readFileSync('src/components/quadro/cores.js', 'utf8')
    expect(codigo).not.toMatch(COR_DO_TAILWIND)
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
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

  it('o selo é sólido (cheio + sobre): baixa no verde, média no mostarda e alta no vermelho de estado', () => {
    expect(PRIORIDADES.baixa.selo).toBe('bg-cor-verde-cheio text-cor-verde-sobre')
    expect(PRIORIDADES.media.selo).toBe('bg-cor-mostarda-cheio text-cor-mostarda-sobre')
    expect(PRIORIDADES.alta.selo).toBe('bg-destructive-cheio text-sobre-destructive')
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

  it('os tons do prazo nos tokens de estado (o suave com o texto do estado)', () => {
    expect(TONS_DO_PRAZO).toEqual({
      perigo: 'bg-destructive-soft text-destructive', aviso: 'bg-notice-soft text-notice', neutro: 'bg-muted text-muted-foreground',
    })
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
