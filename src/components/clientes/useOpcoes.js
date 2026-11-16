import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtraso } from '@/lib/useAtraso'

export const POR_PAGINA_DE_OPCOES = 8

// Opções de uma janela de escolha: busca que espera 300 ms e "Mostrar mais" (+8) sem perder o que já veio.
// carregar({ busca, limite, deslocamento }) devolve { itens, total }.
export function useOpcoes(carregar) {
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [estado, setEstado] = useState({ itens: null, total: 0, erro: null })
  const [carregandoMais, setCarregandoMais] = useState(false)
  const carregarRef = useRef(carregar)
  useEffect(() => {
    carregarRef.current = carregar
  })

  useEffect(() => {
    let ativo = true
    carregarRef.current({ busca: buscaAtrasada || undefined, limite: POR_PAGINA_DE_OPCOES, deslocamento: 0 })
      .then((r) => ativo && setEstado({ itens: r.itens, total: r.total, erro: null }))
      .catch(() => ativo && setEstado({ itens: [], total: 0, erro: 'Não foi possível carregar as opções.' }))
    return () => {
      ativo = false
    }
  }, [buscaAtrasada])

  const deslocamento = estado.itens?.length ?? 0
  const mostrarMais = useCallback(async () => {
    setCarregandoMais(true)
    try {
      const r = await carregarRef.current({
        busca: buscaAtrasada || undefined,
        limite: POR_PAGINA_DE_OPCOES,
        deslocamento,
      })
      setEstado((e) => ({ itens: [...(e.itens ?? []), ...r.itens], total: r.total, erro: null }))
    } catch {
      setEstado((e) => ({ ...e, erro: 'Não foi possível carregar mais opções.' }))
    } finally {
      setCarregandoMais(false)
    }
  }, [buscaAtrasada, deslocamento])

  return { busca, setBusca, ...estado, carregandoMais, mostrarMais }
}

// Ocupação antes e depois de somar as horas do cliente (null quando não há capacidade).
export function previaDeOcupacao(item, horas) {
  const capacidade = Number(item?.capacidade)
  if (!capacidade || Number.isNaN(capacidade)) return null
  const reservado = Number(item.reservado ?? 0)
  return { antes: reservado / capacidade, depois: (reservado + Number(horas ?? 0)) / capacidade }
}
