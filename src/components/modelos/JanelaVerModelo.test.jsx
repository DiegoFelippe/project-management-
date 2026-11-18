import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lerModelo } from '@/data/modelos'
import { renderizarTela } from '@/test/renderizar'
import JanelaVerModelo from './JanelaVerModelo'

vi.mock('@/data/modelos', () => ({ lerModelo: vi.fn() }))

const MODELO = {
  id: 'm1', nome: 'Gestão financeira', descricao: 'Para clientes novos', tipo: 'gestao', da_central: true, consultoria: null,
  criado_por: { nome: 'Carla Central' }, criado_em: '2026-11-10T13:00:00Z', arquivado_em: null, pode_editar: true, pode_duplicar: true,
  etapas: [
    { id: 'e1', nome: 'Diagnóstico', posicao: 1, tarefas: [
      { id: 't1', titulo: 'Reunião de início', descricao: 'Com o dono', obrigatoria: true, prazo_dias: 2, posicao: 1, depende_de: [] },
      { id: 't2', titulo: 'Análise do DRE', descricao: null, obrigatoria: true, prazo_dias: 10, posicao: 2, depende_de: ['t1'] },
    ] },
    { id: 'e2', nome: 'Plano', posicao: 2, tarefas: [
      { id: 't3', titulo: 'Plano de ação', descricao: null, obrigatoria: false, prazo_dias: 20, posicao: 3, depende_de: ['t1', 't2'] },
    ] },
  ],
}
const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }

function abrir(perfil = central) {
  const aoFechar = vi.fn()
  const aoEditar = vi.fn()
  const aoDuplicar = vi.fn()
  renderizarTela(<JanelaVerModelo modeloId="m1" aoFechar={aoFechar} aoEditar={aoEditar} aoDuplicar={aoDuplicar} />, { perfil })
  return { aoFechar, aoEditar, aoDuplicar }
}
const rodape = () => screen.getByRole('dialog').querySelector('[data-slot="janela-rodape"]')
const botoesDoRodape = () => within(rodape()).getAllByRole('button').map((b) => b.textContent.trim())

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lerModelo).mockResolvedValue(MODELO)
})

describe('JanelaVerModelo', () => {
  it('lê o modelo e mostra, na aba Lista, as etapas e as tarefas com prazo, opcional e "depois de"', async () => {
    abrir()
    const janela = await screen.findByRole('dialog', { name: 'Gestão financeira' })
    expect(lerModelo).toHaveBeenCalledWith('m1')
    expect(janela).toHaveTextContent('Todas as consultorias · criado por Carla Central em 10/11/2026')
    expect(within(janela).getByText('Para clientes novos')).toBeInTheDocument()
    const etapa1 = within(janela).getByRole('list', { name: '1 · Diagnóstico' })
    expect(within(etapa1).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Reunião de inícioCom o donoDia 2 · pode começar logo',
      '2Análise do DREDia 10 · depois da 1',
    ])
    const etapa2 = within(janela).getByRole('list', { name: '2 · Plano' })
    expect(within(etapa2).getByRole('listitem')).toHaveTextContent('3Plano de açãoOpcionalDia 20 · depois da 1 e da 2')
  })

  it('a aba Fluxograma mostra o desenho num quadro que o teclado rola', async () => {
    abrir()
    const janela = await screen.findByRole('dialog', { name: 'Gestão financeira' })
    await userEvent.click(within(janela).getByRole('tab', { name: 'Fluxograma' }))
    const quadro = within(janela).getByRole('region', { name: 'Prévia do fluxograma, role para ver tudo' })
    expect(quadro).toHaveAttribute('tabindex', '0')
    expect(within(quadro).getByRole('img', { name: 'Fluxograma do modelo Gestão financeira' }).querySelectorAll('[data-tarefa]')).toHaveLength(3)
  })

  it('quem edita: Fechar, Duplicar e Editar (que entrega o modelo lido)', async () => {
    const { aoEditar, aoDuplicar } = abrir()
    await screen.findByRole('dialog', { name: 'Gestão financeira' })
    expect(botoesDoRodape()).toEqual(['Fechar', 'Duplicar', 'Editar'])
    await userEvent.click(within(rodape()).getByRole('button', { name: 'Editar' }))
    expect(aoEditar).toHaveBeenCalledWith(MODELO)
    await userEvent.click(within(rodape()).getByRole('button', { name: 'Duplicar' }))
    expect(aoDuplicar).toHaveBeenCalledWith(MODELO)
  })

  it('o gestor num modelo da Central: "Duplicar para a minha consultoria"', async () => {
    vi.mocked(lerModelo).mockResolvedValue({ ...MODELO, pode_editar: false })
    const { aoDuplicar } = abrir(gestor)
    await screen.findByRole('dialog', { name: 'Gestão financeira' })
    expect(botoesDoRodape()).toEqual(['Fechar', 'Duplicar para a minha consultoria'])
    await userEvent.click(within(rodape()).getByRole('button', { name: 'Duplicar para a minha consultoria' }))
    expect(aoDuplicar).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('o consultor só lê', async () => {
    vi.mocked(lerModelo).mockResolvedValue({ ...MODELO, pode_editar: false, pode_duplicar: false })
    const { aoFechar } = abrir(consultor)
    const janela = await screen.findByRole('dialog', { name: 'Gestão financeira' })
    expect(janela).toHaveTextContent('Só leitura: quem cria e muda os modelos é a Central ou a gestão da consultoria.')
    expect(botoesDoRodape()).toEqual(['Fechar'])
    await userEvent.click(within(rodape()).getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('arquivado: diz que está arquivado e não oferece Editar nem Duplicar', async () => {
    vi.mocked(lerModelo).mockResolvedValue({ ...MODELO, arquivado_em: '2026-11-12T10:00:00Z' })
    abrir()
    const janela = await screen.findByRole('dialog', { name: 'Gestão financeira' })
    expect(janela).toHaveTextContent('· arquivado')
    expect(botoesDoRodape()).toEqual(['Fechar'])
  })

  it('modelo que não existe mais, ou erro ao ler', async () => {
    vi.mocked(lerModelo).mockResolvedValue(null)
    const { unmount } = renderizarTela(<JanelaVerModelo modeloId="m1" aoFechar={() => {}} />, { perfil: central })
    expect(await screen.findByText('Este modelo não está mais disponível.')).toBeInTheDocument()
    unmount()
    vi.mocked(lerModelo).mockRejectedValue(new Error('x'))
    renderizarTela(<JanelaVerModelo modeloId="m1" aoFechar={() => {}} />, { perfil: central })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o modelo.')
  })
})
