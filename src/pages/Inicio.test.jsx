import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { painelDoInicio } from '@/data/painel'
import { deslocarMes, mesAtual } from '@/lib/mes'
import { renderizarTela } from '@/test/renderizar'
import Inicio from './Inicio'

vi.mock('@/data/painel', () => ({ painelDoInicio: vi.fn() }))

const MES = mesAtual()
const meses = Array.from({ length: 6 }, (_, i) => ({ mes: `2026-0${i + 6}-01`, realizado: i * 10 }))
const base = {
  mes: MES, passado: false, horas_por_mes: meses, previsao_atual: 120, ranking: [], esperando: [],
  extremos: { acima: [], folga: [] }, meus_clientes: [],
  indicadores: { clientes_ativos: 12, clientes_novos: 3, aguardando: 4, a_distribuir: 3, sem_consultor: 1, capacidade: 200, reservado: 120, realizado: 80, ocupacao: 0.6 },
}
const CENTRAL = {
  ...base, recorte: 'tudo',
  ranking: [{ id: 'k1', nome: 'Consultoria Exemplo', ocupacao: 1.2, capacidade: 100 }],
  esperando: [{ id: 'c1', nome: 'Cliente Novo', desde: '2026-11-01T12:00:00Z', situacao: 'a_distribuir', consultoria_nome: null }],
  extremos: { acima: [{ id: 'p1', nome: 'Ana Acima', ocupacao: 1.3, capacidade: 100, consultoria_nome: 'Consultoria Exemplo' }], folga: [] },
}
const ADMIN = {
  ...base, recorte: 'consultoria', indicadores: { ...base.indicadores, a_distribuir: 0, aguardando: 1, sem_consultor: 1 },
  ranking: [{ id: 'p2', nome: 'Beto Consultor', ocupacao: 0.5, capacidade: 80 }],
  esperando: [{ id: 'c2', nome: 'Cliente Sem Consultor', desde: '2026-11-02T12:00:00Z', situacao: 'sem_consultor', consultoria_nome: 'Consultoria Exemplo' }],
}
const PESSOA = {
  ...base, recorte: 'pessoa', meus_clientes: [{ id: 'c3', nome: 'Cliente Meu', previsto: 10, realizado: 4 }],
  indicadores: { ...base.indicadores, aguardando: 0, a_distribuir: 0, sem_consultor: 0 },
}
const perfil = (papel) => ({ id: 'u1', nome: 'Ana Lima', papel, consultoria: papel === 'central' ? null : { nome: 'Consultoria Exemplo' } })

beforeEach(() => vi.clearAllMocks())

describe('Início (painel)', () => {
  it('central: ranking de consultorias, fila a distribuir e extremos', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Ocupação por consultoria' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/consultorias')
    expect(screen.getByText(/3 a distribuir/)).toBeInTheDocument()
    const fila = screen.getByRole('table', { name: 'Clientes esperando' })
    expect(within(fila).getByRole('link', { name: 'Cliente Novo' })).toHaveAttribute('href', '/clientes/c1')
    expect(screen.getByText('A distribuir', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ana Acima/ })).toHaveAttribute('href', '/usuarios')
    expect(screen.getByText('Ocupação', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Seus projetos vão aparecer aqui')).not.toBeInTheDocument()
  })

  it('administrador: ranking de consultores e sem "a distribuir"', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(ADMIN)
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('region', { name: 'Ocupação por consultor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/usuarios')
    expect(screen.queryByText(/a distribuir/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cliente Sem Consultor' })).toHaveAttribute('href', '/clientes/c2')
  })

  it('consultor: meus clientes e sem ranking', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(PESSOA)
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    const tabela = await screen.findByRole('table', { name: 'Meus clientes' })
    expect(within(tabela).getByRole('link', { name: 'Cliente Meu' })).toHaveAttribute('href', '/clientes/c3')
    expect(screen.queryByRole('region', { name: /Ocupação por/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Clientes esperando há mais tempo' })).not.toBeInTheDocument()
    expect(screen.getByText('Meus clientes', { selector: 'p' })).toBeInTheDocument()
  })

  it('vazio: frases curtas em vez dos blocos', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...ADMIN, esperando: [], ranking: [] })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByText('Nenhum cliente esperando. Tudo distribuído.')).toBeInTheDocument()
  })

  it('mês passado: Utilização e nada de reservado ou previsto', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue({ ...PESSOA, passado: true })
    renderizarTela(<Inicio />, { perfil: perfil('pessoa') })
    const tabela = await screen.findByRole('table', { name: 'Meus clientes' })
    expect(screen.getByText('Utilização', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/reservado/i)).not.toBeInTheDocument()
    expect(within(tabela).queryByText('Previsto')).not.toBeInTheDocument()
    expect(within(tabela).getByText('Realizado')).toBeInTheDocument()
  })

  it('trocar de mês chama o painel uma vez com o mês novo', async () => {
    vi.mocked(painelDoInicio).mockResolvedValue(CENTRAL)
    renderizarTela(<Inicio />, { perfil: perfil('central') })
    await screen.findByRole('region', { name: 'Horas por mês' })
    expect(painelDoInicio).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(painelDoInicio).toHaveBeenCalledTimes(2))
    expect(vi.mocked(painelDoInicio).mock.calls[1][0]).toBe(deslocarMes(MES, -1))
  })

  it('resposta velha não sobrescreve a do mês novo', async () => {
    let soltarVelha
    vi.mocked(painelDoInicio)
      .mockImplementationOnce(() => new Promise((r) => { soltarVelha = r }))
      .mockResolvedValueOnce({ ...ADMIN, mes: '2026-10-01', indicadores: { ...ADMIN.indicadores, clientes_ativos: 77 } })
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(await screen.findByText('77')).toBeInTheDocument()
    soltarVelha({ ...ADMIN, indicadores: { ...ADMIN.indicadores, clientes_ativos: 11 } })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('11')).not.toBeInTheDocument()
    expect(screen.getByText('77')).toBeInTheDocument()
  })

  it('erro: um aviso e a saudação continua', async () => {
    vi.mocked(painelDoInicio).mockRejectedValue(new Error('x'))
    renderizarTela(<Inicio />, { perfil: perfil('admin') })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o painel')
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
  })
})
