import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ApagarColuna from './ApagarColuna'

const COLUNAS = [
  { id: 'col1', nome: 'A fazer', cartoes: 2, arquivados: 0 },
  { id: 'col2', nome: 'Em andamento', cartoes: 3, arquivados: 1 },
  { id: 'col3', nome: 'Concluído', cartoes: 0, arquivados: 0 },
]

function abrir(coluna, aoApagar = vi.fn().mockResolvedValue({ erro: null })) {
  const aoFechar = vi.fn()
  render(<ApagarColuna coluna={coluna} colunas={COLUNAS} aoFechar={aoFechar} aoApagar={aoApagar} />)
  return { aoApagar, aoFechar, janela: screen.getByRole('dialog', { name: `Apagar a coluna ${coluna.nome}?` }) }
}

// O Seletor da janela pelo rótulo (dentro da janela, o resto da tela fica escondido).
async function escolher(user, janela, rotulo, opcao) {
  await user.click(within(janela).getByLabelText(rotulo))
  await user.click(screen.getAllByRole('option').find((o) => o.textContent === opcao))
}

describe('ApagarColuna', () => {
  it('com cartões, pergunta para onde eles vão: a coluna anterior por padrão (arquivados também)', async () => {
    const user = userEvent.setup()
    const { aoApagar, aoFechar, janela } = abrir(COLUNAS[1])
    expect(within(janela).getByText(/4 cartões \(1 arquivado\)/)).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Mover para outra coluna', pressed: true })).toBeInTheDocument()
    expect(within(janela).getByLabelText('Para qual coluna')).toHaveTextContent('A fazer')
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(aoApagar).toHaveBeenCalledWith({ destinoId: 'col1' })
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('a primeira coluna manda para a seguinte; dá para escolher outra', async () => {
    const user = userEvent.setup()
    const { aoApagar, janela } = abrir(COLUNAS[0])
    expect(within(janela).getByLabelText('Para qual coluna')).toHaveTextContent('Em andamento')
    await escolher(user, janela, 'Para qual coluna', 'Concluído')
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(aoApagar).toHaveBeenCalledWith({ destinoId: 'col3' })
  })

  it('"Apagar os cartões junto" diz quantos somem e com o quê', async () => {
    const user = userEvent.setup()
    const { aoApagar, janela } = abrir(COLUNAS[1])
    await user.click(within(janela).getByRole('button', { name: 'Apagar os cartões junto' }))
    expect(within(janela).queryByLabelText('Para qual coluna')).not.toBeInTheDocument()
    expect(within(janela).getByText('Os 4 cartões somem de vez, com checklist, comentários e anexos.')).toBeInTheDocument()
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(aoApagar).toHaveBeenCalledWith({ apagarCartoes: true })
  })

  it('coluna vazia: só ela some', async () => {
    const user = userEvent.setup()
    const { aoApagar, janela } = abrir(COLUNAS[2])
    expect(within(janela).getByText('A coluna está vazia; só ela some.')).toBeInTheDocument()
    expect(within(janela).queryByRole('button', { name: 'Mover para outra coluna' })).not.toBeInTheDocument()
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(aoApagar).toHaveBeenCalledWith({})
  })

  it('enquanto apaga mostra "Apagando…"; recusa do banco aparece na janela, que continua aberta', async () => {
    let responder
    const aoApagar = vi.fn(() => new Promise((r) => { responder = r }))
    const user = userEvent.setup()
    const { aoFechar, janela } = abrir(COLUNAS[1], aoApagar)
    await user.click(within(janela).getByRole('button', { name: 'Apagar coluna' }))
    expect(within(janela).getByRole('button', { name: 'Apagando…' })).toBeDisabled()
    responder({ erro: 'Você não tem permissão para isso.' })
    expect(await within(janela).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso.')
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
