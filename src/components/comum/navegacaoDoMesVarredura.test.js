import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Padrão Hub (CLAUDE.md): a navegação de mês é sempre a NavegacaoDoMes. Quem usa deslocarMes fora dela
// (e do próprio lib/mes) está montando o "Anterior / Próximo" à mão. A paginação da Tabela não é mês.
function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : []
  })
}

describe('navegação de mês', () => {
  it('nenhuma tela monta o Anterior/Próximo do mês à mão', () => {
    const feitosAMao = arquivos(join(process.cwd(), 'src'))
      .map((arquivo) => arquivo.split('/src/')[1])
      .filter((nome) => !['components/comum/NavegacaoDoMes.jsx', 'lib/mes.js'].includes(nome))
      .filter((nome) => /deslocarMes/.test(readFileSync(join(process.cwd(), 'src', nome), 'utf8')))
    expect(feitosAMao).toEqual([])
  })
})
