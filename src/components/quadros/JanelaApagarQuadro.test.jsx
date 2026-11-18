import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { quadroPorId } from '@/data/quadro'
import { apagarQuadro } from '@/data/quadros'
import JanelaApagarQuadro from './JanelaApagarQuadro'

vi.mock('@/data/quadro', () => ({ quadroPorId: vi.fn() }))
vi.mock('@/data/quadros', () => ({ apagarQuadro: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const DO_TIME = { id: 'q1', nome: 'Sprint', tipo: 'time', time: { id: 't1', nome: 'Comercial' }, arquivado_em: null, pode_administrar: true }
const COLUNAS = [
  { id: 'c1', nome: 'A fazer', cartoes: 3, arquivados: 1 },
  { id: 'c2', nome: 'Em andamento', cartoes: 2, arquivados: 0 },
  { id: 'c3', nome: 'Concluído', cartoes: 0, arquivados: 2 },
]

function tela({ quadro = DO_TIME, aoArquivar } = {}) {
  const aoFechar = vi.fn()
  const aoApagado = vi.fn()
  render(<JanelaApagarQuadro quadro={quadro} aoFechar={aoFechar} aoApagado={aoApagado} aoArquivar={aoArquivar} />)
  return { aoFechar, aoApagado, janela: screen.getByRole('dialog', { name: 'Apagar o quadro Sprint?' }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(quadroPorId).mockResolvedValue({ ...DO_TIME, colunas: COLUNAS })
  vi.mocked(apagarQuadro).mockResolvedValue({ erro: null })
})

describe('JanelaApagarQuadro', () => {
  it('diz quantas colunas e cartões somem (contados agora no banco, os arquivados também) e que não dá para desfazer', async () => {
    const { janela } = tela({ aoArquivar: vi.fn() })
    expect(await within(janela).findByText(/3 colunas e 8 cartões, com checklist, comentários e anexos\. Não dá para desfazer\./))
      .toBeInTheDocument()
    expect(quadroPorId).toHaveBeenCalledWith('q1')
    // No quadro do time, apagar tira o trabalho do time inteiro.
    expect(within(janela).getByText(/time Comercial/)).toBeInTheDocument()
  })

  it('oferece Arquivar ao lado de Apagar, explicando a diferença', async () => {
    const aoArquivar = vi.fn().mockResolvedValue({ erro: null })
    const { janela, aoApagado } = tela({ aoArquivar })
    await within(janela).findByText(/3 colunas/)
    expect(within(janela).getByText(/Arquivar guarda tudo, só para ler, e dá para restaurar/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }))
    expect(aoArquivar).toHaveBeenCalled()
    expect(apagarQuadro).not.toHaveBeenCalled()
    expect(aoApagado).not.toHaveBeenCalled()
  })

  it('sem aoArquivar (quadro já arquivado), só Cancelar e Apagar quadro', async () => {
    const { janela } = tela({ quadro: { ...DO_TIME, arquivado_em: '2026-11-17T10:00:00Z' } })
    await within(janela).findByText(/3 colunas/)
    expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('Apagar quadro apaga no banco, avisa e chama aoApagado', async () => {
    const { aoApagado, janela } = tela({ aoArquivar: vi.fn() })
    await within(janela).findByText(/3 colunas/)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar quadro' }))
    expect(apagarQuadro).toHaveBeenCalledWith('q1')
    await waitFor(() => expect(aoApagado).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Quadro Sprint apagado.')
  })

  it('sobraram arquivos no armazenamento: o quadro saiu e o aviso diz', async () => {
    vi.mocked(apagarQuadro).mockResolvedValue({ erro: null, aviso: 'Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.' })
    const { aoApagado, janela } = tela()
    await within(janela).findByText(/3 colunas/)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar quadro' }))
    await waitFor(() => expect(aoApagado).toHaveBeenCalled())
    expect(toast.warning).toHaveBeenCalledWith('Quadro Sprint apagado, mas: Alguns anexos ou imagens não saíram do armazenamento. Avise o suporte.')
  })

  it('o banco recusou: o motivo aparece e a janela fica', async () => {
    vi.mocked(apagarQuadro).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    const { aoApagado, janela } = tela()
    await within(janela).findByText(/3 colunas/)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar quadro' }))
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso.')
    expect(aoApagado).not.toHaveBeenCalled()
  })

  it('enquanto apaga, "Apagando…"', async () => {
    let terminar
    vi.mocked(apagarQuadro).mockImplementation(() => new Promise((r) => { terminar = r }))
    const { janela } = tela()
    await within(janela).findByText(/3 colunas/)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar quadro' }))
    expect(screen.getByRole('button', { name: 'Apagando…' })).toBeDisabled()
    terminar({ erro: null })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apagando…' })).not.toBeInTheDocument())
  })

  it('quadro pessoal: uma coluna e um cartão no singular', async () => {
    vi.mocked(quadroPorId).mockResolvedValue({ ...DO_TIME, tipo: 'pessoa', time: null, colunas: [{ id: 'c1', cartoes: 1, arquivados: 0 }] })
    const { janela } = tela({ quadro: { ...DO_TIME, tipo: 'pessoa', time: null } })
    expect(await within(janela).findByText(/1 coluna e 1 cartão, com/)).toBeInTheDocument()
  })
})
