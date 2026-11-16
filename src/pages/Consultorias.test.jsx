import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { consultoriasPorOcupacao } from '@/data/capacidade'
import { contarClientesAtivos } from '@/data/clientes'
import { gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { trocarLogo } from '@/data/imagens'
import { deslocarMes, mesAtual } from '@/lib/mes'
import { renderizarTela } from '@/test/renderizar'
import Consultorias from './Consultorias'

vi.mock('@/data/consultorias', () => ({
  listarConsultorias: vi.fn(), criarConsultoria: vi.fn(), gerenciarConsultoria: vi.fn(),
}))
vi.mock('@/data/capacidade', () => ({ consultoriasPorOcupacao: vi.fn(), definirCarga: vi.fn() }))
vi.mock('@/data/usuarios', () => ({ criarAcesso: vi.fn() }))
vi.mock('@/data/clientes', () => ({ contarClientesAtivos: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarLogo: vi.fn().mockResolvedValue({ erro: null }), tirarLogo: vi.fn() }))

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

const dono = { id: 'd1', papel: 'dono', consultoria_id: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarConsultorias).mockResolvedValue({
    itens: [
      { id: 'c1', nome: 'Acme', arquivada: false, pessoas: 5, times: 2,
        admins: [{ id: 'a1', nome: 'Rita', email: 'rita@acme.test', convite_pendente: false }] },
      { id: 'c2', nome: 'Beta', arquivada: false, pessoas: 1, times: 0, admins: [] },
    ],
    total: 2,
  })
  vi.mocked(gerenciarConsultoria).mockResolvedValue({ erro: null })
  vi.mocked(contarClientesAtivos).mockResolvedValue(0)
  vi.mocked(consultoriasPorOcupacao).mockResolvedValue({
    itens: [{ id: 'c1', nome: 'Acme', consultores: 4, capacidade: 160, reservado: 80, realizado: 40, ocupacao: 0.5, clientes: 7, aguardando: 2 }],
    total: 1,
  })
})

describe('Consultorias', () => {
  it('lista as consultorias numa tabela: nome, administração, pessoas e times', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    const tabela = await screen.findByRole('table', { name: 'Consultorias' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    const acme = screen.getByRole('row', { name: /Acme/ })
    expect(within(acme).getByText('Rita')).toBeInTheDocument()
    expect(within(acme).getByText('5')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Beta/ })).getByText('Sem administrador')).toBeInTheDocument()
  })

  it('Editar abre o formulário com a consultoria escolhida já preenchida', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Beta/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar consultoria' })
    const nome = within(janela).getByLabelText('Nome da consultoria')
    expect(nome).toHaveValue('Beta')
    await userEvent.type(nome, ' Brasil')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(gerenciarConsultoria).toHaveBeenCalledWith('renomear', 'c2', { nome: 'Beta Brasil' })
  })

  it('a logo escolhida no Editar vai para o Storage, sem renomear se o nome não mudou', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Acme/ })).getByRole('button', { name: 'Editar' }))
    const arquivo = new File(['x'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher logo'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(trocarLogo).toHaveBeenCalledWith('c1', arquivo, undefined)
    expect(gerenciarConsultoria).not.toHaveBeenCalled()
  })

  it('Arquivar diz quantos clientes ativos voltam para a central (contados no banco)', async () => {
    vi.mocked(contarClientesAtivos).mockResolvedValue(3)
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Acme/ })).getByRole('button', { name: 'Arquivar' }))
    const janela = screen.getByRole('alertdialog')
    expect(await within(janela).findByText(/3 clientes ativos voltam para a central \(A distribuir\) e não voltam ao reativar\./))
      .toBeInTheDocument()
    expect(contarClientesAtivos).toHaveBeenCalledWith({ consultoriaId: 'c1' })
    await userEvent.click(within(janela).getByRole('button', { name: 'Arquivar' }))
    expect(gerenciarConsultoria).toHaveBeenCalledWith('arquivar', 'c1', undefined)
  })

  it('Arquivar com 1 cliente ativo fala no singular; sem clientes, não fala deles', async () => {
    vi.mocked(contarClientesAtivos).mockResolvedValueOnce(1)
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Acme/ })).getByRole('button', { name: 'Arquivar' }))
    expect(await screen.findByText(/1 cliente ativo volta para a central \(A distribuir\) e não volta ao reativar\./)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(within(screen.getByRole('row', { name: /Beta/ })).getByRole('button', { name: 'Arquivar' }))
    await vi.waitFor(() => expect(contarClientesAtivos).toHaveBeenLastCalledWith({ consultoriaId: 'c2' }))
    await vi.waitFor(() => expect(screen.getByRole('alertdialog')).not.toHaveTextContent(/clientes? ativos?/))
  })

  it('pagina no banco, e Arquivadas pede as arquivadas desde a página 1', async () => {
    vi.mocked(listarConsultorias).mockResolvedValueOnce({ itens: [], total: 0 })
    renderizarTela(<Consultorias />, { perfil: dono })
    await screen.findByText(/Nenhuma consultoria ainda/)
    expect(listarConsultorias).toHaveBeenLastCalledWith({ arquivadas: false, pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Arquivadas' }))
    expect(listarConsultorias).toHaveBeenLastCalledWith({ arquivadas: true, pagina: 1 })
  })

  describe('Ocupação do mês', () => {
    it('a aba aparece para o dono e para a central', async () => {
      for (const papel of ['dono', 'central']) {
        const { unmount } = renderizarTela(<Consultorias />, { perfil: { id: 'x', papel, consultoria_id: null } })
        expect(await screen.findByRole('button', { name: 'Ocupação do mês' })).toBeInTheDocument()
        unmount()
      }
    })

    it('não aparece para quem não é da central', async () => {
      renderizarTela(<Consultorias />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
      await screen.findByRole('table', { name: 'Consultorias' })
      expect(screen.queryByRole('button', { name: 'Ocupação do mês' })).toBeNull()
    })

    it('mostra os números por consultoria e pede o mês e a página ao banco', async () => {
      renderizarTela(<Consultorias />, { perfil: dono })
      await userEvent.click(await screen.findByRole('button', { name: 'Ocupação do mês' }))
      const tabela = await screen.findByRole('table', { name: 'Ocupação do mês' })
      expect(consultoriasPorOcupacao).toHaveBeenCalledWith({ limite: 15, deslocamento: 0, mes: mesAtual() })
      const acme = within(tabela).getByRole('row', { name: /Acme/ })
      for (const texto of ['160 h', '80 h', '40 h', '50%']) expect(within(acme).getByText(texto)).toBeInTheDocument()
      expect(within(tabela).getByRole('columnheader', { name: 'Ocupação' })).toBeInTheDocument()
    })

    it('Próxima pede a página 2 ao banco quando passa de 15', async () => {
      vi.mocked(consultoriasPorOcupacao).mockResolvedValue({
        itens: Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, nome: `Consultoria ${i}`, consultores: 1, capacidade: 40, reservado: 0, realizado: 0, ocupacao: 0, clientes: 0, aguardando: 0 })),
        total: 20,
      })
      renderizarTela(<Consultorias />, { perfil: dono })
      await userEvent.click(await screen.findByRole('button', { name: 'Ocupação do mês' }))
      await screen.findByRole('table', { name: 'Ocupação do mês' })
      await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
      await vi.waitFor(() => expect(consultoriasPorOcupacao).toHaveBeenLastCalledWith({ limite: 15, deslocamento: 15, mes: mesAtual() }))
    })

    it('em mês passado some o Reservado e a Ocupação vira Utilização', async () => {
      renderizarTela(<Consultorias />, { perfil: dono })
      await userEvent.click(await screen.findByRole('button', { name: 'Ocupação do mês' }))
      await screen.findByRole('table', { name: 'Ocupação do mês' })
      await userEvent.click(screen.getByRole('button', { name: /Anterior/ }))
      await vi.waitFor(() => expect(consultoriasPorOcupacao).toHaveBeenLastCalledWith({ limite: 15, deslocamento: 0, mes: deslocarMes(mesAtual(), -1) }))
      const tabela = await screen.findByRole('table', { name: 'Ocupação do mês' })
      expect(within(tabela).getByRole('columnheader', { name: 'Utilização' })).toBeInTheDocument()
      expect(within(tabela).queryByRole('columnheader', { name: 'Reservado' })).toBeNull()
    })
  })
})
