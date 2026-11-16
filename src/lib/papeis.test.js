import { describe, expect, it } from 'vitest'
import { ehCentral, veTudo } from './papeis'

describe('papéis', () => {
  it('veTudo: dono e central', () => {
    expect(veTudo({ papel: 'central' })).toBe(true)
    expect(veTudo({ papel: 'dono' })).toBe(true)
    expect(veTudo({ papel: 'admin' })).toBe(false)
    expect(veTudo(null)).toBe(false)
  })

  it('ehCentral: só central', () => {
    expect(ehCentral({ papel: 'central' })).toBe(true)
    expect(ehCentral({ papel: 'dono' })).toBe(false)
  })
})
