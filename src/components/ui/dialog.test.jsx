import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'

describe('DialogTitle', () => {
  it('usa a escala (text-janela) e não a fonte condensada', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descrição</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    const titulo = screen.getByText('Título')
    expect(titulo.className).not.toMatch(/font-stretch/)
    expect(titulo).toHaveClass('text-janela')
  })
})
