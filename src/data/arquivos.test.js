import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { criarBancoFalso } from '@/test/bancoFalso'
import { apagarArquivo, enviarArquivo, linkParaBaixar, listarArquivos } from './arquivos'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))

let banco, bucket
beforeEach(() => {
  banco = criarBancoFalso()
  vi.mocked(supabase.from).mockImplementation(banco.from)
  bucket = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
    remove: vi.fn().mockResolvedValue({ data: [{ name: 'x' }], error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'http://storage/assinado' }, error: null }),
  }
  vi.mocked(supabase.storage.from).mockReturnValue(bucket)
})

const chamada = (metodo) => banco.chamadas.find(([m]) => m === metodo)
const arquivo = (conteudo, nome = 'Ata da reunião.pdf', tipo = 'application/pdf') => new File([conteudo], nome, { type: tipo })
const PERMISSAO = 'Você não tem permissão para isso.'

describe('listarArquivos', () => {
  it('pede a página do cliente ao banco, mais novos primeiro, com o nome de quem enviou', async () => {
    banco.resposta = {
      data: [
        { id: 'a1', nome: 'x.pdf', consultoria_id: 'k1', autor: { nome: 'Ana' } },
        { id: 'a2', nome: 'y.pdf', consultoria_id: null, autor: { nome: 'Central' } },
        { id: 'a3', nome: 'z.pdf', consultoria_id: null, autor: null },
        { id: 'a4', nome: 'w.pdf', consultoria_id: 'k1', autor: null },
      ],
      error: null,
      count: 20,
    }
    const { itens, total } = await listarArquivos('c1', { pagina: 2 })
    expect(chamada('from')).toEqual(['from', 'cliente_arquivos'])
    expect(chamada('select')[1]).toContain('autor:autor_do_arquivo(nome)')
    expect(chamada('select')[1]).toContain('caminho')
    expect(chamada('select')[2]).toEqual({ count: 'exact' })
    expect(banco.chamou('eq', 'cliente_id', 'c1')).toBe(true)
    expect(banco.chamou('order', 'enviado_em', { ascending: false })).toBe(true)
    expect(banco.chamou('range', 15, 29)).toBe(true)
    expect(total).toBe(20)
    expect(itens.map((i) => i.autor)).toEqual(['Ana', 'Central', 'Central', null])
  })
})

describe('enviarArquivo', () => {
  it('sobe o objeto na pasta do cliente e depois grava a linha', async () => {
    banco.resposta = { data: null, error: null }
    const ata = arquivo('conteúdo')
    expect(await enviarArquivo('c1', ata)).toEqual({ erro: null })
    expect(supabase.storage.from).toHaveBeenCalledWith('arquivos')
    const [caminho, corpo, opcoes] = bucket.upload.mock.calls[0]
    expect(caminho).toMatch(/^c1\/[0-9a-f-]{36}-Ata_da_reuniao\.pdf$/)
    expect(corpo).toBe(ata)
    expect(opcoes).toEqual({ contentType: 'application/pdf' })
    expect(banco.chamou('insert', {
      cliente_id: 'c1', caminho, nome: 'Ata da reunião.pdf', tamanho: ata.size, tipo: 'application/pdf',
    })).toBe(true)
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('arquivo acima de 25 MB nem sobe', async () => {
    const grande = arquivo('x')
    Object.defineProperty(grande, 'size', { value: 26214401 })
    expect(await enviarArquivo('c1', grande)).toEqual({ erro: 'O arquivo passa de 25 MB.' })
    expect(bucket.upload).not.toHaveBeenCalled()
    expect(banco.chamadas).toEqual([])
  })

  it('arquivo vazio nem sobe', async () => {
    expect(await enviarArquivo('c1', arquivo(''))).toEqual({ erro: 'O arquivo está vazio.' })
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('o Storage recusa: não grava a linha', async () => {
    bucket.upload.mockResolvedValue({ data: null, error: { status: 400, statusCode: '403', code: 'AccessDenied' } })
    expect(await enviarArquivo('c1', arquivo('x'))).toEqual({ erro: PERMISSAO })
    expect(banco.chamadas).toEqual([])
  })

  it('a linha não grava: tira o objeto que subiu e devolve o erro', async () => {
    banco.resposta = { data: null, error: { code: '42501' } }
    expect(await enviarArquivo('c1', arquivo('x'))).toEqual({ erro: PERMISSAO })
    const [caminho] = bucket.upload.mock.calls[0]
    expect(bucket.remove).toHaveBeenCalledWith([caminho])
  })

  it('sem tipo conhecido, sobe como binário e grava o tipo vazio', async () => {
    banco.resposta = { data: null, error: null }
    await enviarArquivo('c1', arquivo('x', 'dados', ''))
    expect(bucket.upload.mock.calls[0][2]).toEqual({ contentType: 'application/octet-stream' })
    expect(chamada('insert')[1].tipo).toBeNull()
  })
})

describe('linkParaBaixar', () => {
  it('pede um link assinado de 60 s que baixa com o nome do arquivo', async () => {
    expect(await linkParaBaixar({ caminho: 'c1/u-a.pdf', nome: 'Ata.pdf' })).toEqual({ url: 'http://storage/assinado' })
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('c1/u-a.pdf', 60, { download: 'Ata.pdf' })
  })

  it('sem acesso ao arquivo, devolve o erro', async () => {
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: { status: 400, statusCode: '404', code: 'NoSuchKey' } })
    expect(await linkParaBaixar({ caminho: 'c1/u-a.pdf', nome: 'Ata.pdf' })).toEqual({
      erro: 'Esse arquivo não foi encontrado.',
    })
  })
})

describe('apagarArquivo', () => {
  it('apaga a linha (o banco decide) e depois o objeto guardado nela', async () => {
    banco.resposta = { data: [{ caminho: 'c1/u-guardado.pdf' }], error: null }
    expect(await apagarArquivo({ id: 'a1', caminho: 'c1/u-forjado.pdf' })).toEqual({ erro: null })
    expect(banco.chamadas.map(([m]) => m)).toEqual(['from', 'delete', 'eq', 'select'])
    expect(banco.chamou('eq', 'id', 'a1')).toBe(true)
    expect(bucket.remove).toHaveBeenCalledWith(['c1/u-guardado.pdf'])
  })

  it('sem permissão, a linha fica e o objeto nem é tocado', async () => {
    banco.resposta = { data: [], error: null }
    expect(await apagarArquivo({ id: 'a1', caminho: 'c1/u-a.pdf' })).toEqual({ erro: PERMISSAO })
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('erro do banco volta traduzido', async () => {
    banco.resposta = { data: null, error: { code: '42501' } }
    expect(await apagarArquivo({ id: 'a1', caminho: 'c1/u-a.pdf' })).toEqual({ erro: PERMISSAO })
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('o objeto não sai: a linha continua apagada e vem um aviso', async () => {
    banco.resposta = { data: [{ caminho: 'c1/u-a.pdf' }], error: null }
    bucket.remove.mockResolvedValue({ data: [], error: null })
    const resultado = await apagarArquivo({ id: 'a1', caminho: 'c1/u-a.pdf' })
    expect(resultado.erro).toBeNull()
    expect(resultado.aviso).toBe('O arquivo saiu da lista, mas a cópia guardada não foi apagada. Avise o suporte.')
    bucket.remove.mockResolvedValue({ data: null, error: { status: 500 } })
    expect((await apagarArquivo({ id: 'a1', caminho: 'c1/u-a.pdf' })).aviso).toBeDefined()
  })
})
