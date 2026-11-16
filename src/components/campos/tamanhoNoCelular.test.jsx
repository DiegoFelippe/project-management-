import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CampoBusca } from '@/components/comum/BarraDeFiltros'
import CampoHora from './CampoHora'
import CampoNumero from './CampoNumero'
import Seletor from './Seletor'

// O iPhone dá zoom ao focar um campo de texto com menos de 16px: no celular os campos de digitar usam 16px
// (text-base) e só a partir de `sm` o tamanho compacto do Hub.
describe('campos de digitar no celular', () => {
  it('.input usa 16px no celular e 13,5px a partir de sm', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const regra = css.slice(css.indexOf('.input {'), css.indexOf('}', css.indexOf('.input {')))
    expect(regra).toMatch(/\btext-base\b/)
    expect(regra).toMatch(/sm:text-\[13\.5px\]/)
    expect(regra).not.toMatch(/(^|\s)text-\[13\.5px\]/)
  })

  it('CampoNumero, busca da barra, busca do Seletor e "Digitar horário"', async () => {
    const { unmount } = render(<CampoNumero id="n" valor="1" aoMudar={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveClass('text-base')
    unmount()
    render(<CampoBusca rotulo="Buscar x" valor="" aoMudar={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveClass('input')
  })

  it('campos dentro das listas', async () => {
    render(<><CampoHora id="h" valor="" aoMudar={() => {}} /><Seletor id="s" valor="" aoMudar={() => {}} buscar={async () => ({ itens: [], total: 0 })} /></>)
    await userEvent.click(document.getElementById('h'))
    expect(screen.getByLabelText('Digitar horário')).toHaveClass('text-base')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(document.getElementById('s'))
    expect(screen.getByLabelText('Buscar')).toHaveClass('text-base')
  })
})
