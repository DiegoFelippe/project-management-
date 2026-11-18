import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marcarFavorito } from '@/data/quadros'
import EstrelaDoQuadro from './EstrelaDoQuadro'

vi.mock('@/data/quadros', () => ({ marcarFavorito: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const QUADRO = { id: 'q1', nome: 'Minhas tarefas', tipo: 'pessoa', favorito: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(marcarFavorito).mockResolvedValue({ erro: null })
})

describe('EstrelaDoQuadro', () => {
  it('é um botão de alternância (aria-pressed) que segue o favorito do quadro', () => {
    const { rerender } = render(<EstrelaDoQuadro quadro={QUADRO} aoMudar={vi.fn()} />)
    const estrela = screen.getByRole('button', { name: 'Favorito' })
    expect(estrela).toHaveAttribute('aria-pressed', 'false')
    expect(estrela).toHaveAttribute('title', 'Marcar como favorito')
    rerender(<EstrelaDoQuadro quadro={{ ...QUADRO, favorito: true }} aoMudar={vi.fn()} />)
    expect(estrela).toHaveAttribute('aria-pressed', 'true')
    expect(estrela).toHaveAttribute('title', 'Tirar dos favoritos')
  })

  it('clicar acende na hora, marca no banco e avisa quem chama (que relê o quadro)', async () => {
    const aoMudar = vi.fn()
    render(<EstrelaDoQuadro quadro={QUADRO} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Favorito' }))
    expect(screen.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'true')
    expect(marcarFavorito).toHaveBeenCalledWith('q1', true)
    await waitFor(() => expect(aoMudar).toHaveBeenCalled())
  })

  it('apagar a estrela desmarca no banco', async () => {
    render(<EstrelaDoQuadro quadro={{ ...QUADRO, favorito: true }} aoMudar={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Favorito' }))
    expect(marcarFavorito).toHaveBeenCalledWith('q1', false)
    expect(screen.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('o banco recusou: a estrela volta e o motivo aparece', async () => {
    vi.mocked(marcarFavorito).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    const aoMudar = vi.fn()
    render(<EstrelaDoQuadro quadro={QUADRO} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Favorito' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para isso.'))
    expect(screen.getByRole('button', { name: 'Favorito' })).toHaveAttribute('aria-pressed', 'false')
    expect(aoMudar).toHaveBeenCalled()
  })
})
