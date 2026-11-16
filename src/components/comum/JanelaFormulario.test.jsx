import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Users } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import JanelaFormulario, { SecaoFormulario } from './JanelaFormulario'

function montar(props = {}) {
  const aoFechar = vi.fn()
  render(
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo time" descricao="O time aparece na lista ao salvar."
      icone={Users} rodape={<button type="button">Salvar time</button>} {...props}>
      <SecaoFormulario titulo="Identificação"><label>Nome<input /></label></SecaoFormulario>
      <SecaoFormulario titulo="Gestão"><p>Quem gere</p></SecaoFormulario>
    </JanelaFormulario>,
  )
  return { aoFechar }
}

describe('JanelaFormulario', () => {
  it('mostra título, descrição, ícone, seções e rodapé', () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Novo time' })).toBeInTheDocument()
    expect(screen.getByText('O time aparece na lista ao salvar.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="janela-icone"] svg')).not.toBeNull()
    expect(screen.getByText('Identificação')).toBeInTheDocument()
    expect(screen.getByText('Gestão')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar time' })).toBeInTheDocument()
  })

  it('ao abrir, o foco vai para o primeiro campo do corpo (o X continua no cabeçalho)', () => {
    montar()
    expect(screen.getByLabelText('Nome')).toHaveFocus()
  })

  it('sem campo no corpo, o foco cai no que o Radix escolher (não quebra)', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="Aviso"><p>Só texto</p></JanelaFormulario>)
    expect(screen.getByRole('dialog', { name: 'Aviso' })).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('larguras lg e xl não encostam nas bordas entre 640 e 900px', () => {
    for (const largura of ['md', 'lg', 'xl']) {
      const { unmount } = render(<JanelaFormulario aberto aoFechar={() => {}} titulo={`J ${largura}`} largura={largura}><p>x</p></JanelaFormulario>)
      expect(screen.getByRole('dialog').className).toMatch(/sm:max-w-\[min\([\d.]+rem,calc\(100%-2rem\)\)\]/)
      unmount()
    }
  })

  it('o X fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('Esc fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('clique fora não fecha', async () => {
    const { aoFechar } = montar()
    await userEvent.click(document.querySelector('[data-slot="dialog-overlay"]'))
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('não renderiza fechada', () => {
    montar({ aberto: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sem descrição não gera aviso do Radix', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar({ descricao: undefined })
    expect(screen.getByRole('dialog', { name: 'Novo time' })).not.toHaveAttribute('aria-describedby')
    expect(aviso).not.toHaveBeenCalled()
    expect(erro).not.toHaveBeenCalled()
    aviso.mockRestore()
    erro.mockRestore()
  })

  it('enquanto envia, Esc e X não fecham e o spinner aparece', async () => {
    const { aoFechar } = montar({ enviando: true })
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelector('[data-slot="janela-rodape"] .animate-spin')).not.toBeNull()
  })
})
