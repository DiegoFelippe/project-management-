import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from './sonner'

// O CSS do sonner fixa 13 px no aviso e 12 px no botão: as classes (com !) levam os avisos para a escala.
describe('Toaster', () => {
  it('aviso em text-corpo e botão de ação em text-rotulo, com a Inter', async () => {
    render(<Toaster />)
    act(() => { toast('Salvo', { action: { label: 'Desfazer', onClick: () => {} } }) })
    const aviso = (await screen.findByText('Salvo')).closest('[data-sonner-toast]')
    expect(aviso).toHaveClass('text-corpo!', 'font-sans!')
    expect(screen.getByText('Desfazer')).toHaveClass('text-rotulo!')
  })
})
