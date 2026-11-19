import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import FichaDoCliente from './FichaDoCliente'

const CLIENTE = {
  id: 'k1', nome: 'Provedor Alfa', razao_social: 'Alfa Telecom Ltda', cnpj: '11222333000181', cidade: 'Natal', uf: 'RN',
  horas_mes: 30, arquivado: false, consultoria_id: 's1', consultor_id: 'p1',
  consultoria: { id: 's1', nome: 'STI Consult' }, consultor: { id: 'p1', nome: 'Ana Lima', ativo: true, cor: null, foto: null },
  contato_nome: 'Joana', contato_telefone: null, contato_email: 'joana@alfa.test', observacoes: null,
}

describe('FichaDoCliente', () => {
  it('uma linha com situação, consultoria, consultor, previsão e cidade', () => {
    render(<FichaDoCliente cliente={CLIENTE} />)
    const ficha = screen.getByRole('region', { name: 'Resumo do cliente' })
    expect(within(ficha).getByText('Em atendimento')).toBeInTheDocument()
    expect(within(ficha).getByText('STI Consult')).toBeInTheDocument()
    expect(within(ficha).getByText('Ana Lima')).toBeInTheDocument()
    expect(within(ficha).getByText('30 h/mês previstas')).toBeInTheDocument()
    expect(within(ficha).getByText('Natal/RN')).toBeInTheDocument()
    // Empresa e contato ficam recolhidos.
    expect(within(ficha).queryByText('11.222.333/0001-81')).not.toBeInTheDocument()
  })

  it('abre e fecha com CNPJ formatado e "—" no vazio', async () => {
    const usuario = userEvent.setup()
    render(<FichaDoCliente cliente={CLIENTE} />)
    const botao = screen.getByRole('button', { name: 'Empresa e contato' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    await usuario.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    const detalhe = document.getElementById(botao.getAttribute('aria-controls'))
    expect(detalhe).not.toBeNull()
    const valor = (rotulo) => within(detalhe).getByText(rotulo).nextElementSibling.textContent
    expect(valor('CNPJ')).toBe('11.222.333/0001-81')
    expect(valor('Razão social')).toBe('Alfa Telecom Ltda')
    expect(valor('Observações')).toBe('—')
    expect(valor('Contato')).toBe('Joana')
    expect(valor('Telefone')).toBe('—')
    expect(valor('E-mail')).toBe('joana@alfa.test')
    await usuario.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('11.222.333/0001-81')).not.toBeInTheDocument()
  })

  it('consultor desativado', () => {
    render(<FichaDoCliente cliente={{ ...CLIENTE, consultor: { ...CLIENTE.consultor, ativo: false } }} />)
    expect(screen.getByText('(desativado)')).toBeInTheDocument()
  })

  it('a situação segue o cliente: aguardando consultor, aguardando distribuição e arquivado', () => {
    const { rerender } = render(<FichaDoCliente cliente={{ ...CLIENTE, consultor_id: null, consultor: null }} />)
    expect(screen.getByText('Aguardando consultor')).toBeInTheDocument()
    rerender(<FichaDoCliente cliente={{ ...CLIENTE, consultoria_id: null, consultoria: null, consultor_id: null, consultor: null }} />)
    expect(screen.getByText('Aguardando distribuição')).toBeInTheDocument()
    rerender(<FichaDoCliente cliente={{ ...CLIENTE, arquivado: true }} />)
    expect(screen.getByText('Arquivado')).toBeInTheDocument()
  })
})
