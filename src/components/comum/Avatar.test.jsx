import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('mostra a foto quando a pessoa tem, e as iniciais quando não tem', () => {
    const { rerender } = render(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', foto: 'p1/abc.webp' }} />)
    expect(screen.getByRole('img', { name: 'Ana Lima' })).toHaveAttribute('src', expect.stringContaining('/storage/v1/object/public/fotos/p1/abc.webp'))
    rerender(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima' }} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})
