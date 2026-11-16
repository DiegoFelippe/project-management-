import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoresPorOcupacao } from '@/data/capacidade'
import FiltroConsultor from './FiltroConsultor'

vi.mock('@/data/capacidade', () => ({ consultoresPorOcupacao: vi.fn() }))

const ANA = { id: 'p1', nome: 'Ana', email: 'ana@x.test', foto: null, ocupacao: 0.4 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [ANA], total: 1 })
})

describe('FiltroConsultor', () => {
  it('mostra o erro de rede em vez de "Nada encontrado"', async () => {
    vi.mocked(consultoresPorOcupacao).mockRejectedValue(new Error('rede'))
    render(<FiltroConsultor valor="" consultoriaId={null} aoMudar={() => {}} />)
    await userEvent.click(screen.getByLabelText('Consultor'))
    expect(await screen.findByText('Não foi possível carregar as opções.')).toBeInTheDocument()
    expect(screen.queryByText('Nada encontrado')).not.toBeInTheDocument()
  })

  it('busca no banco, por ocupação, na consultoria pedida, e oferece Todos e Sem consultor', async () => {
    render(<FiltroConsultor valor="" consultoriaId="s1" aoMudar={() => {}} />)
    await userEvent.click(screen.getByLabelText('Consultor'))
    expect((await screen.findAllByRole('option')).map((o) => o.getAttribute('aria-selected'))).toHaveLength(3)
    expect(screen.getByRole('option', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sem consultor' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Ana/ })).toBeInTheDocument()
    expect(consultoresPorOcupacao).toHaveBeenCalledWith(expect.objectContaining({ consultoriaId: 's1', busca: undefined }))
  })

  it('digitar na busca pede o termo ao banco e esconde "Sem consultor"', async () => {
    render(<FiltroConsultor valor="" consultoriaId={null} aoMudar={() => {}} />)
    await userEvent.click(screen.getByLabelText('Consultor'))
    await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar' }), 'an')
    await vi.waitFor(() => expect(consultoresPorOcupacao).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'an' })))
    expect(screen.queryByRole('option', { name: 'Sem consultor' })).not.toBeInTheDocument()
  })

  it('escolher uma pessoa avisa o id dela', async () => {
    const aoMudar = vi.fn()
    render(<FiltroConsultor valor="" consultoriaId={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByLabelText('Consultor'))
    await userEvent.click(await screen.findByRole('option', { name: /Ana/ }))
    expect(aoMudar).toHaveBeenCalledWith('p1')
  })

  it('sem comSemConsultor não oferece "Sem consultor"', async () => {
    render(<FiltroConsultor valor="" consultoriaId={null} comSemConsultor={false} aoMudar={() => {}} />)
    await userEvent.click(screen.getByLabelText('Consultor'))
    await screen.findByRole('option', { name: /Ana/ })
    expect(screen.queryByRole('option', { name: 'Sem consultor' })).not.toBeInTheDocument()
  })

  it('mostra "Sem consultor" no campo quando é o valor atual', () => {
    render(<FiltroConsultor valor="sem" consultoriaId={null} aoMudar={() => {}} />)
    expect(screen.getByLabelText('Consultor')).toHaveTextContent('Sem consultor')
  })
})
