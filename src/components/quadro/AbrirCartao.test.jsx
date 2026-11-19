import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AbrirCartao from './AbrirCartao'
import { carregarJanelaDoCartao } from './carregarJanelaDoCartao'

// A janela de verdade é testada em JanelaDoCartao.test.jsx; aqui só o carregamento sob demanda dela. Cada arquivo de teste
// começa do zero (nada carregado), mas, dentro dele, a janela carregada fica guardada: a ordem dos testes importa (os que
// falham ao carregar vêm antes do primeiro que carrega).
vi.mock('./carregarJanelaDoCartao', () => ({ carregarJanelaDoCartao: vi.fn() }))

const JanelaFalsa = ({ cartaoId }) => <p>Janela do cartão {cartaoId}</p>
let erroNoConsole
beforeEach(() => {
  vi.clearAllMocks()
  // O React avisa no console o erro que o limite pegou (é o que se testa aqui).
  erroNoConsole = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => erroNoConsole.mockRestore())

describe('abrir a janela do cartão (carregada sob demanda)', () => {
  it('fechar o aviso devolve ao quadro sem colunas para reler', async () => {
    vi.mocked(carregarJanelaDoCartao).mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    const aoFechar = vi.fn()
    render(<AbrirCartao cartaoId="c1" aoFechar={aoFechar} aoQuadroMudou={vi.fn()} />)
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível abrir o cartão.')
    const aviso = alerta.closest('[role="dialog"]')
    expect(aviso).toHaveAccessibleName('Cartão')
    await user.click(within(aviso).getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledWith([])
  })

  it('"Abrindo o cartão…" enquanto carrega; se não carregar, o aviso; "Tentar de novo" carrega de novo e abre', async () => {
    let falhar
    vi.mocked(carregarJanelaDoCartao)
      .mockImplementationOnce(() => new Promise((_ok, falha) => { falhar = falha }))
      .mockResolvedValue({ default: JanelaFalsa })
    const user = userEvent.setup()
    const aoFechar = vi.fn()
    render(<AbrirCartao cartaoId="c1" aoFechar={aoFechar} aoQuadroMudou={vi.fn()} />)
    expect(await screen.findByText('Abrindo o cartão…')).toBeInTheDocument()
    await act(async () => falhar(new Error('Failed to fetch dynamically imported module')))
    const aviso = await screen.findByRole('dialog', { name: 'Cartão' })
    expect(within(aviso).getByRole('alert')).toHaveTextContent('Não foi possível abrir o cartão.')
    expect(within(aviso).getByRole('button', { name: 'Recarregar a página' })).toBeInTheDocument()
    await user.click(within(aviso).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Janela do cartão c1')).toBeInTheDocument()
    expect(carregarJanelaDoCartao).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: 'Cartão' })).not.toBeInTheDocument()
  })

  it('depois de carregar uma vez, abre direto (sem carregar de novo)', async () => {
    vi.mocked(carregarJanelaDoCartao).mockResolvedValue({ default: JanelaFalsa })
    const { unmount } = render(<AbrirCartao cartaoId="c1" aoFechar={vi.fn()} aoQuadroMudou={vi.fn()} />)
    expect(await screen.findByText('Janela do cartão c1')).toBeInTheDocument()
    unmount()
    vi.mocked(carregarJanelaDoCartao).mockClear()
    render(<AbrirCartao cartaoId="c2" aoFechar={vi.fn()} aoQuadroMudou={vi.fn()} />)
    expect(screen.getByText('Janela do cartão c2')).toBeInTheDocument()
    expect(carregarJanelaDoCartao).not.toHaveBeenCalled()
  })
})
