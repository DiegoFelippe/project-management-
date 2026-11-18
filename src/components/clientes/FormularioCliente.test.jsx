import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FormularioCliente from './FormularioCliente'

const CLIENTE = {
  id: 'c1', nome: 'Provedor Alfa', razao_social: 'Alfa Telecom Ltda', cnpj: '11222333000181', cidade: 'Natal', uf: 'RN',
  horas_mes: 40, contato_nome: null, contato_telefone: null, contato_email: null, observacoes: null,
}

function abrir(props = {}) {
  const aoSalvar = vi.fn().mockResolvedValue({ erro: null })
  const aoFechar = vi.fn()
  const { unmount } = render(<FormularioCliente aberto aoFechar={aoFechar} aoSalvar={aoSalvar} {...props} />)
  return { aoSalvar, aoFechar, unmount }
}

describe('FormularioCliente', () => {
  it('sem cliente é "Novo cliente"; com cliente é "Editar cliente" já preenchido', () => {
    abrir()
    expect(screen.getByRole('dialog', { name: 'Novo cliente' })).toBeInTheDocument()
  })

  it('Novo cliente: o botão é "Criar cliente" e mostra "Criando…" enquanto grava; Editar fica com "Salvar"/"Salvando…"', async () => {
    let terminar
    const { aoFechar, unmount } = abrir({ aoSalvar: vi.fn(() => new Promise((resolver) => { terminar = resolver })) })
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    await userEvent.type(screen.getByLabelText('Nome'), 'Gama Net')
    await userEvent.type(screen.getByLabelText('Previsão de horas por mês'), '30')
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }))
    expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled()
    await act(async () => terminar({ erro: null }))
    expect(aoFechar).toHaveBeenCalled()
    unmount()
    abrir({ cliente: CLIENTE, aoSalvar: vi.fn(() => new Promise(() => {})) })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  })

  it('"(opcional)" só nos campos que o banco não exige; nome e previsão não têm', () => {
    abrir()
    for (const rotulo of ['Razão social', 'CNPJ', 'Cidade', 'UF', 'Contato', 'Telefone do contato', 'E-mail do contato', 'Observações']) {
      expect(screen.getByLabelText(`${rotulo} (opcional)`)).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Previsão de horas por mês')).toBeInTheDocument()
  })

  it('preenche com o cliente, formata o CNPJ e salva em camelCase', async () => {
    const { aoSalvar, aoFechar } = abrir({ cliente: CLIENTE })
    expect(screen.getByRole('dialog', { name: 'Editar cliente' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Provedor Alfa')
    expect(screen.getByLabelText('CNPJ (opcional)')).toHaveValue('11.222.333/0001-81')
    expect(screen.getByLabelText('Previsão de horas por mês')).toHaveValue('40')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Provedor Alfa', razaoSocial: 'Alfa Telecom Ltda', cnpj: '11222333000181', cidade: 'Natal', uf: 'RN', horasMes: 40,
    }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('o Salvar do rodapé é o botão de envio do formulário (o Enter nos campos também envia)', () => {
    abrir({ cliente: CLIENTE })
    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar).toHaveAttribute('type', 'submit')
    expect(salvar.form).toBe(screen.getByLabelText('Cidade (opcional)').form)
  })

  it('horas por mês acima de 744 avisam na tela e não chegam ao banco', async () => {
    const { aoSalvar } = abrir({ cliente: { ...CLIENTE, horas_mes: 5000 } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('O mês tem no máximo 744 horas.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('nome com 1 letra', async () => {
    const { aoSalvar } = abrir({ cliente: { ...CLIENTE, nome: 'A' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Use pelo menos 2 caracteres no nome.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('CNPJ inválido', async () => {
    const { aoSalvar } = abrir({ cliente: { ...CLIENTE, cnpj: '11.222.333/0001-82' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('CNPJ inválido.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('previsão vazia', async () => {
    const { aoSalvar } = abrir()
    await userEvent.type(screen.getByLabelText('Nome'), 'Novo Provedor')
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }))
    expect(screen.getByText('Informe a previsão de horas por mês.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it.each(['0', '0,0'])('previsão %s não é aceita e não envia', async (valor) => {
    const { aoSalvar } = abrir({ cliente: CLIENTE })
    await userEvent.clear(screen.getByLabelText('Previsão de horas por mês'))
    await userEvent.type(screen.getByLabelText('Previsão de horas por mês'), valor)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Informe a previsão de horas por mês.')).toBeInTheDocument()
    expect(aoSalvar).not.toHaveBeenCalled()
  })

  it('se o envio falhar (sem rede), a janela avisa, continua aberta e o botão volta', async () => {
    const aoSalvar = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { aoFechar } = abrir({ cliente: CLIENTE, aoSalvar })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não deu para salvar. Tente de novo.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(screen.getByRole('dialog', { name: 'Editar cliente' })).not.toHaveAttribute('aria-busy')
  })

  it('erro devolvido por quem salva aparece e a janela continua', async () => {
    const aoSalvar = vi.fn().mockResolvedValue({ erro: 'Já existe um cliente com este CNPJ.' })
    const { aoFechar } = abrir({ cliente: CLIENTE, aoSalvar })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Já existe um cliente com este CNPJ.')).toBeInTheDocument()
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
