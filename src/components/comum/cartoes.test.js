import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Padrão Hub (item 7 do design): cartões de lista e blocos usam a classe `.card` (rounded-2xl, borda fina e a
// sombra do Hub), não `rounded-xl border bg-card shadow-xs` escrito à mão.
function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

describe('cartões no padrão Hub', () => {
  it('nenhum cartão escrito à mão com rounded-xl + bg-card + shadow-xs', () => {
    const achados = arquivosJsx('src').filter((arq) => !arq.includes('/ui/')).flatMap((arq) => readFileSync(arq, 'utf8').split('\n')
      .map((linha, i) => [arq, i + 1, linha])
      .filter(([, , linha]) => /rounded-(xl|2xl)\b[^"'`]*\bbg-card\b[^"'`]*\bshadow-xs\b/.test(linha) || /\bborder bg-card\b[^"'`]*\bshadow-xs\b/.test(linha))
      .map(([a, n]) => `${a}:${n}`))
    expect(achados).toEqual([])
  })
})
