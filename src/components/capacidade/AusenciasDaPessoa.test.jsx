import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarAusencias } from '@/data/capacidade'
import AusenciasDaPessoa from './AusenciasDaPessoa'

vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn() }))

const ausencias = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, de: '2026-12-01', ate: '2026-12-02', motivo: `Folga ${i}` }))

beforeEach(() => vi.clearAllMocks())

describe('AusenciasDaPessoa (paginação no banco)', () => {
  it('some com 15, aparece com 16 e Próxima pede a página 2', async () => {
    vi.mocked(listarAusencias).mockResolvedValue({ itens: ausencias(15), total: 15 })
    const { unmount } = render(<AusenciasDaPessoa perfilId="p1" acoes={() => null} />)
    await screen.findByRole('table', { name: 'Ausências' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarAusencias).mockResolvedValue({ itens: ausencias(15), total: 16 })
    render(<AusenciasDaPessoa perfilId="p1" acoes={() => null} />)
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    expect(listarAusencias).toHaveBeenLastCalledWith('p1', { pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarAusencias).toHaveBeenLastCalledWith('p1', { pagina: 2 })
  })

  it('sem `acoes`, só de leitura: sem a coluna de ações', async () => {
    vi.mocked(listarAusencias).mockResolvedValue({ itens: ausencias(1), total: 1 })
    render(<AusenciasDaPessoa perfilId="p1" />)
    const tabela = await screen.findByRole('table', { name: 'Ausências' })
    expect([...tabela.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['De', 'Até', 'Motivo'])
  })
})
