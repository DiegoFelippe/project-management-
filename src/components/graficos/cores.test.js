import { describe, expect, it } from 'vitest'
import { COR, COR_OUTROS, PALETA, corDaPaleta, corDaSerie } from './cores'

describe('paleta dos gráficos', () => {
  it('corDaSerie segue a ordem e volta ao começo depois de 8', () => {
    expect(PALETA).toHaveLength(8)
    PALETA.forEach((nome, i) => expect(corDaSerie(i)).toBe(`var(--cor-${nome}-forte)`))
    expect(corDaSerie(8)).toBe(corDaSerie(0))
    expect(corDaSerie(10)).toBe(corDaSerie(2))
  })

  it('COR_OUTROS é grafite', () => {
    expect(COR_OUTROS).toBe('var(--cor-grafite-forte)')
  })

  it('corDaPaleta usa o tom forte por padrão', () => {
    expect(corDaPaleta('rosa')).toBe('var(--cor-rosa-forte)')
    expect(corDaPaleta('rosa', 'suave')).toBe('var(--cor-rosa-suave)')
  })

  it('COR ganha os estados da rosca e das etapas', () => {
    for (const k of ['feita', 'nsa', 'andamento', 'pausada', 'afazer', 'atrasada']) expect(COR[k], k).toMatch(/^var\(--/)
  })
})
