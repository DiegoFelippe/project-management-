import { useState } from 'react'
import { useLeitura } from '@/lib/useLeitura'

// A leitura de um bloco do Início (um gráfico): como o useLeitura (uma por chave, resposta velha descartada), mas ao
// trocar o período os dados de antes ficam na tela, com `atualizando` (o cartão fica a 60%), até chegarem os novos;
// sem pulo e sem esqueleto (design 2026-11-17-graficos-do-inicio-e-do-cliente). Devolve { dados }, { dados,
// atualizando: true }, { erro: true } ou { carregando }. `ler` precisa ser estável (uma função do módulo).
export function useLeituraDoBloco(ler, parametros) {
  const leitura = useLeitura(ler, parametros)
  const [anteriores, setAnteriores] = useState(null)
  // Guarda os últimos dados que chegaram (estado derivado: só muda quando chega uma resposta nova).
  if (leitura.dados !== undefined && leitura.dados !== anteriores) setAnteriores(leitura.dados)
  if (leitura.dados !== undefined) return { dados: leitura.dados }
  if (leitura.erro) return { erro: true }
  if (leitura.carregando && anteriores) return { dados: anteriores, atualizando: true }
  return { carregando: Boolean(leitura.carregando) }
}
