import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarAgora, tentarDeNovo } from '@/data/agenda'
import { renderizarTela } from '@/test/renderizar'
import DetalheDoEvento from './DetalheDoEvento'

vi.mock('@/data/agenda', () => ({ buscarAgora: vi.fn(), tentarDeNovo: vi.fn() }))

// Reunião com Meet e cliente que já terminou (agora: 17/11, 12:00 em São Paulo).
const REUNIAO = {
  id: 'e1', consultoria_id: 's1', consultor_id: 'p1', cliente_id: 'k1', titulo: 'Kickoff Alfa',
  inicio: '2026-11-16T14:00:00-03:00', fim: '2026-11-16T15:00:00-03:00', dia_inteiro: false, com_meet: true, gravar: true,
  meet_link: 'https://meet.google.com/abc-defg-hij', meet_codigo: 'abc-defg-hij', reuniao: 'aguardando', reuniao_erro: null,
  gravacao_url: null, pasta_id: null, cliente: { id: 'k1', nome: 'Provedor Alfa' },
}
const gestora = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }

function detalhe(evento, { podeEditar = true } = {}) {
  const aoMudar = vi.fn()
  renderizarTela(<DetalheDoEvento evento={evento} podeEditar={podeEditar} aoMudar={aoMudar} />, { perfil: gestora })
  return aoMudar
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('DetalheDoEvento', () => {
  it('Entrar no Meet leva ao link da reunião', () => {
    detalhe({ ...REUNIAO, reuniao: 'agendada', inicio: '2026-11-20T14:00:00-03:00', fim: '2026-11-20T15:00:00-03:00' })
    expect(screen.getByRole('link', { name: 'Entrar no Meet' })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij')
    // A reunião ainda não aconteceu: nada de situação nem de buscar.
    expect(screen.queryByText('Aguardando a transcrição')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buscar agora' })).not.toBeInTheDocument()
  })

  it('aguardando: diz que espera a transcrição e Buscar agora pergunta ao Google', async () => {
    const user = userEvent.setup()
    vi.mocked(buscarAgora).mockResolvedValue({ erro: null, reuniao: { reuniao: 'pasta_criada', reuniao_erro: null, pasta_id: 'pa1', gravacao_url: 'https://drive.google.com/x' } })
    const aoMudar = detalhe({ ...REUNIAO, reuniao_erro: 'O Google não respondeu agora; tentamos de novo em seguida.' })
    expect(screen.getByText('Aguardando a transcrição')).toBeInTheDocument()
    expect(screen.getByText('O Google não respondeu agora; tentamos de novo em seguida.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Buscar agora' }))
    expect(buscarAgora).toHaveBeenCalledWith('e1')
    expect(await screen.findByText('Pasta criada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pasta da reunião' })).toHaveAttribute('href', '/clientes/k1?aba=arquivos&pasta=pa1')
    expect(screen.getByRole('link', { name: 'Abrir gravação' })).toHaveAttribute('href', 'https://drive.google.com/x')
    expect(aoMudar).toHaveBeenCalled()
  })

  it('agendada que já terminou também espera a transcrição', () => {
    detalhe({ ...REUNIAO, reuniao: 'agendada' })
    expect(screen.getByText('Aguardando a transcrição')).toBeInTheDocument()
  })

  it('erro: mostra o motivo e Tentar de novo', async () => {
    const user = userEvent.setup()
    vi.mocked(tentarDeNovo).mockResolvedValue({ erro: null, reuniao: { reuniao: 'aguardando', reuniao_erro: null, pasta_id: null, gravacao_url: null } })
    detalhe({ ...REUNIAO, reuniao: 'erro', reuniao_erro: 'Conecte o Google para buscar a gravação' })
    expect(screen.getByText('Erro')).toBeInTheDocument()
    expect(screen.getByText('Conecte o Google para buscar a gravação')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(tentarDeNovo).toHaveBeenCalledWith('e1')
    expect(await screen.findByText('Aguardando a transcrição')).toBeInTheDocument()
  })

  it('sem gravação/transcrição: Tentar de novo; a recusa da função aparece', async () => {
    const user = userEvent.setup()
    vi.mocked(tentarDeNovo).mockResolvedValue({ erro: 'A gravação desta reunião já está sendo buscada. Confira de novo em alguns minutos.' })
    detalhe({ ...REUNIAO, reuniao: 'sem_artefatos' })
    expect(screen.getByText('Sem gravação/transcrição')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('já está sendo buscada')
  })

  it('pasta criada leva à aba Arquivos do cliente, na pasta', () => {
    detalhe({ ...REUNIAO, reuniao: 'pasta_criada', pasta_id: 'pa1', gravacao_url: 'https://drive.google.com/x' })
    expect(screen.getByText('Pasta criada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pasta da reunião' })).toHaveAttribute('href', '/clientes/k1?aba=arquivos&pasta=pa1')
    expect(screen.queryByRole('button', { name: /Buscar agora|Tentar de novo/ })).not.toBeInTheDocument()
  })

  it('reunião sem cliente não tem situação (a rotina não a processa)', () => {
    detalhe({ ...REUNIAO, cliente_id: null, cliente: null, reuniao: 'agendada' })
    expect(screen.getByRole('link', { name: 'Entrar no Meet' })).toBeInTheDocument()
    expect(screen.queryByText(/Aguardando|Pasta criada|Sem gravação|Erro/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('quem não edita vê a situação, mas não busca', async () => {
    detalhe({ ...REUNIAO, reuniao: 'erro', reuniao_erro: 'Sem permissão no Google' }, { podeEditar: false })
    expect(screen.getByText('Sem permissão no Google')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await waitFor(() => expect(tentarDeNovo).not.toHaveBeenCalled())
  })
})
