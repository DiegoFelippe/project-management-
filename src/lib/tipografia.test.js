import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALTURA_DA_LINHA, MENOR_TEXTO_DE_GRAFICO, TAMANHO } from './tipografia'

const TABELA = {
  titulo: [20, 28],
  destaque: [26, 32],
  janela: [15, 20],
  subtitulo: [14, 20],
  corpo: [13.5, 20],
  rotulo: [12.5, 18],
  legenda: [11, 16],
  mini: [10.5, 14],
}

describe('tipografia.js (texto de SVG)', () => {
  it('exporta os tamanhos e as alturas de linha da escala do design', () => {
    for (const [nome, [tamanho, linha]] of Object.entries(TABELA)) {
      expect(TAMANHO[nome], nome).toBe(tamanho)
      expect(ALTURA_DA_LINHA[nome], nome).toBe(linha)
    }
    expect(Object.keys(TAMANHO)).toEqual(Object.keys(TABELA))
  })

  it('texto de gráfico nunca fica abaixo de 11 px', () => {
    expect(MENOR_TEXTO_DE_GRAFICO).toBe(11)
    expect(MENOR_TEXTO_DE_GRAFICO).toBeGreaterThanOrEqual(TAMANHO.legenda)
  })
})

describe('escala no CSS (src/index.css)', () => {
  const css = readFileSync('src/index.css', 'utf8')
  it('cada passo da escala é um token --text-<nome> com a altura de linha', () => {
    for (const [nome, [tamanho, linha]] of Object.entries(TABELA)) {
      expect(css, nome).toContain(`--text-${nome}: ${tamanho}px;`)
      expect(css, nome).toContain(`--text-${nome}--line-height: ${linha}px;`)
    }
  })
  it('a fonte padrão é a Inter, com a do sistema de reserva, e não há font-stretch', () => {
    expect(css).toMatch(/--font-sans:\s*'Inter Variable'/)
    expect(css).not.toMatch(/font-stretch/)
  })
  it('.texto-de-campo existe: 16 px no celular e text-corpo a partir de sm', () => {
    const regra = css.slice(css.indexOf('.texto-de-campo'))
    expect(regra).toMatch(/text-base/)
    expect(regra).toMatch(/sm:text-corpo/)
  })
})
