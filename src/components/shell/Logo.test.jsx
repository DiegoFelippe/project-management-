import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Logo from './Logo'

describe('Logo', () => {
  it('mostra a logo da IXC Consult', () => {
    render(<Logo />)
    expect(screen.getByRole('img', { name: 'IXC Consult' })).toHaveAttribute('src', '/logo-ixc-consult.png')
  })
})
