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
  [/(?<![\w-])(?:[\w-]+:)*text-\[\d+(?:\.\d+)?px\]/, 'text-[Npx]'],
  [/(?<![\w-])(?:[\w-]+:)*text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)(?![\w-])/, 'text-xs…3xl'],
  [/font-stretch/, 'font-stretch'],
  [/font-family|fontFamily/, 'font-family'],
  [/fontSize(?!=\{TAMANHO\.\w+\})/, 'fontSize fora de src/lib/tipografia.js'],
]

describe('tipografia', () => {
  it('nenhuma tela usa tamanho cru, font-stretch ou font-family: só a escala', () => {
    const achados = []
    for (const arquivo of arquivos(join(process.cwd(), 'src'))) {
      const nome = arquivo.split('/src/')[1]
      readFileSync(arquivo, 'utf8').split('\n').forEach((linha, i) => {
        for (const [regra, rotulo] of PROIBIDOS) {
          if (regra.test(linha)) achados.push(`${nome}:${i + 1} ${rotulo}`)
        }
      })
    }
    expect(achados).toEqual([])
  })
})
