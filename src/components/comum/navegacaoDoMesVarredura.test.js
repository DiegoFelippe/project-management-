import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Padrão Hub (CLAUDE.md): a navegação de mês é sempre a NavegacaoDoMes. Exceção permitida: o Calendário (components/calendario/CalendarioDaAgenda.jsx, no menu e na aba Agenda do cliente),
// cujo "Hoje ‹ ›" anda por semana ou mês como o Hub e não usa deslocarMes nem esses rótulos (por isso não está na lista abaixo). Quem usa deslocarMes (ou os rótulos "Mês anterior"/"Próximo mês") fora dela
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
      .filter((nome) => !['components/comum/NavegacaoDoMes.jsx', 'lib/mes.js', 'components/campos/CampoData.jsx'].includes(nome))
      .filter((nome) => /deslocarMes|Mês anterior|Próximo mês/.test(readFileSync(join(process.cwd(), 'src', nome), 'utf8')))
    expect(feitosAMao).toEqual([])
  })
})
