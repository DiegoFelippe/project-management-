import { describe, expect, it } from 'vitest'
import { ehCentral, ehPapelDeConsultoria, papeisQuePodeDar, veTudo } from './papeis'

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

  it('papeisQuePodeDar segue a tabela "Papéis na ficha"', () => {
    const valores = (papel) => papeisQuePodeDar({ papel }).map((p) => p.valor)
    expect(valores('dono')).toEqual(['admin', 'central'])
    expect(valores('central')).toEqual(['admin'])
    expect(valores('admin')).toEqual(['pessoa', 'gestor'])
    expect(valores('gestor')).toEqual(['pessoa'])
    expect(valores('pessoa')).toEqual([])
    expect(papeisQuePodeDar({ papel: 'admin' })[1]).toEqual({ valor: 'gestor', rotulo: 'Gestor' })
  })

  it('ehPapelDeConsultoria: administrador, gestor e pessoa', () => {
    expect(['admin', 'gestor', 'pessoa'].every(ehPapelDeConsultoria)).toBe(true)
    expect(ehPapelDeConsultoria('central')).toBe(false)
    expect(ehPapelDeConsultoria('dono')).toBe(false)
  })
})
