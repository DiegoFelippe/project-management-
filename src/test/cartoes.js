import { screen, within } from '@testing-library/react'
import { expect } from 'vitest'

// Padrão das telas do menu (CLAUDE.md, Padrão Hub): barra de filtros → cartões de números → conteúdo. Acha a região dos
// cartões pelo nome e confere que ela vem logo depois da barra (o cartão que começa com "Filtros").
export async function cartoesAbaixoDaBarra(nome) {
  const cartoes = await screen.findByRole('region', { name: nome })
  const barra = screen.getByText('Filtros').closest('.card')
  expect(barra.nextElementSibling).toBe(cartoes)
  return cartoes
}

// O número (como aparece na tela) do cartão que tem esse rótulo.
export function numeroDoCartao(regiao, rotulo) {
  return within(regiao).getByText(rotulo).closest('[data-cartao]').querySelector('[data-numero]').textContent
}
