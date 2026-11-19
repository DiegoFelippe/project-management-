import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import QuandoOsCheckins from './QuandoOsCheckins'

const MES = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
const HORAS = Array.from({ length: 14 }, (_, i) => i + 7)
// As 98 células (domingo = 0), como o banco manda; alguns check-ins.
const COM = { '2-10': 6, '1-9': 4, '1-14': 4, '0-20': 1, '6-7': 2 }
const celulas = (valores = COM) => [0, 1, 2, 3, 4, 5, 6].flatMap((d) => HORAS.map((h) => ({ dia_semana: d, hora: h, checkins: valores[`${d}-${h}`] ?? 0 })))
const ver = (props) => renderizarTela(<QuandoOsCheckins periodo={MES} {...props} />, { perfil: {} })
const cartao = () => screen.getByRole('region', { name: 'Quando os check-ins acontecem' })

describe('QuandoOsCheckins', () => {
  it('seg a dom × 7h a 20h, a força do número numa cor só; a janela no subtítulo e a leitura do pico', () => {
    ver({ dados: { de: '2026-11-01', ate: '2026-11-30', celulas: celulas() } })
    expect(within(cartao()).getByText('Dia da semana × hora de início, de 01/11 a 30/11')).toBeInTheDocument()
    const grafico = within(cartao()).getByRole('group', { name: 'Quando os check-ins acontecem' })
    expect([...grafico.querySelectorAll('[data-rotulo-y]')].map((t) => t.textContent)).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])
    expect(grafico.querySelectorAll('[data-celula]')).toHaveLength(98)
    // Linha 1 (ter), coluna 3 (10h): o pico, com a cor cheia.
    const pico = grafico.querySelector('[data-celula="1-3"]')
    expect(pico).toHaveAttribute('fill-opacity', '1')
    expect(pico.style.fill).toBe('var(--grafico-calor-lilas)')
    expect(grafico.querySelector('[data-celula="0-0"]')).toHaveClass('fill-muted')
    expect(within(cartao()).getByText(/Mais check-ins/).textContent).toBe('Mais check-ins na terça às 10h (6) · dia mais cheio: segunda (8)')
  })

  it('período mais longo que 8 semanas: o subtítulo diz que são as últimas 8', () => {
    ver({ periodo: { tipo: 'ano', de: '2026-01-01', ate: '2026-11-19' }, dados: { de: '2026-09-25', ate: '2026-11-19', celulas: celulas() } })
    expect(within(cartao()).getByText('Dia da semana × hora de início, de 25/09 a 19/11 (as últimas 8 semanas)')).toBeInTheDocument()
  })

  it('Ver em tabela: as células com check-in, do dia e da hora (7h conta o que começou antes; 20h, o que começou depois)', async () => {
    ver({ dados: { de: '2026-11-01', ate: '2026-11-30', celulas: celulas() } })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Check-ins por dia da semana e hora de início' })
    const linhas = [...tabela.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    expect(linhas).toEqual([
      ['segunda', '9h', '4'], ['segunda', '14h', '4'], ['terça', '10h', '6'], ['sábado', '7h ou antes', '2'], ['domingo', '20h ou depois', '1'],
    ])
  })

  it('sem check-ins: o vazio do cartão; erro com "Tentar de novo"', async () => {
    const { unmount } = ver({ dados: { de: '2026-11-01', ate: '2026-11-30', celulas: celulas({}) } })
    expect(within(cartao()).getByText('Nenhum check-in de 01/11 a 30/11.')).toBeInTheDocument()
    expect(within(cartao()).queryByRole('group')).toBeNull()
    unmount()
    const aoTentarDeNovo = vi.fn()
    ver({ dados: null, erro: true, aoTentarDeNovo })
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar os horários dos check-ins.')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
