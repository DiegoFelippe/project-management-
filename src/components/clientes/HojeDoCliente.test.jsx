import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HojeDoCliente from './HojeDoCliente'

// Quinta, 19/11/2026, ao meio-dia em São Paulo.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-19T12:00:00-03:00') }))
afterEach(() => vi.useRealTimers())

const ETAPAS = [
  { id: 'e1', nome: 'Diagnóstico', tarefas: 10, feitas: 8, nao_se_aplica: 0, atrasadas: 0 },
  { id: 'e2', nome: 'Financeiro', tarefas: 18, feitas: 4, nao_se_aplica: 0, atrasadas: 3 },
]
const HOJE = {
  arquivado_em: null,
  previsao: { horas_mes: 30, realizado: 18, dia: 19, dias_no_mes: 30, projecao: 34, ritmo: 'acima' },
  checkin: { ultimo: '2026-11-16', dias_sem: 3, situacao: 'em_dia', dias_com_checkin: ['2026-11-03', '2026-11-10', '2026-11-16'] },
  reuniao: { id: 'r1', inicio: '2026-11-21T17:00:00Z', titulo: 'Alinhamento mensal', com_meet: true },
  quadro: { id: 'q1', cartoes: 12, atrasados: 2, sem_responsavel: 3 },
  checklist: {
    modelo_nome: 'Gestão financeira', tarefas: 28, feitas: 12, nao_se_aplica: 0, atrasadas: 3,
    proxima: { titulo: 'Análise do DRE', vence_em: '2026-11-20' }, etapas: ETAPAS,
  },
}

const tela = (props = {}) => render(
  <MemoryRouter initialEntries={['/clientes/k1']}>
    <HojeDoCliente hoje={HOJE} {...props} />
  </MemoryRouter>,
)
const cartao = (nome) => within(screen.getByRole('group', { name: nome }))

describe('HojeDoCliente', () => {
  it('5 cartões com os números do banco, numa faixa que diz que é de hoje', () => {
    tela()
    const faixa = screen.getByRole('region', { name: 'Hoje' })
    expect(within(faixa).getAllByRole('group').map((g) => g.getAttribute('aria-label')))
      .toEqual(['Previsão do mês', 'Último check-in', 'Próxima reunião', 'Quadro', 'Check-list'])
    expect(cartao('Previsão do mês').getByText('60%')).toBeInTheDocument()
    expect(cartao('Previsão do mês').getByText('18 h de 30 h')).toBeInTheDocument()
    expect(cartao('Último check-in').getByText('há 3 d')).toBeInTheDocument()
    expect(cartao('Último check-in').getByText('16/11')).toBeInTheDocument()
    expect(cartao('Último check-in').getByRole('img', { name: 'Dias com check-in nos últimos 30 dias: 3' })).toBeInTheDocument()
    // No computador, "sáb, 21/11" no número grande; no celular o dia da semana vai para o lado da hora (classes sm:).
    const numero = screen.getByRole('group', { name: 'Próxima reunião' }).querySelector('.text-destaque')
    expect(numero).toHaveTextContent('sáb, 21/11')
    expect(numero.querySelector('span')).toHaveClass('max-sm:hidden')
    const hora = cartao('Próxima reunião').getByText('14:00')
    expect(hora).toHaveTextContent('sáb · 14:00')
    expect(hora.querySelector('span')).toHaveClass('sm:hidden')
    expect(cartao('Próxima reunião').getByText('Alinhamento mensal')).toBeInTheDocument()
    expect(cartao('Próxima reunião').getByText('Meet')).toBeInTheDocument()
    expect(cartao('Próxima reunião').getByText('em 2 dias')).toBeInTheDocument()
    expect(cartao('Quadro').getByText('2')).toHaveClass('text-destructive')
    expect(cartao('Quadro').getByText('atrasados de 12')).toBeInTheDocument()
    expect(cartao('Quadro').getByText('3 cartões sem responsável')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('43%')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('12 de 28 tarefas')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('3 atrasadas')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('próxima 20/11')).toBeInTheDocument()
  })

  it('cada cartão com o ícone num quadradinho de um tom da paleta (azul, turquesa, violeta, mostarda, verde)', () => {
    tela()
    const tons = { 'Previsão do mês': 'azul', 'Último check-in': 'turquesa', 'Próxima reunião': 'violeta', Quadro: 'mostarda', 'Check-list': 'verde' }
    for (const [nome, tom] of Object.entries(tons)) {
      const ladrilho = screen.getByRole('group', { name: nome }).querySelector('[data-ladrilho]')
      expect(ladrilho, nome).toHaveClass(`bg-cor-${tom}-suave`, `text-cor-${tom}-texto`)
      expect(ladrilho.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('as barras nas cores de estado de todo gráfico: feita em verde, não se aplica em grafite, atrasada no vermelho cheio', () => {
    tela({ hoje: { ...HOJE, checklist: { ...HOJE.checklist, nao_se_aplica: 2 } } })
    const partes = (nome) => [...screen.getByRole('group', { name: nome }).querySelectorAll('[data-parte]')]
      .map((p) => [p.dataset.parte, p.style.flexGrow, p.style.background])
    // 28 tarefas: 12 feitas, 2 não se aplicam, 3 atrasadas e 11 a fazer no prazo (atrasadas por último, como nas etapas).
    expect(partes('Check-list')).toEqual([
      ['feita', '12', 'var(--positive-cheio)'], ['nsa', '2', 'var(--cor-grafite-forte)'], ['afazer', '11', 'var(--cor-violeta-forte)'],
      ['atrasada', '3', 'var(--destructive-cheio)'],
    ])
    // No quadro, o que está no prazo não é "feito": fica no azul da série.
    expect(partes('Quadro')).toEqual([['atrasada', '2', 'var(--destructive-cheio)'], ['serie', '10', 'var(--grafico-serie)']])
  })

  it('a barra do check-list divide em andamento, pausadas e a fazer, como o gráfico por etapa', () => {
    const etapas = [{ ...ETAPAS[0], andamento: 2, pausadas: 1 }, { ...ETAPAS[1], andamento: 1, pausadas: 0 }]
    tela({ hoje: { ...HOJE, checklist: { ...HOJE.checklist, etapas } } })
    const partes = [...screen.getByRole('group', { name: 'Check-list' }).querySelectorAll('[data-parte]')].map((p) => [p.dataset.parte, p.style.flexGrow])
    // 28 tarefas: 12 feitas, 3 atrasadas, 13 restantes = 3 em andamento + 1 pausada + 9 a fazer.
    expect(partes).toEqual([['feita', '12'], ['andamento', '3'], ['pausada', '1'], ['afazer', '9'], ['atrasada', '3']])
  })

  it('selos vai passar / abaixo do ritmo / no ritmo / sem selo no começo do mês', () => {
    const com = (previsao) => ({ ...HOJE, previsao: { ...HOJE.previsao, ...previsao } })
    const { rerender } = tela()
    expect(cartao('Previsão do mês').getByText('vai passar: ≈ 34 h')).toBeInTheDocument()
    const de = (hoje) => <MemoryRouter><HojeDoCliente hoje={hoje} /></MemoryRouter>
    rerender(de(com({ projecao: 19, ritmo: 'abaixo' })))
    expect(cartao('Previsão do mês').getByText('abaixo do ritmo: ≈ 19 h')).toBeInTheDocument()
    rerender(de(com({ projecao: 29, ritmo: 'no_ritmo' })))
    expect(cartao('Previsão do mês').getByText('no ritmo')).toBeInTheDocument()
    rerender(de(com({ dia: 4, realizado: 2, projecao: null, ritmo: null })))
    expect(cartao('Previsão do mês').getByText('começo do mês')).toBeInTheDocument()
    expect(cartao('Previsão do mês').queryByText(/vai passar|abaixo do ritmo|no ritmo/)).toBeNull()
  })

  it('os selos quebram a linha dentro do cartão estreito (360 px), em vez de passar da borda', () => {
    tela()
    for (const texto of ['vai passar: ≈ 34 h', 'em dia', '3 atrasadas']) {
      expect(screen.getByText(texto, { selector: '[data-slot="badge"]' })).toHaveClass('max-w-full', 'whitespace-normal')
    }
  })

  it('passou da previsão: o número e o medidor ficam vermelhos', () => {
    tela({ hoje: { ...HOJE, previsao: { ...HOJE.previsao, realizado: 33 } } })
    expect(cartao('Previsão do mês').getByText('110%')).toHaveClass('text-destructive')
  })

  it('último check-in em dia / atenção / em risco', () => {
    const com = (checkin) => ({ ...HOJE, checkin: { ...HOJE.checkin, ...checkin } })
    const de = (hoje) => <MemoryRouter><HojeDoCliente hoje={hoje} /></MemoryRouter>
    const { rerender } = tela()
    expect(cartao('Último check-in').getByText('em dia')).toBeInTheDocument()
    rerender(de(com({ ultimo: '2026-11-01', dias_sem: 18, situacao: 'atencao' })))
    expect(cartao('Último check-in').getByText('atenção')).toBeInTheDocument()
    expect(cartao('Último check-in').getByText('há 18 d')).toBeInTheDocument()
    rerender(de(com({ ultimo: '2026-10-01', dias_sem: 49, situacao: 'em_risco', dias_com_checkin: [] })))
    expect(cartao('Último check-in').getByText('em risco')).toBeInTheDocument()
    expect(cartao('Último check-in').getByText('há 49 d')).toHaveClass('text-destructive')
    rerender(de(com({ ultimo: '2026-11-19', dias_sem: 0 })))
    expect(cartao('Último check-in').getByText('hoje', { selector: '.text-destaque' })).toBeInTheDocument()
  })

  it('sem consultor: previsão 0 h e último check-in "—", sem selo', () => {
    tela({
      hoje: {
        ...HOJE,
        previsao: { ...HOJE.previsao, realizado: 0, projecao: 0, ritmo: 'abaixo' },
        checkin: { ultimo: null, dias_sem: null, situacao: null, dias_com_checkin: [] },
      },
    })
    expect(cartao('Previsão do mês').getByText('0 h de 30 h')).toBeInTheDocument()
    expect(cartao('Último check-in').getByText('—')).toBeInTheDocument()
    expect(cartao('Último check-in').queryByText(/em dia|atenção|em risco/)).toBeNull()
  })

  it('sem reunião → "Marcar reunião" para ?aba=agenda', () => {
    tela({ hoje: { ...HOJE, reuniao: null } })
    expect(cartao('Próxima reunião').getByText('Nenhuma marcada')).toBeInTheDocument()
    expect(cartao('Próxima reunião').getByRole('link', { name: 'Marcar reunião' })).toHaveAttribute('href', '/clientes/k1?aba=agenda')
  })

  it('reunião hoje e amanhã', () => {
    const { rerender } = tela({ hoje: { ...HOJE, reuniao: { ...HOJE.reuniao, inicio: '2026-11-19T18:30:00Z', com_meet: false } } })
    expect(screen.getByRole('group', { name: 'Próxima reunião' }).querySelector('.text-destaque')).toHaveTextContent('qui, 19/11')
    expect(cartao('Próxima reunião').getByText('hoje')).toBeInTheDocument()
    expect(cartao('Próxima reunião').queryByText('Meet')).toBeNull()
    rerender(<MemoryRouter><HojeDoCliente hoje={{ ...HOJE, reuniao: { ...HOJE.reuniao, inicio: '2026-11-20T12:00:00Z' } }} /></MemoryRouter>)
    expect(cartao('Próxima reunião').getByText('amanhã')).toBeInTheDocument()
  })

  it('sem quadro e sem modelo', () => {
    const { unmount } = tela({ hoje: { ...HOJE, quadro: null, checklist: null }, podeAplicar: true })
    expect(cartao('Quadro').getByText('Nenhum cartão')).toBeInTheDocument()
    expect(cartao('Quadro').getByRole('link', { name: 'Abrir quadro' })).toHaveAttribute('href', '/clientes/k1?aba=quadro')
    expect(cartao('Check-list').getByText('Nenhum modelo aplicado')).toBeInTheDocument()
    expect(cartao('Check-list').getByRole('link', { name: 'Aplicar modelo' })).toHaveAttribute('href', '/clientes/k1?aba=checkins')
    unmount()
    // Quem não aplica modelo (consultor) não ganha o link; quadro sem nenhum cartão diz o mesmo que sem quadro.
    tela({ hoje: { ...HOJE, quadro: { id: 'q1', cartoes: 0, atrasados: 0, sem_responsavel: 0 }, checklist: null } })
    expect(cartao('Quadro').getByText('Nenhum cartão')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('Nenhum modelo aplicado')).toBeInTheDocument()
    expect(cartao('Check-list').queryByRole('link')).toBeNull()
  })

  it('check-list com tarefas que não se aplicam: conta as resolvidas e diz quantas não se aplicam', () => {
    tela({ hoje: { ...HOJE, checklist: { ...HOJE.checklist, nao_se_aplica: 2, atrasadas: 0 } } })
    expect(cartao('Check-list').getByText('50%')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('14 de 28 resolvidas')).toBeInTheDocument()
    expect(cartao('Check-list').getByText('nada atrasado')).toBeInTheDocument()
  })

  it('dica no foco de cada cartão; Esc fecha', async () => {
    const usuario = userEvent.setup()
    tela()
    const esperado = {
      'Previsão do mês': ['18 h de 30 h', 'realizado', '63%', 'do mês já passou', '≈ 34 h', 'no fim do mês'],
      'Último check-in': ['3 dias com check-in', 'nos últimos 30 dias', '16/11/2026', 'último'],
      'Próxima reunião': ['sáb, 21/11 · 14:00', 'Alinhamento mensal', 'Google Meet'],
      Quadro: ['2 atrasados', '10 no prazo', '3 sem responsável'],
      'Check-list': ['12 de 28 feitas', '3 atrasadas', '20/11', 'próxima tarefa'],
    }
    for (const [nome, textos] of Object.entries(esperado)) {
      const alvo = screen.getByRole('group', { name: nome })
      for (let i = 0; i < 10 && document.activeElement !== alvo; i++) await usuario.tab()
      expect(alvo).toHaveFocus()
      const dica = screen.getByRole('tooltip')
      for (const texto of textos) expect(dica, `${nome}: ${texto}`).toHaveTextContent(texto)
      // O leitor de tela ouve os mesmos números (a descrição do cartão).
      expect(screen.getByRole('group', { name: nome })).toHaveAccessibleDescription(new RegExp(textos[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('dica no mouse', () => {
    tela()
    act(() => fireEvent.pointerMove(screen.getByRole('group', { name: 'Quadro' }), { clientX: 10, clientY: 10 }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 atrasados')
  })

  it('arquivado: sem a faixa, com "Arquivado em 12/10/2026."', () => {
    tela({ hoje: { ...HOJE, arquivado_em: '2026-10-12T15:00:00Z' } })
    expect(screen.getByText('Arquivado em 12/10/2026.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Previsão do mês' })).toBeNull()
  })

  it('carregando e erro com "Tentar de novo"', async () => {
    const aoTentarDeNovo = vi.fn()
    const { rerender } = tela({ hoje: undefined })
    expect(screen.getByRole('region', { name: 'Hoje' })).toHaveTextContent('Carregando')
    rerender(<MemoryRouter><HojeDoCliente hoje={undefined} erro aoTentarDeNovo={aoTentarDeNovo} /></MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a situação de hoje.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
