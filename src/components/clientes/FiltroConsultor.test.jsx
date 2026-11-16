import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { consultoresPorOcupacao } from '@/data/capacidade'
import FiltroConsultor from './FiltroConsultor'

vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))

describe('FiltroConsultor', () => {
  it('mostra o erro de rede em vez de "Nenhum consultor encontrado"', async () => {
    vi.mocked(consultoresPorOcupacao).mockRejectedValue(new Error('rede'))
    render(<FiltroConsultor valor="" consultoriaId={null} aoMudar={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Consultor'), 'escolher')
    expect(await screen.findByText('Não foi possível carregar as opções.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum consultor encontrado.')).not.toBeInTheDocument()
  })
})
