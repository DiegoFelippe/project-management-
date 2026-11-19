import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CampoBusca } from '@/components/comum/BarraDeFiltros'
import CampoCodigo from '@/components/verificacao/CampoCodigo'
import CampoHora from './CampoHora'
import CampoNumero from './CampoNumero'
import Seletor from './Seletor'

// O iPhone dá zoom ao focar um campo de texto com menos de 16px: no celular os campos de digitar usam 16px
// e só a partir de `sm` o text-corpo da escala. A regra mora no CSS (.texto-de-campo), uma vez só.
const SEM_PREFIXO = /(^|\s)text-(titulo|destaque|janela|subtitulo|corpo|rotulo|legenda|mini)\b/

describe('campos de digitar no celular', () => {
  it('.input e .texto-de-campo usam 16px no celular e text-corpo a partir de sm, numa regra só', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/\.input, \.texto-de-campo \{ @apply text-base sm:text-corpo; \}/)
    const regra = css.slice(css.indexOf('.input {'), css.indexOf('\n  }', css.indexOf('.input {')))
    expect(regra).not.toMatch(/(^|\s)(sm:)?text-(base|corpo|\[)/)
  })

  it('campo de digitar não tem classe de tamanho da escala sem prefixo (ela vence a .texto-de-campo e o iPhone dá zoom)', () => {
    render(<><CampoNumero id="n" valor="1" aoMudar={() => {}} /><CampoCodigo id="c" valor="" aoMudar={() => {}} />
      <CampoBusca rotulo="Buscar x" valor="" aoMudar={() => {}} /></>)
    for (const campo of [screen.getByRole('searchbox'), ...screen.getAllByRole('textbox')]) {
      expect(campo.className).toMatch(/(^|\s)texto-de-campo\b/)
      expect(campo.className).not.toMatch(SEM_PREFIXO)
    }
  })

  it('CampoNumero, busca da barra, busca do Seletor e "Digitar horário"', async () => {
    const { unmount } = render(<CampoNumero id="n" valor="1" aoMudar={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveClass('texto-de-campo')
    unmount()
    render(<CampoBusca rotulo="Buscar x" valor="" aoMudar={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveClass('texto-de-campo')
  })

  it('campos dentro das listas', async () => {
    render(<><CampoHora id="h" valor="" aoMudar={() => {}} /><Seletor id="s" valor="" aoMudar={() => {}} buscar={async () => ({ itens: [], total: 0 })} /></>)
    await userEvent.click(document.getElementById('h'))
    expect(screen.getByLabelText('Digitar horário')).toHaveClass('texto-de-campo')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(document.getElementById('s'))
    expect(screen.getByLabelText('Buscar')).toHaveClass('texto-de-campo')
  })
})

// Textarea escrito à mão também dá zoom no iPhone se tiver menos de 16px: todos usam .texto-de-campo.
describe('textareas no celular', () => {
  it('todo <textarea> do código usa texto-de-campo', () => {
    const arquivos = execSync("grep -rl '<textarea' src --include='*.jsx'", { encoding: 'utf8' })
      .split('\n').filter((a) => a && !/\.test\.jsx$/.test(a))
    expect(arquivos.length).toBeGreaterThan(0)
    for (const arquivo of arquivos) {
      const tags = readFileSync(arquivo, 'utf8').match(/<textarea[\s\S]*?\/>/g) ?? []
      const usaConstante = /CAMPO_TEXTO/.test(readFileSync(arquivo, 'utf8'))
      for (const tag of tags) {
        const trecho = usaConstante && /className=\{CAMPO_TEXTO\}/.test(tag)
          ? readFileSync(arquivo, 'utf8').match(/const CAMPO_TEXTO = '([^']*)'/)[1] : tag
        expect(trecho, arquivo).toMatch(/(^|\s)texto-de-campo\b/)
        expect(trecho, arquivo).not.toMatch(/(^|\s)(sm:)?text-(base|sm)\b/)
        expect(trecho, arquivo).not.toMatch(SEM_PREFIXO)
      }
    }
  })
})
