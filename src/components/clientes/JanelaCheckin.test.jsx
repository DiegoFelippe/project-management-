import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import JanelaCheckin from './JanelaCheckin'

function preencher(janela, { data, inicio, fim }) {
  fireEvent.change(within(janela).getByLabelText('Data'), { target: { value: data } })
  fireEvent.change(within(janela).getByLabelText('Início'), { target: { value: inicio } })
  fireEvent.change(within(janela).getByLabelText('Fim'), { target: { value: fim } })
}

describe('JanelaCheckin: check-out', () => {
  it('exige o que foi feito e manda só a descrição', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    const aoFechar = vi.fn()
    render(<JanelaCheckin aberto modo="checkout" nomeDoCliente="Alfa" aoFechar={aoFechar} aoSalvar={aoSalvar} />)
    const janela = screen.getByRole('dialog', { name: 'Fazer check-out em Alfa' })
    expect(within(janela).queryByLabelText('Data')).not.toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), '  Instalei o servidor ')
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(aoSalvar).toHaveBeenCalledWith({ descricao: 'Instalei o servidor' })
    expect(aoFechar).toHaveBeenCalled()
  })

  it('mostra o erro do banco e mantém a janela aberta', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Você não é o consultor deste cliente.' })
    const aoFechar = vi.fn()
    render(<JanelaCheckin aberto modo="checkout" nomeDoCliente="Alfa" aoFechar={aoFechar} aoSalvar={aoSalvar} />)
    await userEvent.type(screen.getByLabelText('O que foi feito'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-out' }))
    expect(await screen.findByText('Você não é o consultor deste cliente.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})

describe('JanelaCheckin: lançar horas', () => {
  const abrir = (aoSalvar = vi.fn().mockResolvedValue({ erro: null })) => {
    render(<JanelaCheckin aberto modo="lancar" nomeDoCliente="Alfa" aoFechar={vi.fn()} aoSalvar={aoSalvar} />)
    return { aoSalvar, janela: screen.getByRole('dialog', { name: 'Lançar horas em Alfa' }) }
  }
  const enviar = (janela) => userEvent.click(within(janela).getByRole('button', { name: 'Lançar horas' }))

  it('fim antes do início mostra o erro e não envia', async () => {
    const { aoSalvar, janela } = abrir()
    preencher(janela, { data: '2026-11-10', inicio: '10:00', fim: '09:00' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(within(janela).getByText('O fim precisa ser depois do início.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('não aceita horário no futuro', async () => {
    const { aoSalvar, janela } = abrir()
    preencher(janela, { data: '2999-01-01', inicio: '09:00', fim: '10:00' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(within(janela).getByText('O horário não pode estar no futuro.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('exige data, horários e descrição', async () => {
    const { aoSalvar, janela } = abrir()
    await enviar(janela)
    expect(within(janela).getByText('Informe a data, o início e o fim.')).toBeInTheDocument()
    preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:00' })
    await enviar(janela)
    expect(within(janela).getByText('Conte o que foi feito.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('envia início e fim em ISO, no horário local', async () => {
    const { aoSalvar, janela } = abrir()
    preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:30' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(aoSalvar).toHaveBeenCalledWith({
      inicio: new Date('2026-11-10T09:00').toISOString(),
      fim: new Date('2026-11-10T10:30').toISOString(),
      descricao: 'Reunião',
    })
  })

  it('mostra a mensagem de sobreposição devolvida pelo banco', async () => {
    const { janela } = abrir(vi.fn().mockResolvedValue({ erro: 'Esse horário se sobrepõe a outro check-in seu.' }))
    preencher(janela, { data: '2026-11-10', inicio: '09:00', fim: '10:30' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Reunião')
    await enviar(janela)
    expect(await within(janela).findByText('Esse horário se sobrepõe a outro check-in seu.')).toBeInTheDocument()
  })
})

describe('JanelaCheckin: editar', () => {
  it('abre preenchida com o check-in', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
    const checkin = {
      id: 'c1', inicio: new Date('2026-11-10T09:00').toISOString(), fim: new Date('2026-11-10T10:30').toISOString(),
      descricao: 'Reunião',
    }
    render(<JanelaCheckin aberto modo="editar" nomeDoCliente="Alfa" checkin={checkin} aoFechar={vi.fn()} aoSalvar={aoSalvar} />)
    const janela = screen.getByRole('dialog', { name: 'Editar check-in em Alfa' })
    expect(within(janela).getByLabelText('Data')).toHaveValue('2026-11-10')
    expect(within(janela).getByLabelText('Início')).toHaveValue('09:00')
    expect(within(janela).getByLabelText('Fim')).toHaveValue('10:30')
    expect(within(janela).getByLabelText('O que foi feito')).toHaveValue('Reunião')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith({ inicio: checkin.inicio, fim: checkin.fim, descricao: 'Reunião' })
  })
})
