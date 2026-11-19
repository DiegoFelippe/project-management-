import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import FilaDeClientes from './FilaDeClientes'

const ponto = (i, situacao = 'sem_consultor') => ({ id: `c${i}`, nome: `Cliente ${i}`, situacao, dias: 30 - i, consultoria_nome: 'Consultoria Exemplo' })
const FILA = {
  a_distribuir: { total: 7, media_dias: 4, maior_dias: 9 },
  sem_consultor: { total: 23, media_dias: 3.5, maior_dias: 30 },
  em_atendimento: { total: 120, novos_no_periodo: 12 },
  receberam_consultor: 8, espera_media_dias: 3.5,
  pontos: [...Array.from({ length: 18 }, (_, i) => ponto(i)), ponto(18, 'a_distribuir'), ponto(19, 'a_distribuir')],
  total_esperando: 30,
}
const GESTAO = { ...FILA, a_distribuir: null, pontos: FILA.pontos.filter((p) => p.situacao === 'sem_consultor'), total_esperando: 23 }
const MES = { tipo: 'mes', mes: '2026-11-01' }
const cartao = () => screen.getByRole('region', { name: 'Fila de clientes' })
const etapas = () => within(cartao()).getByRole('list', { name: 'Etapas da fila hoje' })

describe('FilaDeClientes', () => {
  it('3 etapas na central e 2 na gestão, com média, "ninguém esperando" e os novos no período', () => {
    const { unmount } = renderizarTela(<FilaDeClientes fila={FILA} recorte="tudo" periodo={MES} />, { perfil: {} })
    const grupos = within(etapas()).getAllByRole('group')
    expect(grupos.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Aguardando consultoria: 7 clientes, média de 4 dias, maior espera de 9 dias',
      'Aguardando consultor: 23 clientes, média de 3,5 dias, maior espera de 30 dias',
      'Em atendimento: 120 clientes',
    ])
    expect(within(grupos[1]).getByText('3,5 dias')).toBeInTheDocument()
    expect(within(grupos[2]).getByText('+12 novos no mês')).toBeInTheDocument()
    expect(within(cartao()).getByText(/Até ter consultor/).textContent).toBe('Até ter consultor: 3,5 dias em média no mês')
    unmount()

    renderizarTela(<FilaDeClientes fila={{ ...GESTAO, sem_consultor: { total: 0, media_dias: null, maior_dias: null }, pontos: [], total_esperando: 0 }}
      recorte="consultoria" periodo={MES} />, { perfil: {} })
    const daGestao = within(etapas()).getAllByRole('group')
    expect(daGestao).toHaveLength(2)
    expect(within(daGestao[0]).getByText('ninguém esperando')).toBeInTheDocument()
    expect(within(cartao()).queryByText('Aguardando consultoria')).toBeNull()
  })

  it('tabela com 15 e "Ver os 23 aguardando consultor" para /clientes?situacao=aguardando (na central, também o de situacao=distribuir)', async () => {
    renderizarTela(<FilaDeClientes fila={FILA} recorte="tudo" periodo={MES} />, { perfil: {} })
    expect(within(cartao()).getByRole('link', { name: 'Ver os 23 aguardando consultor' })).toHaveAttribute('href', '/clientes?situacao=aguardando')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Clientes esperando' })
    expect(tabela.querySelectorAll('tbody tr')).toHaveLength(15)
    expect(within(tabela).getByRole('link', { name: 'Cliente 0' })).toHaveAttribute('href', '/clientes/c0')
    expect(within(tabela).getByRole('cell', { name: 'há 30 dias' })).toHaveClass('tabular-nums')
    expect(within(cartao()).getByRole('link', { name: 'Ver os 23 aguardando consultor' })).toHaveAttribute('href', '/clientes?situacao=aguardando')
    expect(within(cartao()).getByRole('link', { name: 'Ver os 7 aguardando consultoria' })).toHaveAttribute('href', '/clientes?situacao=distribuir')
  })

  it('M6: no celular a situação e a espera ficam embaixo do nome e as outras colunas somem (sm: / max-sm:)', async () => {
    renderizarTela(<FilaDeClientes fila={GESTAO} recorte="consultoria" periodo={MES} />, { perfil: {} })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Clientes esperando' })
    const caixa = tabela.closest('.rounded-xl')
    expect(caixa.className).toContain('max-sm:[&_td+td]:hidden')
    expect(caixa.className).toContain('max-sm:[&_th+th]:hidden')
    expect(tabela.style.minWidth).toBe('0px')
    const noCelular = tabela.querySelector('tbody tr td [data-no-celular]')
    expect(noCelular).toHaveTextContent('Sem consultor · há 30 dias')
    expect(noCelular).toHaveClass('sm:hidden')
    expect(within(cartao()).queryByRole('link', { name: /aguardando consultoria/ })).toBeNull()
  })

  it('a faixa de pontos tem nome que resume; os pontos não são focáveis', () => {
    renderizarTela(<FilaDeClientes fila={FILA} recorte="tudo" periodo={MES} />, { perfil: {} })
    expect(within(cartao()).getByRole('img', { name: 'Aguardando consultor: 23 clientes, os 18 que esperam há mais tempo, de 13 dias a 30 dias' })).toBeInTheDocument()
    expect(within(cartao()).getByRole('img', { name: 'Aguardando consultoria: 7 clientes, os 2 que esperam há mais tempo, de 11 dias a 12 dias' })).toBeInTheDocument()
    const pontos = cartao().querySelectorAll('[data-ponto]')
    expect(pontos).toHaveLength(20)
    for (const p of pontos) expect(p).not.toHaveAttribute('tabindex')
  })

  it('carregando e erro', () => {
    const { rerender } = renderizarTela(<FilaDeClientes fila={null} recorte="tudo" periodo={MES} />, { perfil: {} })
    expect(within(cartao()).getByRole('status')).toBeInTheDocument()
    rerender(<FilaDeClientes fila={null} erro recorte="tudo" periodo={MES} aoTentarDeNovo={() => {}} />)
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar a fila de clientes.')
  })
})
