import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usoDoModelo } from '@/data/checklists'
import ApagarModelo from './ApagarModelo'

vi.mock('@/data/checklists', () => ({ usoDoModelo: vi.fn() }))

const MODELO = { id: 'm2', nome: 'Implantação', etapas: 4, tarefas: 14, arquivado_em: null }

function abrir(modelo = MODELO) {
  const aoFechar = vi.fn()
  const aoApagar = vi.fn().mockResolvedValue({ erro: null })
  const aoArquivar = vi.fn().mockResolvedValue({ erro: null })
  render(<ApagarModelo modelo={modelo} aoFechar={aoFechar} aoApagar={aoApagar} aoArquivar={aoArquivar} />)
  return { aoFechar, aoApagar, aoArquivar }
}
const botoes = () => within(screen.getByRole('alertdialog').querySelector('[data-slot="dialog-footer"]'))
  .getAllByRole('button').map((b) => b.textContent.trim())

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ApagarModelo', () => {
  it('enquanto confere o uso no banco, só dá para cancelar', async () => {
    let responder
    vi.mocked(usoDoModelo).mockImplementation(() => new Promise((r) => { responder = r }))
    abrir()
    expect(screen.getByRole('alertdialog', { name: 'Apagar "Implantação"?' })).toHaveTextContent('Conferindo se algum cliente usa este modelo…')
    expect(botoes()).toEqual(['Cancelar'])
    responder({ clientes: 0, nomes: [] })
    await waitFor(() => expect(botoes()).toEqual(['Cancelar', 'Arquivar', 'Apagar']))
  })

  it('sem uso: some junto o que o modelo tem; apagar fecha a janela', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 0, nomes: [] })
    const { aoApagar, aoFechar } = abrir()
    expect(await screen.findByText(/Somem junto 4 etapas e 14 tarefas do modelo/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(aoApagar).toHaveBeenCalled()
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('sem uso e já arquivado: sem a alternativa de arquivar', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 0, nomes: [] })
    abrir({ ...MODELO, etapas: 1, tarefas: 1, arquivado_em: '2026-11-12T10:00:00Z' })
    expect(await screen.findByText('Somem junto 1 etapa e 1 tarefa do modelo. Nenhum cliente usa este modelo. Não dá para desfazer.')).toBeInTheDocument()
    expect(botoes()).toEqual(['Cancelar', 'Apagar'])
  })

  it('em uso por um cliente: só arquivar, no singular', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 1, nomes: ['Acme'] })
    const { aoArquivar } = abrir()
    const janela = await screen.findByRole('alertdialog', { name: '"Implantação" está em uso' })
    expect(janela).toHaveTextContent('1 cliente que você vê usa este modelo: Acme. Por isso ele não pode ser apagado. Arquive: ele sai da lista de modelos para aplicar e o cliente continua com o check-list.')
    await userEvent.click(within(janela).getByRole('button', { name: 'Arquivar' }))
    expect(aoArquivar).toHaveBeenCalled()
  })

  it('em uso e já arquivado: nada a fazer, só Entendi', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 2, nomes: ['Acme', 'Beta'] })
    const { aoFechar } = abrir({ ...MODELO, arquivado_em: '2026-11-12T10:00:00Z' })
    const janela = await screen.findByRole('alertdialog', { name: '"Implantação" está em uso' })
    expect(janela).toHaveTextContent('2 clientes que você vê usam este modelo: Acme e Beta. Por isso ele não pode ser apagado. Ele já está arquivado: os clientes continuam com o check-list.')
    expect(botoes()).toEqual(['Entendi'])
    await userEvent.click(within(janela).getByRole('button', { name: 'Entendi' }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('não deu para conferir o uso: avisa e deixa tentar (o banco recusa apagar modelo em uso)', async () => {
    vi.mocked(usoDoModelo).mockRejectedValue(new Error('x'))
    abrir()
    expect(await screen.findByText(/Não foi possível conferir se algum cliente usa este modelo\. Se algum usar, o app não deixa apagar\./)).toBeInTheDocument()
    expect(botoes()).toEqual(['Cancelar', 'Arquivar', 'Apagar'])
  })

  it('a recusa do banco aparece na janela, que continua aberta', async () => {
    vi.mocked(usoDoModelo).mockResolvedValue({ clientes: 0, nomes: [] })
    const { aoApagar, aoFechar } = abrir()
    aoApagar.mockResolvedValue({ erro: 'Este modelo está em uso: clientes têm check-list dele. Arquive em vez de apagar.' })
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este modelo está em uso')
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
