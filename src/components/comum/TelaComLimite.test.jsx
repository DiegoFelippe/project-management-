import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TelaComLimite from './TelaComLimite'

function Quebra() {
  throw new TypeError("Cannot read properties of undefined (reading 'toLocaleString')")
}

function app(endereco) {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route element={<div><nav><Link to="/ok">Ir para outra tela</Link></nav><TelaComLimite /></div>}>
          <Route path="/quebra" element={<Quebra />} />
          <Route path="/ok" element={<p>Tela que funciona</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

let silencio
beforeEach(() => { silencio = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => silencio.mockRestore())

describe('TelaComLimite: um erro numa tela não derruba o app', () => {
  it('sem erro, mostra a tela', () => {
    app('/ok')
    expect(screen.getByText('Tela que funciona')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('com erro, o menu fica e a tela diz o que fazer, com o botão de recarregar', () => {
    app('/quebra')
    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('Algo deu errado nesta tela')
    expect(screen.getByRole('button', { name: 'Recarregar a tela' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para outra tela' })).toBeInTheDocument()
    // O erro fica no console para quem for investigar.
    expect(silencio).toHaveBeenCalled()
  })

  it('ir para outra tela pelo menu sai do erro', async () => {
    app('/quebra')
    await userEvent.click(screen.getByRole('link', { name: 'Ir para outra tela' }))
    expect(screen.getByText('Tela que funciona')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
