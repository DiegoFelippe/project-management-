import { describe, expect, it } from 'vitest'
import { iniciais, juntar, plural, primeiroNome } from './nomes'

describe('juntar', () => {
  it('lista em português: "A", "A e B", "A, B e C"', () => {
    expect(juntar([])).toBe('')
    expect(juntar(['Acme'])).toBe('Acme')
    expect(juntar(['Acme', 'Beta'])).toBe('Acme e Beta')
    expect(juntar(['Acme', 'Beta', 'Gama'])).toBe('Acme, Beta e Gama')
    expect(juntar(['da 1', 'da 2', 'da 4'])).toBe('da 1, da 2 e da 4')
  })
})

describe('plural', () => {
  it('o número (com ponto de milhar) e a palavra no singular ou no plural', () => {
    expect(plural(0, 'tarefa', 'tarefas')).toBe('0 tarefas')
    expect(plural(1, 'tarefa', 'tarefas')).toBe('1 tarefa')
    expect(plural(2, 'etapa', 'etapas')).toBe('2 etapas')
    expect(plural(1234, 'cliente', 'clientes')).toBe('1.234 clientes')
  })
})

describe('iniciais e primeiroNome', () => {
  it('continuam como antes', () => {
    expect(iniciais('Diego Felippe')).toBe('DF')
    expect(primeiroNome('  Ana Lima ')).toBe('Ana')
  })
})
