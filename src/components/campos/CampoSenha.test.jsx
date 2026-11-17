import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Label } from '@/components/ui/label'
import CampoSenha from './CampoSenha'

function Controlado({ inicial = '', aoMudar = () => {}, ...props }) {
  const [valor, setValor] = useState(inicial)
  return <CampoSenha id="s" valor={valor} aoMudar={(v) => { setValor(v); aoMudar(v) }} {...props} />
}

describe('CampoSenha', () => {
  it('rótulo associado, escondida por padrão, e Mostrar/Esconder', async () => {
    render(<><Label htmlFor="s">Senha nova</Label><Controlado inicial="Abc" /></>)
    const campo = screen.getByLabelText('Senha nova')
    expect(campo).toHaveAttribute('type', 'password')
    expect(campo).toHaveClass('input')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(campo).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Esconder senha' }))
    expect(campo).toHaveAttribute('type', 'password')
  })

  it('o medidor muda ao digitar: Fraca, Média, Forte', async () => {
    render(<><Label htmlFor="s">Senha</Label><Controlado /></>)
    const campo = screen.getByLabelText('Senha')
    expect(screen.getByText('Fraca')).toBeInTheDocument()
    await userEvent.type(campo, 'Abcdefghij1')
    expect(screen.getByText('Média')).toBeInTheDocument()
    await userEvent.type(campo, '!')
    expect(screen.getByText('Forte')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Força da senha' })).toHaveAttribute('aria-valuenow', '5')
  })

  it('a lista de regras marca o que já foi cumprido', async () => {
    render(<><Label htmlFor="s">Senha</Label><Controlado /></>)
    await userEvent.type(screen.getByLabelText('Senha'), 'abc')
    const regras = screen.getByRole('list', { name: 'Regras da senha' })
    expect(regras).toHaveTextContent('Pelo menos 10 caracteres')
    expect(screen.getByText('Uma letra minúscula').closest('li')).toHaveAttribute('data-ok', 'true')
    expect(screen.getByText('Uma letra maiúscula').closest('li')).toHaveAttribute('data-ok', 'false')
  })

  it('Validar diz em uma frase o que falta, ou que está forte', async () => {
    render(<><Label htmlFor="s">Senha</Label><Controlado /></>)
    const campo = screen.getByLabelText('Senha')
    await userEvent.type(campo, 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Senha fraca. Falta: pelo menos 10 caracteres, uma letra maiúscula, um número e um símbolo.')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Abcdefghij1!')
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Senha forte. Pode salvar.')
  })

  it('Gerar senha preenche com uma senha forte de 16 caracteres e mostra', async () => {
    const aoMudar = vi.fn()
    render(<><Label htmlFor="s">Senha</Label><Controlado aoMudar={aoMudar} /></>)
    await userEvent.click(screen.getByRole('button', { name: 'Gerar senha' }))
    const gerada = aoMudar.mock.lastCall[0]
    expect(gerada).toHaveLength(16)
    const campo = screen.getByLabelText('Senha')
    expect(campo).toHaveValue(gerada)
    expect(campo).toHaveAttribute('type', 'text')
    expect(screen.getByText('Forte')).toBeInTheDocument()
  })

  it('Copiar manda a senha para a área de transferência e confirma', async () => {
    const usuario = userEvent.setup()
    const escrever = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<><Label htmlFor="s">Senha</Label><Controlado inicial="Abcdefghij1!" /></>)
    await usuario.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(escrever).toHaveBeenCalledWith('Abcdefghij1!')
    expect(await screen.findByRole('button', { name: 'Copiada' })).toBeInTheDocument()
  })

  it('se copiar falhar, a mensagem não é verde', async () => {
    const usuario = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('negado'))
    render(<Controlado inicial="Abcdefghij1!" />)
    await usuario.click(screen.getByRole('button', { name: 'Copiar' }))
    const aviso = await screen.findByText(/Não deu para copiar/)
    expect(aviso.className).not.toMatch(/positive/)
  })

  it('Copiar fica desligado com o campo vazio', () => {
    render(<Controlado />)
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeDisabled()
  })

  it('sem gerador, só o campo, o medidor e Validar', () => {
    render(<Controlado gerador={false} />)
    expect(screen.queryByRole('button', { name: 'Gerar senha' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Validar' })).toBeInTheDocument()
  })
})
