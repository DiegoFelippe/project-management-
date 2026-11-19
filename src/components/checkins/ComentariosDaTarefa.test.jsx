import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apagarComentarioDaTarefa, comentariosDaTarefa, comentarTarefa, editarComentarioDaTarefa,
} from '@/data/checklists'
import ComentariosDaTarefa from './ComentariosDaTarefa'

vi.mock('@/data/checklists', () => ({
  comentariosDaTarefa: vi.fn(), comentarTarefa: vi.fn(), editarComentarioDaTarefa: vi.fn(), apagarComentarioDaTarefa: vi.fn(),
}))

const c = (id, texto, campos = {}) => ({
  id, texto, criado_em: '2026-11-17T12:40:00Z', editado_em: null, autor: { nome: 'Ana Lima', foto: null, cor: null },
  pode_editar: false, pode_apagar: false, ...campos,
})
// Do banco: mais recentes primeiro.
const MEU = c('c2', 'Recebi. Faltam as notas de outubro.', { criado_em: '2026-11-17T13:00:00Z', pode_editar: true, pode_apagar: true })
const DO_GESTOR = c('c1', 'O cliente mandou os extratos.', { autor: { nome: 'Gil Gestor', foto: null, cor: null } })

// O rascunho fica com quem chama (a janela pergunta antes de descartar e o Salvar o envia).
function Teste({ aoEditar = vi.fn(), aoMexer = vi.fn(), erroDaEdicao, total = 2 }) {
  const [rascunho, setRascunho] = useState('')
  return (
    <ComentariosDaTarefa tarefaId="t1" total={total} rascunho={rascunho} aoMudarRascunho={setRascunho} aoEditar={aoEditar}
      erroDaEdicao={erroDaEdicao} aoMexer={aoMexer} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [MEU, DO_GESTOR], haMais: false, podeComentar: true })
})

describe('ComentariosDaTarefa', () => {
  it('lê os comentários e mostra do mais antigo para o mais novo, com quem e quando', async () => {
    render(<Teste />)
    const lista = await screen.findByRole('list', { name: 'Comentários' })
    expect(comentariosDaTarefa).toHaveBeenCalledWith({ tarefaId: 't1' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map((i) => i.querySelector('[data-texto]').textContent)).toEqual(['O cliente mandou os extratos.', 'Recebi. Faltam as notas de outubro.'])
    expect(itens[0]).toHaveTextContent('Gil Gestor')
    expect(itens[0]).toHaveTextContent('17/11/2026, 09:40')
    expect(screen.getByRole('heading', { name: /Comentários/ })).toHaveTextContent('2')
  })

  it('sem nenhum, diz isso; nome escondido pelo banco vira "Alguém sem acesso"', async () => {
    vi.mocked(comentariosDaTarefa).mockResolvedValue({
      itens: [c('c9', 'Antigo', { autor: { nome: null, foto: null, cor: null } })], haMais: false, podeComentar: false,
    })
    render(<Teste total={1} />)
    expect(await screen.findByText('Alguém sem acesso')).toBeInTheDocument()
    vi.mocked(comentariosDaTarefa).mockResolvedValue({ itens: [], haMais: false, podeComentar: true })
    render(<Teste total={0} />)
    expect(await screen.findByText('Nenhum comentário ainda.')).toBeInTheDocument()
  })

  it('Comentar grava na hora (sem o Salvar), põe no fim da conversa, limpa o campo e avisa quem chama', async () => {
    const aoMexer = vi.fn()
    vi.mocked(comentarTarefa).mockResolvedValue({ erro: null, comentario: c('c3', 'Pedi ao contador', { pode_editar: true, pode_apagar: true }) })
    render(<Teste aoMexer={aoMexer} />)
    const campo = await screen.findByRole('textbox', { name: 'Novo comentário' })
    const comentar = screen.getByRole('button', { name: 'Comentar' })
    expect(comentar).toBeDisabled()
    await userEvent.type(campo, '  Pedi ao contador ')
    await userEvent.click(comentar)
    expect(comentarTarefa).toHaveBeenCalledWith('t1', 'Pedi ao contador')
    const lista = screen.getByRole('list', { name: 'Comentários' })
    await waitFor(() => expect(within(lista).getAllByRole('listitem').at(-1)).toHaveTextContent('Pedi ao contador'))
    expect(campo).toHaveValue('')
    expect(aoMexer).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: /Comentários/ })).toHaveTextContent('3')
  })

  it('recusa do banco: o texto fica e o erro aparece', async () => {
    vi.mocked(comentarTarefa).mockResolvedValue({ erro: 'Só o consultor do cliente e a gestão comentam.' })
    render(<Teste />)
    const campo = await screen.findByRole('textbox', { name: 'Novo comentário' })
    await userEvent.type(campo, 'Oi')
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }))
    expect(await screen.findByText('Só o consultor do cliente e a gestão comentam.')).toBeInTheDocument()
    expect(campo).toHaveValue('Oi')
  })

  it('edita só o que pode (o próprio): Editar abre o campo com o texto; Salvar grava e marca "editado"', async () => {
    const aoEditar = vi.fn()
    vi.mocked(editarComentarioDaTarefa).mockResolvedValue({
      erro: null, comentario: { ...MEU, texto: 'Recebi tudo.', editado_em: '2026-11-17T14:00:00Z' },
    })
    render(<Teste aoEditar={aoEditar} />)
    const lista = await screen.findByRole('list', { name: 'Comentários' })
    const [doGestor, meu] = within(lista).getAllByRole('listitem')
    expect(within(doGestor).queryByRole('button', { name: 'Editar comentário' })).not.toBeInTheDocument()
    await userEvent.click(within(meu).getByRole('button', { name: 'Editar comentário' }))
    expect(aoEditar).toHaveBeenLastCalledWith(true)
    const campo = within(meu).getByRole('textbox', { name: 'Texto do comentário' })
    expect(campo).toHaveValue('Recebi. Faltam as notas de outubro.')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Recebi tudo.')
    await userEvent.click(within(meu).getByRole('button', { name: 'Salvar comentário' }))
    expect(editarComentarioDaTarefa).toHaveBeenCalledWith('c2', 'Recebi tudo.')
    await waitFor(() => expect(meu).toHaveTextContent('Recebi tudo.'))
    expect(meu).toHaveTextContent('editado')
    expect(aoEditar).toHaveBeenLastCalledWith(false)
  })

  it('o erro da edição (a janela pede para salvar ou cancelar) fica embaixo do campo', async () => {
    render(<Teste erroDaEdicao="Salve ou cancele o comentário que você está editando." />)
    const lista = await screen.findByRole('list', { name: 'Comentários' })
    await userEvent.click(within(lista).getByRole('button', { name: 'Editar comentário' }))
    const campo = within(lista).getByRole('textbox', { name: 'Texto do comentário' })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Salve ou cancele o comentário que você está editando.')
  })

  it('apagar pede confirmação dizendo de quem é; confirmado, some', async () => {
    vi.mocked(comentariosDaTarefa).mockResolvedValue({
      itens: [MEU, { ...DO_GESTOR, pode_apagar: true }], haMais: false, podeComentar: true,
    })
    vi.mocked(apagarComentarioDaTarefa).mockResolvedValue({ erro: null })
    const aoMexer = vi.fn()
    render(<Teste aoMexer={aoMexer} />)
    const lista = await screen.findByRole('list', { name: 'Comentários' })
    await userEvent.click(within(within(lista).getAllByRole('listitem')[0]).getByRole('button', { name: 'Apagar comentário' }))
    const confirmar = screen.getByRole('alertdialog', { name: 'Apagar o comentário?' })
    expect(confirmar).toHaveTextContent('O comentário some da tarefa para todos. Ele é de Gil Gestor.')
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Apagar comentário' }))
    expect(apagarComentarioDaTarefa).toHaveBeenCalledWith('c1')
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(1))
    expect(aoMexer).toHaveBeenCalled()
  })

  it('quem só lê (a Central): sem campo, sem Editar e sem Apagar', async () => {
    vi.mocked(comentariosDaTarefa).mockResolvedValue({
      itens: [{ ...MEU, pode_editar: false, pode_apagar: false }], haMais: false, podeComentar: false,
    })
    render(<Teste total={1} />)
    await screen.findByRole('list', { name: 'Comentários' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /comentário|Comentar/ })).not.toBeInTheDocument()
  })

  it('"Ver comentários anteriores" pede os de antes do mais antigo mostrado', async () => {
    vi.mocked(comentariosDaTarefa)
      .mockResolvedValueOnce({ itens: [MEU, DO_GESTOR], haMais: true, podeComentar: true })
      .mockResolvedValueOnce({ itens: [c('c0', 'O primeiro')], haMais: false, podeComentar: true })
    render(<Teste total={3} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver comentários anteriores' }))
    expect(comentariosDaTarefa).toHaveBeenLastCalledWith({ tarefaId: 't1', antesId: 'c1' })
    const lista = screen.getByRole('list', { name: 'Comentários' })
    await waitFor(() => expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('O primeiro'))
    expect(screen.queryByRole('button', { name: 'Ver comentários anteriores' })).not.toBeInTheDocument()
  })
})
