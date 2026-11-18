import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Users } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import CampoNumero from '@/components/campos/CampoNumero'
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

  it('quando o primeiro campo é um CampoNumero, o foco vai para o número e não para o "Diminuir"', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="Previsão"><CampoNumero id="n" valor="3" aoMudar={() => {}} min={0} max={10} /></JanelaFormulario>)
    expect(document.getElementById('n')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Diminuir' })).not.toHaveFocus()
  })

  it('sem campo no corpo, o foco cai no que o Radix escolher (não quebra)', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="Aviso"><p>Só texto</p></JanelaFormulario>)
    expect(screen.getByRole('dialog', { name: 'Aviso' })).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('larguras lg e xl não encostam nas bordas entre 640 e 900px', () => {
    for (const largura of ['md', 'lg', 'xl', '5xl']) {
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

  it('abas: ficam no cabeçalho, abaixo do título, e quem não usa não ganha a linha', () => {
    const { unmount } = render(
      <JanelaFormulario aberto aoFechar={() => {}} titulo="Ficha" abas={<div role="tablist" aria-label="Seções" />}><p>x</p></JanelaFormulario>,
    )
    const faixa = document.querySelector('[data-slot="janela-abas"]')
    expect(faixa).not.toBeNull()
    expect(faixa).toContainElement(screen.getByRole('tablist', { name: 'Seções' }))
    expect(document.querySelector('header')).not.toContainElement(faixa)
    unmount()
    montar()
    expect(document.querySelector('[data-slot="janela-abas"]')).toBeNull()
  })

  it('alturaFixa: no desktop a janela tem altura fixa; sem ela, só o máximo', () => {
    const { unmount } = render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A" alturaFixa><p>x</p></JanelaFormulario>)
    expect(screen.getByRole('dialog').className).toContain('sm:h-[min(760px,calc(100dvh-2rem))]')
    unmount()
    montar()
    expect(screen.getByRole('dialog').className).not.toContain('sm:h-[')
  })

  it('acaoEsquerda: fica no rodapé, à esquerda, antes do que vem de rodape', () => {
    montar({ acaoEsquerda: <button type="button">Desativar</button> })
    const rodape = document.querySelector('[data-slot="janela-rodape"]')
    const esquerda = screen.getByRole('button', { name: 'Desativar' })
    expect(rodape).toContainElement(esquerda)
    expect(esquerda.parentElement).toHaveClass('mr-auto')
    expect(rodape.firstElementChild).toBe(esquerda.parentElement)
  })

  it('acaoEsquerda sozinha já mostra o rodapé', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A" acaoEsquerda={<button type="button">Sair</button>}><p>x</p></JanelaFormulario>)
    expect(document.querySelector('[data-slot="janela-rodape"]')).not.toBeNull()
  })

  it('rodapé padrão (rotuloEnviar + form): Cancelar outline e o principal ligado ao <form> do corpo', async () => {
    const aoFechar = vi.fn()
    render(
      <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo time" form="form-time" rotuloEnviar="Criar time" rotuloEnviando="Criando…">
        <form id="form-time"><input aria-label="Nome" /></form>
      </JanelaFormulario>,
    )
    const rodape = document.querySelector('[data-slot="janela-rodape"]')
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    const criar = screen.getByRole('button', { name: 'Criar time' })
    expect(rodape).toContainElement(cancelar)
    expect(rodape).toContainElement(criar)
    expect(cancelar).toHaveAttribute('type', 'button')
    expect(cancelar).toHaveClass('border', 'bg-card') // outline
    expect(criar).toHaveAttribute('type', 'submit')
    expect(criar).toHaveClass('bg-primary-cheio') // o principal, cheio
    expect(criar.form).toBe(screen.getByLabelText('Nome').form)
    expect(cancelar.compareDocumentPosition(criar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(cancelar)
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('rodapé padrão enquanto envia: o principal mostra a ação em andamento e os dois ficam desabilitados', () => {
    const { unmount } = render(
      <JanelaFormulario aberto aoFechar={() => {}} titulo="A" form="f" rotuloEnviar="Criar time" rotuloEnviando="Criando…" enviando>
        <form id="f" />
      </JanelaFormulario>,
    )
    expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Criar time' })).toBeNull()
    unmount()
    // Sem rotuloEnviando, a ação em andamento é "Salvando…".
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="B" form="f" rotuloEnviar="Salvar" enviando><form id="f" /></JanelaFormulario>)
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  })

  it('rodapé padrão sem form: o principal é um botão comum que chama aoEnviar', async () => {
    const aoEnviar = vi.fn()
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A" rotuloEnviar="Salvar" aoEnviar={aoEnviar}><p>x</p></JanelaFormulario>)
    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar).toHaveAttribute('type', 'button')
    expect(salvar).not.toHaveAttribute('form')
    await userEvent.click(salvar)
    expect(aoEnviar).toHaveBeenCalledTimes(1)
  })

  it('rodapé padrão com envioDesabilitado: só o principal fica desabilitado', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A" rotuloEnviar="Escolher" aoEnviar={() => {}} envioDesabilitado><p>x</p></JanelaFormulario>)
    expect(screen.getByRole('button', { name: 'Escolher' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
  })

  it('rodape (o rodapé diferente) vence o padrão', () => {
    render(
      <JanelaFormulario aberto aoFechar={() => {}} titulo="A" rotuloEnviar="Salvar" aoEnviar={() => {}}
        rodape={<button type="button">Fechar e voltar</button>}><p>x</p></JanelaFormulario>,
    )
    expect(screen.getByRole('button', { name: 'Fechar e voltar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  it('sem rodape, rotuloEnviar e acaoEsquerda, a janela não tem rodapé', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A"><p>x</p></JanelaFormulario>)
    expect(document.querySelector('[data-slot="janela-rodape"]')).toBeNull()
  })

  it('o foco inicial não cai no input de arquivo', () => {
    render(<JanelaFormulario aberto aoFechar={() => {}} titulo="A"><input type="file" aria-label="Arquivo" /><input aria-label="Nome" /></JanelaFormulario>)
    expect(screen.getByLabelText('Nome')).toHaveFocus()
  })
})
