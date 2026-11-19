import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'
import { TEXTO_ESCURO, corDe } from '@/lib/cores'

describe('Avatar', () => {
  it('mostra a foto quando a pessoa tem, e as iniciais quando não tem', () => {
    const { rerender } = render(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', foto: 'p1/abc.webp' }} />)
    expect(screen.getByRole('img', { name: 'Ana Lima' })).toHaveAttribute('src', expect.stringContaining('/storage/v1/object/public/fotos/p1/abc.webp'))
    rerender(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima' }} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('usa a cor escolhida pela pessoa e, sem escolha, a automática', () => {
    const { rerender } = render(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', cor: '#16a34a' }} />)
    expect(screen.getByText('AL')).toHaveStyle({ backgroundColor: '#16a34a' })
    rerender(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', cor: null }} />)
    expect(screen.getByText('AL')).toHaveStyle({ backgroundColor: corDe('p1') })
  })

  it('as iniciais seguram 4,5:1: escuras no mostarda, brancas no azul (auditoria, 17/11)', () => {
    const { rerender } = render(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', cor: '#ca8a04' }} />)
    expect(screen.getByText('AL')).toHaveStyle({ color: TEXTO_ESCURO })
    rerender(<Avatar pessoa={{ id: 'p1', nome: 'Ana Lima', cor: '#2563eb' }} />)
    expect(screen.getByText('AL')).toHaveStyle({ color: '#ffffff' })
  })
})
