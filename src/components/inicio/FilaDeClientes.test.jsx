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

describe('FilaDeClientes', () => {
  it('uma faixa só com as etapas de hoje (central: 3; gestão: 2), o número de cada uma na legenda e a leitura do período', () => {
    const { unmount } = renderizarTela(<FilaDeClientes fila={FILA} recorte="tudo" periodo={MES} />, { perfil: {} })
    const faixa = within(cartao()).getByRole('group', { name: 'Etapas da fila hoje' })
    const partes = within(faixa).getAllByRole('img')
    expect(partes.map((p) => p.getAttribute('aria-label'))).toEqual(['Aguardando consultoria: 7 (5%)', 'Aguardando consultor: 23 (15%)', 'Em atendimento: 120 (80%)'])
    expect(partes.map((p) => p.style.background)).toEqual(['var(--cor-grafite-forte)', 'var(--cor-mostarda-forte)', 'var(--cor-azul-forte)'])
    const legenda = within(cartao()).getByRole('list', { name: 'Legenda' })
    expect(within(legenda).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Aguardando consultoria7', 'Aguardando consultor23', 'Em atendimento120'])
    expect(within(cartao()).getByText(/Até ter consultor/).textContent).toBe('Até ter consultor: 3,5 dias em média no mês')
    // Os pontos de quem espera ficam na cor da etapa.
    expect(within(cartao()).getByRole('img', { name: /^Aguardando consultor: 23 clientes/ }).querySelector('[data-ponto]').style.background).toBe('var(--cor-mostarda-forte)')
    expect(within(cartao()).getByRole('img', { name: /^Aguardando consultoria: 7 clientes/ }).querySelector('[data-ponto]').style.background).toBe('var(--cor-grafite-forte)')
    unmount()

    renderizarTela(<FilaDeClientes fila={{ ...GESTAO, sem_consultor: { total: 0, media_dias: null, maior_dias: null }, pontos: [], total_esperando: 0 }}
      recorte="consultoria" periodo={MES} />, { perfil: {} })
    expect(within(within(cartao()).getByRole('group', { name: 'Etapas da fila hoje' })).getAllByRole('img')).toHaveLength(1)
    const daGestao = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(daGestao).toEqual(['Aguardando consultor0', 'Em atendimento120'])
    expect(within(cartao()).queryByText('Aguardando consultoria')).toBeNull()
  })

  it('ninguém na fila: o vazio do cartão (a faixa não desenha nada)', () => {
    const zero = { total: 0, media_dias: null, maior_dias: null }
    renderizarTela(<FilaDeClientes fila={{ ...FILA, a_distribuir: zero, sem_consultor: zero, em_atendimento: { total: 0, novos_no_periodo: 0 }, pontos: [], total_esperando: 0, receberam_consultor: 0 }}
      recorte="tudo" periodo={MES} />, { perfil: {} })
    expect(within(cartao()).getByText('Nenhum cliente na fila hoje.')).toBeInTheDocument()
    expect(within(cartao()).queryByRole('group')).toBeNull()
  })

  it('tabela com 15 e "Ver os 23 aguardando consultor" para /clientes?situacao=aguardando (na central, também o de situacao=distribuir)', async () => {
    renderizarTela(<FilaDeClientes fila={FILA} recorte="tudo" periodo={MES} />, { perfil: {} })
    expect(within(cartao()).getByRole('link', { name: 'Ver os 23 aguardando consultor' })).toHaveAttribute('href', '/clientes?situacao=aguardando')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const etapasNaTabela = within(cartao()).getByRole('table', { name: 'Etapas da fila hoje' })
    expect([...etapasNaTabela.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))).toEqual([
      ['Aguardando consultoria', '7', '4 dias', '9 dias'], ['Aguardando consultor', '23', '3,5 dias', '30 dias'], ['Em atendimento', '120', '—', '—'],
    ])
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
