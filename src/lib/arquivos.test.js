import { describe, expect, it, vi } from 'vitest'
import {
  caminhoDaImagem,
  caminhoDoAnexo,
  caminhoDoArquivo,
  caminhosNaPasta,
  formatarTamanho,
  limparPasta,
  nomeNoStorage,
  nomeParaMostrar,
  TAMANHO_MAXIMO_ARQUIVO,
} from './arquivos'

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

describe('caminhos no balde quadros (o banco confere as duas formas)', () => {
  it('anexo do cartão: <cliente>/<cartao>/<uuid>-<nome>', () => {
    expect(caminhoDoAnexo('k1', 'c1', 'Ata da reunião.pdf', UUID)).toBe(`k1/c1/${UUID}-Ata_da_reuniao.pdf`)
    expect(caminhoDoAnexo('k1', 'c1', 'a.pdf')).toMatch(/^k1\/c1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-a\.pdf$/)
  })

  it('imagem da descrição: <cliente>/<cartao>/imagens/<uuid>.<ext>, só PNG, JPG, GIF e WEBP', () => {
    expect(caminhoDaImagem('k1', 'c1', 'image/png', UUID)).toBe(`k1/c1/imagens/${UUID}.png`)
    expect(caminhoDaImagem('k1', 'c1', 'image/jpeg', UUID)).toBe(`k1/c1/imagens/${UUID}.jpg`)
    expect(caminhoDaImagem('k1', 'c1', 'image/gif', UUID)).toBe(`k1/c1/imagens/${UUID}.gif`)
    expect(caminhoDaImagem('k1', 'c1', 'image/webp', UUID)).toBe(`k1/c1/imagens/${UUID}.webp`)
    expect(caminhoDaImagem('k1', 'c1', 'image/svg+xml')).toBeNull()
    expect(caminhoDaImagem('k1', 'c1', '')).toBeNull()
    // Nomes herdados de todo objeto (constructor, toString…) não contam como tipo aceito.
    for (const herdado of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(caminhoDaImagem('k1', 'c1', herdado), herdado).toBeNull()
    }
  })

  it('tamanho para mostrar: B, KB e MB com uma casa', () => {
    expect(formatarTamanho(512)).toBe('512 B')
    expect(formatarTamanho(1536)).toBe('1,5 KB')
    expect(formatarTamanho(26214400)).toBe('25 MB')
  })
})

// Bucket falso: list devolve as páginas na ordem; remove registra os caminhos.
function bucketFalso(paginas, { erroNaLista = null, erroAoTirar = null } = {}) {
  const pedidas = [...paginas]
  return {
    list: vi.fn(async () => (erroNaLista ? { data: null, error: erroNaLista } : { data: pedidas.shift() ?? [], error: null })),
    remove: vi.fn(async (caminhos) => (erroAoTirar ? { data: null, error: erroAoTirar } : { data: caminhos, error: null })),
  }
}
const objetos = (quantos, prefixo = 'o') => Array.from({ length: quantos }, (_, i) => ({ id: `${prefixo}${i}`, name: `${prefixo}${i}.pdf` }))

describe('caminhosNaPasta', () => {
  it('lê todas as páginas da pasta do cliente e deixa as subpastas de fora', async () => {
    const bucket = bucketFalso([objetos(1000), [...objetos(2, 'z'), { id: null, name: 'subpasta' }]])
    const { caminhos, error } = await caminhosNaPasta(bucket, 'c1')
    expect(error).toBeNull()
    expect(caminhos).toHaveLength(1002)
    expect(caminhos[0]).toBe('c1/o0.pdf')
    expect(caminhos.at(-1)).toBe('c1/z1.pdf')
    expect(bucket.list.mock.calls).toEqual([
      ['c1', { limit: 1000, offset: 0 }],
      ['c1', { limit: 1000, offset: 1000 }],
    ])
  })
})

describe('limparPasta', () => {
  it('tira todos os objetos da pasta, em lotes de 1000', async () => {
    const bucket = bucketFalso([objetos(1000), objetos(5, 'z')])
    expect(await limparPasta(bucket, 'c1')).toEqual({ erro: null })
    expect(bucket.remove).toHaveBeenCalledTimes(2)
    expect(bucket.remove.mock.calls[0][0]).toHaveLength(1000)
    expect(bucket.remove.mock.calls[1][0]).toEqual(objetos(5, 'z').map((o) => `c1/${o.name}`))
  })

  it('pasta vazia: nada a tirar', async () => {
    const bucket = bucketFalso([[]])
    expect(await limparPasta(bucket, 'c1')).toEqual({ erro: null })
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('sem cliente, não lista nada (a raiz do bucket tem as pastas de todos)', async () => {
    const bucket = bucketFalso([objetos(3)])
    expect(await limparPasta(bucket, '')).toEqual({ erro: null })
    expect(bucket.list).not.toHaveBeenCalled()
  })

  it('erro ao listar ou ao tirar vira a mensagem de arquivos que ficaram', async () => {
    const ficou = 'Os arquivos guardados do cliente não foram apagados. Avise o suporte.'
    expect(await limparPasta(bucketFalso([], { erroNaLista: { statusCode: '500' } }), 'c1')).toEqual({ erro: ficou })
    expect(await limparPasta(bucketFalso([objetos(1)], { erroAoTirar: { statusCode: '500' } }), 'c1')).toEqual({ erro: ficou })
  })
})
