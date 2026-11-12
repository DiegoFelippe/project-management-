import { describe, expect, it } from 'vitest'
import { POR_PAGINA, faixa } from './paginar'

describe('paginar', () => {
  it('15 por página: a faixa de linhas que o banco devolve', () => {
    expect(POR_PAGINA).toBe(15)
    expect(faixa(1)).toEqual([0, 14])
    expect(faixa(3)).toEqual([30, 44])
  })
})
