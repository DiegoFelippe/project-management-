import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regra do projeto (CLAUDE.md, "Padrão Hub"): nada de <select> nem de type="date|time|number|datetime-local"
// nativos fora de src/components/campos/. Use Seletor, CampoData, CampoHora e CampoNumero.
const PROIBIDOS = [/<select\b/, /type\s*=\s*["']date["']/, /type\s*=\s*["']time["']/, /type\s*=\s*["']number["']/, /type\s*=\s*["']datetime-local["']/]

function arquivosJsx(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosJsx(caminho)
    return nome.endsWith('.jsx') && !nome.includes('.test.') ? [caminho] : []
  })
}

// Tira comentários (// e /* */, inclusive {/* */}) mantendo as quebras de linha, para o número da linha não mudar.
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, antes) => antes)
}

describe('campos nativos proibidos', () => {
  it('nenhum <select> nem type="date|time|number|datetime-local" fora de src/components/campos/', () => {
    const achados = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const relativo = arquivo.split('/src/')[1]
      if (relativo.startsWith('components/campos/')) continue
      semComentarios(readFileSync(arquivo, 'utf8')).split('\n').forEach((linha, i) => {
        if (PROIBIDOS.some((regra) => regra.test(linha))) achados.push(`src/${relativo}:${i + 1}: ${linha.trim().slice(0, 80)}`)
      })
    }
    expect(achados).toEqual([])
  })
})
