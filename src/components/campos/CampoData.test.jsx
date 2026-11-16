import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Label } from '@/components/ui/label'
import CampoData from './CampoData'

function Controlado({ inicial = '', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <CampoData id="data" valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('CampoData', () => {
  it('o rótulo fica associado ao campo e mostra a data por extenso', () => {
    render(<><Label htmlFor="data">Prazo</Label><Controlado inicial="2026-11-16" /></>)
    const campo = screen.getByLabelText('Prazo')
    expect(campo).toHaveAttribute('aria-haspopup', 'dialog')
    expect(campo).toHaveAttribute('aria-expanded', 'false')
    expect(campo).toHaveTextContent('16 de nov de 2026')
  })

  it('escolher um dia devolve o texto yyyy-MM-dd e fecha', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="2026-11-16" aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /16 de nov/ }))
    await userEvent.click(screen.getByRole('button', { name: '20 de novembro de 2026' }))
    expect(aoMudar).toHaveBeenCalledWith('2026-11-20')
    expect(screen.queryByRole('dialog', { name: 'Escolher data' })).toBeNull()
  })

  it('min e max apagam os dias de fora', async () => {
    render(<Controlado inicial="2026-11-16" min="2026-11-10" max="2026-11-20" />)
    await userEvent.click(screen.getByRole('button', { name: /16 de nov/ }))
    expect(screen.getByRole('button', { name: '9 de novembro de 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '21 de novembro de 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '15 de novembro de 2026' })).toBeEnabled()
  })

  it('navega entre meses e as setas do teclado movem o dia', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="2026-11-30" aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /30 de nov/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByRole('button', { name: '15 de dezembro de 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    screen.getByRole('button', { name: '30 de novembro de 2026' }).focus()
    await userEvent.keyboard('{ArrowRight}{Enter}')
    expect(aoMudar).toHaveBeenCalledWith('2026-12-01')
  })

  it('data opcional: Limpar volta a vazio', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="2026-11-16" aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Limpar data' }))
    expect(aoMudar).toHaveBeenCalledWith('')
    expect(screen.getByRole('button', { name: /Escolher data/ })).toBeInTheDocument()
  })

  it('obrigatória não oferece limpar', async () => {
    render(<Controlado inicial="2026-11-16" obrigatorio />)
    expect(screen.queryByRole('button', { name: 'Limpar data' })).toBeNull()
  })

  it('Hoje e os atalhos preenchem a data', async () => {
    const aoMudar = vi.fn()
    render(<Controlado aoMudar={aoMudar} atalhos={[{ rotulo: 'Fim do mês', valor: '2026-11-30' }]} />)
    await userEvent.click(screen.getByRole('button', { name: /Escolher data/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Fim do mês' }))
    expect(aoMudar).toHaveBeenCalledWith('2026-11-30')
  })

  it('com hora, junta data e horário em yyyy-MM-ddTHH:mm', async () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial="2026-11-16T09:30" comHora aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /16 de nov/ }))
    await userEvent.click(screen.getByRole('button', { name: '18 de novembro de 2026' }))
    expect(aoMudar).toHaveBeenLastCalledWith('2026-11-18T09:30')
    const dialogo = screen.getByRole('dialog', { name: 'Escolher data' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Horário' }))
    await userEvent.click(screen.getByRole('button', { name: '14', exact: true }))
    expect(aoMudar).toHaveBeenLastCalledWith('2026-11-18T14:30')
  })

  it('dentro de uma janela: clique funciona e Esc fecha só a lista', async () => {
    const aoFechar = vi.fn()
    const aoMudar = vi.fn()
    render(
      <JanelaFormulario aberto aoFechar={aoFechar} titulo="Novo prazo">
        <Controlado inicial="2026-11-16" aoMudar={aoMudar} />
      </JanelaFormulario>,
    )
    await userEvent.click(screen.getByRole('button', { name: /16 de nov/ }))
    const lista = screen.getByRole('dialog', { name: 'Escolher data' })
    expect(screen.getByRole('dialog', { name: 'Novo prazo' })).toContainElement(lista)
    await userEvent.click(screen.getByRole('button', { name: '22 de novembro de 2026' }))
    expect(aoMudar).toHaveBeenCalledWith('2026-11-22')
    await userEvent.click(screen.getByRole('button', { name: /22 de nov/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Escolher data' })).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Novo prazo' })).toBeInTheDocument()
  })
})
