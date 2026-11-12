import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

// Regra do projeto (CLAUDE.md): todo botão anima ao passar o mouse e ao apertar.
function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

// A tag de abertura vai até o primeiro ">" fora de chaves (o "=>" de um onClick não conta).
function aberturaDaTag(codigo, inicio) {
  let profundidade = 0
  for (let i = inicio; i < codigo.length; i++) {
    const c = codigo[i]
    if (c === '{') profundidade += 1
    else if (c === '}') profundidade -= 1
    else if (c === '>' && profundidade === 0) return codigo.slice(inicio, i + 1)
  }
  return codigo.slice(inicio)
}

describe('botões animados', () => {
  it('o componente Button anima no hover e ao apertar', () => {
    render(<Button>Salvar</Button>)
    const botao = screen.getByRole('button', { name: 'Salvar' })
    expect(botao).toHaveClass('botao-animado')
    expect(botao.className).toMatch(/hover:-translate-y-px/)
    expect(botao.className).toMatch(/active:scale-\[0\.97\]/)
  })

  it('todo <button> escrito à mão também usa a animação (ou é item do trilho, que tem a sua)', () => {
    const semAnimacao = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const codigo = readFileSync(arquivo, 'utf8')
      for (const achado of codigo.matchAll(/<button\b/g)) {
        const tag = aberturaDaTag(codigo, achado.index)
        if (!tag.includes('botao-animado') && !tag.includes('data-item-trilho')) {
          semAnimacao.push(`${arquivo.split('/src/')[1]}: ${tag.slice(0, 80)}`)
        }
      }
    }
    expect(semAnimacao).toEqual([])
  })
})
