import { afterEach, describe, expect, it, vi } from 'vitest'
import { avaliarSenha, gerarSenha, mensagemDeValidacao } from './senha'

describe('avaliarSenha', () => {
  it('lista as cinco regras e marca as cumpridas', () => {
    const r = avaliarSenha('abc')
    expect(r.regras.map((x) => x.id)).toEqual(['tamanho', 'maiuscula', 'minuscula', 'numero', 'simbolo'])
    expect(r.regras.filter((x) => x.ok).map((x) => x.id)).toEqual(['minuscula'])
  })

  it('vazia ou só uma regra é Fraca; três ou quatro é Média; todas é Forte', () => {
    expect(avaliarSenha('').forca).toBe('fraca')
    expect(avaliarSenha('abcdefghijkl').forca).toBe('fraca')
    expect(avaliarSenha('abcdefghij1').forca).toBe('fraca')
    expect(avaliarSenha('Abcdefghij1').forca).toBe('media')
    expect(avaliarSenha('Abcdefghij1!').forca).toBe('forte')
  })

  it('só é Forte com pelo menos 10 caracteres', () => {
    expect(avaliarSenha('Abc1!').forte).toBe(false)
    expect(avaliarSenha('Abcdef12!').forte).toBe(false)
    expect(avaliarSenha('Abcdef123!').forte).toBe(true)
  })

  it('espaço não conta como símbolo, e espaço no começo ou no fim (colar com espaço) tira o Forte', () => {
    expect(avaliarSenha('Abcdefg 123').regras.find((x) => x.id === 'simbolo').ok).toBe(false)
    expect(avaliarSenha('Abcdef123! ').forte).toBe(false)
    expect(avaliarSenha(' Abcdef123!').forte).toBe(false)
    expect(avaliarSenha('Abcdef 123!').forte).toBe(true)
  })

  it('letra com acento não conta como maiúscula nem minúscula (o servidor só aceita A-Z e a-z)', () => {
    expect(avaliarSenha('ÁÉÍÓÚ').regras.find((x) => x.id === 'maiuscula').ok).toBe(false)
    expect(avaliarSenha('áéíóú').regras.find((x) => x.id === 'minuscula').ok).toBe(false)
  })
})

describe('mensagemDeValidacao', () => {
  it('forte: uma frase dizendo que está forte', () => {
    expect(mensagemDeValidacao('Abcdef123!')).toBe('Senha forte. Pode salvar.')
  })
  it('fraca: diz o que falta', () => {
    expect(mensagemDeValidacao('abc')).toBe('Senha fraca. Falta: pelo menos 10 caracteres, uma letra maiúscula, um número e um símbolo.')
    expect(mensagemDeValidacao('Abcdefghij1')).toBe('Senha média. Falta: um símbolo.')
  })
  it('vazia: pede para digitar', () => {
    expect(mensagemDeValidacao('')).toBe('Digite uma senha para validar.')
  })
  it('espaço nas pontas é avisado', () => {
    expect(mensagemDeValidacao('Abcdef123! ')).toMatch(/espaço no começo ou no fim/)
  })
})

describe('gerarSenha', () => {
  afterEach(() => vi.restoreAllMocks())

  it('16 caracteres, com todos os tipos, sempre Forte', () => {
    for (let i = 0; i < 300; i += 1) {
      const s = gerarSenha()
      expect(s).toHaveLength(16)
      expect(avaliarSenha(s).forte).toBe(true)
      expect(s).toMatch(/[a-z]/)
      expect(s).toMatch(/[A-Z]/)
      expect(s).toMatch(/\d/)
      expect(s).not.toMatch(/\s/)
    }
  })

  it('usa crypto.getRandomValues (nunca Math.random)', () => {
    const cripto = vi.spyOn(crypto, 'getRandomValues')
    const sorteio = vi.spyOn(Math, 'random')
    gerarSenha()
    expect(cripto).toHaveBeenCalled()
    expect(sorteio).not.toHaveBeenCalled()
  })

  it('duas senhas seguidas são diferentes', () => {
    expect(gerarSenha()).not.toBe(gerarSenha())
  })
})
