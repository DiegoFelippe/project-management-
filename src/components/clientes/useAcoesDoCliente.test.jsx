import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { avisar } from '@/components/comum/avisar'
import { Button } from '@/components/ui/button'
import { consultoriasPorOcupacao, consultoresPorOcupacao } from '@/data/capacidade'
import { desfazerEnvio, desfazerEscolha, escolherConsultor, mandarParaConsultoria } from '@/data/clientes'
import { aoMudarOCheckin } from '@/lib/checkinMudou'
import { useAcoesDoCliente } from './useAcoesDoCliente'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/comum/avisar', () => ({ avisar: vi.fn() }))
vi.mock('@/data/clientes', () => ({
  mandarParaConsultoria: vi.fn(), escolherConsultor: vi.fn(), desfazerEnvio: vi.fn(), desfazerEscolha: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({ consultoriasPorOcupacao: vi.fn(), consultoresPorOcupacao: vi.fn() }))

const ALFA = { id: 'k1', nome: 'Alfa', horas_mes: 10, consultoria_id: null, consultoria: null, consultor_id: null, consultor: null }
const NA_STI = { ...ALFA, consultoria_id: 's1', consultoria: { id: 's1', nome: 'STI' } }
const COM_ZE = { ...NA_STI, consultor_id: 'p9', consultor: { id: 'p9', nome: 'Zé' } }

function Tela({ acao, cliente, aoMudar }) {
  const { abrir, janelas } = useAcoesDoCliente({ aoMudar })
  return <><Button onClick={() => abrir(acao, cliente)}>Abrir</Button>{janelas}</>
}

async function confirmar(acao, cliente, botao) {
  const aoMudar = vi.fn()
  render(<Tela acao={acao} cliente={cliente} aoMudar={aoMudar} />)
  await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  const janela = await screen.findByRole('dialog')
  await userEvent.click(await within(janela).findByRole('button', { name: botao }))
  return aoMudar
}
const acoesDoAviso = () => vi.mocked(avisar).mock.calls[0][1].acoes
const VER = { rotulo: 'Ver cliente', para: '/clientes/k1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(consultoriasPorOcupacao).mockResolvedValue({ itens: [{ id: 's2', nome: 'Outra', capacidade: 100, reservado: 10, ocupacao: 0.1 }], total: 1 })
  vi.mocked(consultoresPorOcupacao).mockResolvedValue({ itens: [{ id: 'p1', nome: 'Ana', capacidade: 100, reservado: 10, ocupacao: 0.1 }], total: 1 })
  vi.mocked(mandarParaConsultoria).mockResolvedValue({ erro: null })
  vi.mocked(escolherConsultor).mockResolvedValue({ erro: null })
  vi.mocked(desfazerEnvio).mockResolvedValue({ erro: null })
  vi.mocked(desfazerEscolha).mockResolvedValue({ erro: null })
})

describe('avisos de Mandar e Escolher consultor com Desfazer e Ver cliente (usabilidade, U3)', () => {
  it('enviar da central: Desfazer devolve o cliente à Central (se ninguém mexeu nele), Ver cliente leva a ele', async () => {
    const aoMudar = await confirmar('mandar', ALFA, 'Mandar para Outra')
    expect(mandarParaConsultoria).toHaveBeenCalledWith('k1', 's2')
    expect(avisar).toHaveBeenCalledWith('Cliente Alfa enviado para Outra.', {
      acoes: [{ rotulo: 'Desfazer', aoClicar: expect.any(Function) }, VER],
    })
    await act(() => acoesDoAviso()[0].aoClicar())
    // O banco confere que o cliente ainda está como o envio deixou (na Outra, sem consultor); não grava às cegas.
    expect(desfazerEnvio).toHaveBeenCalledWith('k1', 's2')
    expect(mandarParaConsultoria).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Cliente Alfa voltou para a Central.')
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })

  it('mover de consultoria: só Ver cliente (voltar não devolve o consultor nem o check-list que a mudança encerrou)', async () => {
    await confirmar('mandar', NA_STI, 'Mover para Outra')
    expect(avisar).toHaveBeenCalledWith('Cliente Alfa movido para Outra.', { acoes: [VER] })
  })

  it('escolher o consultor: Desfazer deixa o cliente de novo aguardando consultor', async () => {
    const aoMudar = await confirmar('consultor', NA_STI, 'Escolher Ana')
    expect(escolherConsultor).toHaveBeenCalledWith('k1', 'p1')
    expect(avisar).toHaveBeenCalledWith('Ana é o consultor de Alfa.', {
      acoes: [{ rotulo: 'Desfazer', aoClicar: expect.any(Function) }, VER],
    })
    await act(() => acoesDoAviso()[0].aoClicar())
    expect(desfazerEscolha).toHaveBeenCalledWith('k1', 'p1')
    expect(escolherConsultor).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Alfa voltou a aguardar consultor.')
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })

  it('trocar o consultor: só Ver cliente, e avisa que o check-in pode ter mudado (a troca fecha o aberto)', async () => {
    const ouvinte = vi.fn()
    const parar = aoMudarOCheckin(ouvinte)
    await confirmar('consultor', COM_ZE, 'Trocar para Ana')
    parar()
    expect(avisar).toHaveBeenCalledWith('Ana é o consultor de Alfa.', { acoes: [VER] })
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('Desfazer recusado (o cliente mudou nos 10 s do aviso) mostra a mensagem e relê a tela', async () => {
    const aoMudar = await confirmar('consultor', NA_STI, 'Escolher Ana')
    vi.mocked(desfazerEscolha).mockResolvedValue({ erro: 'O cliente mudou depois disso; nada foi desfeito.' })
    await act(() => acoesDoAviso()[0].aoClicar())
    expect(toast.error).toHaveBeenCalledWith('O cliente mudou depois disso; nada foi desfeito.')
    expect(toast.success).not.toHaveBeenCalledWith('Alfa voltou a aguardar consultor.')
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })
})
