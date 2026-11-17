import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regra de tipografia (CLAUDE.md): tamanho só pela escala nomeada (text-titulo … text-mini), fonte única (Inter, em src/index.css)
// e texto de SVG só pelas constantes de src/lib/tipografia.js. Tamanho cru só no src/index.css.
function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : []
  })
}

const PROIBIDOS = [
  [/(?<![\w-])(?:[\w-]+:)*text-\[(?:length:)?[\d.]+(?:px|r?em)\]/, 'text-[Npx]'],
  [/(?<![\w-])(?:[\w-]+:)*text-(?:xs|sm|base|lg|[2-9]?xl)(?![\w-])/, 'text-xs…9xl'],
  [/\[font-size:|text-\(length:|(?<![\w-])(?:[\w-]+:)*font-\[|font-serif|font-mono|['"]font-size['"]/, 'font-size/font-family avulso'],
  [/font-stretch/, 'font-stretch'],
  [/font-family|fontFamily/, 'font-family'],
  [/fontSize(?!=\{TAMANHO\.\w+\})/, 'fontSize fora de src/lib/tipografia.js'],
]

const acha = (linha) => PROIBIDOS.some(([regra]) => regra.test(linha))

describe('as regras da varredura', () => {
  it('pegam cada forma proibida', () => {
    for (const ruim of ['text-5xl', 'text-9xl', 'sm:text-[0.8rem]', 'text-[1.1em]', 'text-[length:13px]', 'text-(length:--x)',
      '[font-size:13px]', 'font-[Roboto]', 'font-serif', 'font-mono', "style={{ 'font-size': 13 }}", 'md:text-2xl', 'text-[13px]']) {
      expect(acha(ruim), ruim).toBe(true)
    }
  })
  it('não pegam a escala, cores nem peso', () => {
    for (const bom of ['text-corpo', 'sm:text-janela', 'text-primary', 'text-foreground/80', 'text-muted-foreground', 'text-base-foreground',
      'text-destructive', 'font-semibold', 'font-medium', 'text-center', 'text-balance', 'text-[var(--cor)]', 'font-sans']) {
      expect(acha(bom), bom).toBe(false)
    }
  })
})

describe('tipografia', () => {
  it('nenhuma tela usa tamanho cru, font-stretch ou font-family: só a escala', () => {
    const achados = []
    for (const arquivo of arquivos(join(process.cwd(), 'src'))) {
      const nome = arquivo.split('/src/')[1]
      // utils.js registra os nomes da escala no tailwind-merge com a chave 'font-size': não é tamanho de texto.
      readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        if (nome === 'lib/utils.js') return
        for (const [regra, rotulo] of PROIBIDOS) {
          if (regra.test(linha)) achados.push(`${nome}:${i + 1} ${rotulo}`)
        }
      })
    }
    expect(achados).toEqual([])
  })
})
