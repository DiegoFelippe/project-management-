import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regra do projeto (CLAUDE.md, "Padrão Hub"): nada de <select> nem de type="date|time|number|datetime-local"
// nativos fora de src/components/campos/. Use Seletor, CampoData, CampoHora e CampoNumero.
const PROIBIDOS = [/<select\b/, /\btype\s*=\s*\{?\s*["'`](date|time|number|datetime-local)["'`]/]

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

// Devolve "linha: texto" de cada linha (fora de comentários) com campo nativo proibido.
function achaCampoNativo(codigo) {
  const achados = []
  semComentarios(codigo).split('\n').forEach((linha, i) => {
    if (PROIBIDOS.some((regra) => regra.test(linha))) achados.push(`${i + 1}: ${linha.trim().slice(0, 80)}`)
  })
  return achados
}

describe('detector de campos nativos', () => {
  it.each([
    '<input type="date" />',
    "<input type='time' />",
    "<input type={'number'} />",
    '<input type={"datetime-local"} />',
    '<input type={`date`} />',
    '<select value={a}>',
  ])('acusa %s', (codigo) => {
    expect(achaCampoNativo(codigo)).toHaveLength(1)
  })

  it.each([
    '// <input type="date" />',
    '{/* <select> */}',
    '/* type="time" */',
    '<input type="text" />',
    '<Seletor />',
  ])('não acusa %s', (codigo) => {
    expect(achaCampoNativo(codigo)).toEqual([])
  })
})

describe('campos nativos proibidos', () => {
  it('nenhum <select> nem type="date|time|number|datetime-local" fora de src/components/campos/', () => {
    const achados = []
    for (const arquivo of arquivosJsx(join(process.cwd(), 'src'))) {
      const relativo = arquivo.split('/src/')[1]
      if (relativo.startsWith('components/campos/')) continue
      achados.push(...achaCampoNativo(readFileSync(arquivo, 'utf8')).map((a) => `src/${relativo}:${a}`))
    }
    expect(achados).toEqual([])
  })
})
