import { describe, expect, it } from 'vitest'
import { caminhoDoArquivo, nomeNoStorage, nomeParaMostrar, TAMANHO_MAXIMO_ARQUIVO } from './arquivos'

const UUID = '0b6f2c1e-3d4a-4f5b-8c6d-7e8f9a0b1c2d'

describe('arquivos do cliente', () => {
  it('o limite é o do bucket: 25 MB', () => {
    expect(TAMANHO_MAXIMO_ARQUIVO).toBe(26214400)
  })

  it('no Storage, o nome fica só com letras, números, ponto, hífen e sublinhado', () => {
    expect(nomeNoStorage('Relatório de implantação (v2).pdf')).toBe('Relatorio_de_implantacao__v2_.pdf')
    expect(nomeNoStorage('contrato_final-2026.docx')).toBe('contrato_final-2026.docx')
    expect(nomeNoStorage('ÇÃO ñ ü/..\\x.txt')).toBe('CAO_n_u_.._x.txt')
    expect(nomeNoStorage('日本語.png')).toBe('___.png')
    expect(nomeNoStorage('')).toBe('arquivo')
    expect(nomeNoStorage(undefined)).toBe('arquivo')
  })

  it('nome comprido fica com até 120 caracteres, guardando a extensão', () => {
    const nome = nomeNoStorage(`${'a'.repeat(300)}.xlsx`)
    expect(nome).toHaveLength(120)
    expect(nome.endsWith('.xlsx')).toBe(true)
    expect(nomeNoStorage('b'.repeat(300))).toBe('b'.repeat(120))
  })

  it('o caminho é <cliente>/<uuid>-<nome>', () => {
    expect(caminhoDoArquivo('c1', 'Ata da reunião.pdf', UUID)).toBe(`c1/${UUID}-Ata_da_reuniao.pdf`)
    expect(caminhoDoArquivo('c1', 'a.pdf')).toMatch(/^c1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-a\.pdf$/)
  })

  it('o nome que aparece na lista é o original, com até 200 caracteres', () => {
    expect(nomeParaMostrar('  Ata da reunião.pdf ')).toBe('Ata da reunião.pdf')
    expect(nomeParaMostrar('x'.repeat(250))).toHaveLength(200)
    expect(nomeParaMostrar('   ')).toBe('arquivo')
  })
})
