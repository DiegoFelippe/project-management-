import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Caixa from './Caixa'
import Chave from './Chave'

describe('Caixa', () => {
  it('marca e desmarca, com o rótulo clicável', async () => {
    const aoMudar = vi.fn()
    function Teste() {
      const [m, setM] = useState(false)
      return <Caixa marcado={m} aoMudar={(v) => { setM(v); aoMudar(v) }} rotulo="Receber avisos" />
    }
    render(<Teste />)
    await userEvent.click(screen.getByText('Receber avisos'))
    expect(aoMudar).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('checkbox', { name: 'Receber avisos' })).toBeChecked()
    await userEvent.keyboard(' ')
    expect(aoMudar).toHaveBeenLastCalledWith(false)
  })

  it('indeterminado aparece como misto', () => {
    render(<Caixa marcado={false} indeterminado aoMudar={() => {}} rotulo="Todos" />)
    expect(screen.getByRole('checkbox', { name: 'Todos' })).toBePartiallyChecked()
  })
})

describe('Chave', () => {
  it('é um switch que liga e desliga por clique e teclado', async () => {
    const aoMudar = vi.fn()
    function Teste() {
      const [l, setL] = useState(false)
      return <Chave ligada={l} aoMudar={(v) => { setL(v); aoMudar(v) }} rotulo="Ativo" />
    }
    render(<Teste />)
    const chave = screen.getByRole('switch', { name: 'Ativo' })
    expect(chave).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(chave)
    expect(aoMudar).toHaveBeenLastCalledWith(true)
    expect(chave).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{Enter}')
    expect(aoMudar).toHaveBeenLastCalledWith(false)
  })
})
