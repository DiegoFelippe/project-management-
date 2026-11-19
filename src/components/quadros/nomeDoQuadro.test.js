import { describe, expect, it } from 'vitest'
import { oQuadro, OQuadro } from './nomeDoQuadro'

describe('nome do quadro nos textos', () => {
  it('"quadro <nome>", ou só o nome quando ele já começa com "Quadro" (nada de "Quadro Quadro")', () => {
    expect(oQuadro('Sprint')).toBe('quadro Sprint')
    expect(OQuadro('Sprint')).toBe('Quadro Sprint')
    expect(oQuadro('Quadro de metas')).toBe('Quadro de metas')
    expect(OQuadro('quadro de metas')).toBe('Quadro de metas')
    expect(oQuadro('  Quadro teste (apagar) ')).toBe('Quadro teste (apagar)')
    // "Quadros…" e "Quadrado" não são a palavra "Quadro".
    expect(oQuadro('Quadros do mês')).toBe('quadro Quadros do mês')
    expect(oQuadro('Quadrado')).toBe('quadro Quadrado')
  })
})
