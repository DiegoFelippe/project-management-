import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import EscolhaForma from './EscolhaForma'

function Escolha(props) {
  const [valor, setValor] = useState(props.inicial)
  return <EscolhaForma valor={valor} aoMudar={setValor} {...props} />
}

describe('EscolhaForma', () => {
  it('sem opções, é a chave de sempre das janelas de acesso (Enviar convite / Criar com senha)', async () => {
    render(<Escolha inicial="convite" />)
    const grupo = screen.getByRole('radiogroup', { name: 'Como criar o acesso' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Enviar convite' })).toBeChecked()
    await userEvent.click(screen.getByText('Criar com senha'))
    expect(screen.getByRole('radio', { name: 'Criar com senha' })).toBeChecked()
  })

  it('com `opcoes` e `rotulo`, serve a outras escolhas; a opção desligada não se escolhe', async () => {
    render(
      <Escolha inicial="pessoa" nome="dono" rotulo="De quem é o quadro"
        opcoes={[{ valor: 'pessoa', rotulo: 'Só eu' }, { valor: 'time', rotulo: 'Um time', desabilitada: true }]} />,
    )
    expect(screen.getByRole('radiogroup', { name: 'De quem é o quadro' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Só eu' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Um time' })).toBeDisabled()
    await userEvent.click(screen.getByText('Um time'))
    expect(screen.getByRole('radio', { name: 'Só eu' })).toBeChecked()
  })
})
