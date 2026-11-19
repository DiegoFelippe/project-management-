import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Campo from './Campo'
import CampoData from './CampoData'
import CampoHora from './CampoHora'
import CampoNumero from './CampoNumero'
import CampoSenha from './CampoSenha'
import Seletor from './Seletor'

// Usabilidade, U2: cada erro embaixo do seu campo, com a borda vermelha, aria-invalid e aria-describedby.
describe('Campo', () => {
  it('sem erro: o rótulo nomeia o campo e nada fica marcado', () => {
    render(<Campo id="c-nome" rotulo="Nome"><Input id="c-nome" /></Campo>)
    const campo = screen.getByLabelText('Nome')
    expect(campo).not.toHaveAttribute('aria-invalid')
    expect(campo).not.toHaveAttribute('aria-describedby')
  })

  it('com erro: a mensagem fica embaixo do campo, que fica marcado e descrito por ela', () => {
    render(<Campo id="c-email" rotulo="E-mail" erro="Digite um e-mail válido."><Input id="c-email" /></Campo>)
    const campo = screen.getByLabelText('E-mail')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Digite um e-mail válido.')
    const mensagem = screen.getByText('Digite um e-mail válido.').closest('[data-slot="erro-do-campo"]')
    expect(mensagem).toHaveAttribute('id', 'c-email-erro')
    expect(mensagem).toHaveClass('text-destructive')
    // Embaixo do campo, no mesmo bloco.
    expect(campo.compareDocumentPosition(mensagem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mensagem.closest('[data-slot="campo"]')).toContainElement(campo)
  })

  it('com dica e erro: o campo é descrito pelos dois, e um aria-describedby do próprio campo continua', () => {
    render(
      <Campo id="c-token" rotulo="Token" dica="Começa com xoxb-." erro="Informe o token.">
        <Input id="c-token" aria-describedby="outra-coisa" />
      </Campo>,
    )
    const ids = screen.getByLabelText('Token').getAttribute('aria-describedby').split(' ')
    expect(ids).toEqual(expect.arrayContaining(['outra-coisa', 'c-token-dica', 'c-token-erro']))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('só o campo do rótulo (mesmo id) é marcado; outro campo dentro dele não', () => {
    render(<Campo id="c-a" rotulo="A" erro="Errado."><Input id="c-a" /><Input aria-label="Outro" /></Campo>)
    expect(screen.getByLabelText('A')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Outro')).not.toHaveAttribute('aria-invalid')
  })

  it('Textarea, CampoData, CampoHora e Seletor também ficam marcados e descritos pelo erro', () => {
    render(
      <>
        <Campo id="c-obs" rotulo="Observações" erro="Erro do texto."><Textarea id="c-obs" /></Campo>
        <Campo id="c-data" rotulo="Data" erro="Erro da data."><CampoData id="c-data" valor="" aoMudar={() => {}} /></Campo>
        <Campo id="c-hora" rotulo="Início" erro="Erro da hora."><CampoHora id="c-hora" valor="" aoMudar={() => {}} /></Campo>
        <Campo id="c-lista" rotulo="Time" erro="Erro da lista."><Seletor id="c-lista" valor="" aoMudar={() => {}} opcoes={[{ valor: 'a', rotulo: 'A' }]} /></Campo>
      </>,
    )
    for (const [rotulo, mensagem] of [['Observações', 'Erro do texto.'], ['Data', 'Erro da data.'], ['Início', 'Erro da hora.'], ['Time', 'Erro da lista.']]) {
      const campo = screen.getByLabelText(rotulo)
      expect(campo).toHaveAttribute('aria-invalid', 'true')
      expect(campo).toHaveAccessibleDescription(expect.stringContaining(mensagem))
    }
  })

  it('CampoData e CampoHora sem erro continuam descritos só pelo valor', () => {
    render(<Campo id="c-data" rotulo="Data"><CampoData id="c-data" valor="" aoMudar={() => {}} /></Campo>)
    expect(screen.getByLabelText('Data')).toHaveAccessibleDescription('Escolher data')
    expect(screen.getByLabelText('Data')).not.toHaveAttribute('aria-invalid')
  })

  it('CampoNumero: o número fica marcado e a moldura ganha a borda vermelha', () => {
    render(<Campo id="c-horas" rotulo="Horas" erro="Use de 0 a 60."><CampoNumero id="c-horas" valor="70" aoMudar={() => {}} /></Campo>)
    const campo = screen.getByLabelText('Horas')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Use de 0 a 60.')
    expect(campo.closest('[data-slot="moldura-numero"]')).toHaveClass('border-destructive')
  })

  it('CampoSenha: o campo da senha fica marcado pelo erro do Campo', () => {
    render(<Campo id="c-senha" rotulo="Senha" erro="A senha precisa ser forte."><CampoSenha id="c-senha" valor="" aoMudar={() => {}} /></Campo>)
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true')
  })
})
