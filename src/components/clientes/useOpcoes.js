import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtraso } from '@/lib/useAtraso'

export const POR_PAGINA_DE_OPCOES = 8

// Opções de uma janela de escolha: busca que espera 300 ms e "Mostrar mais" (+8) sem perder o que já veio.
// carregar({ busca, limite, deslocamento }) devolve { itens, total }.
// Cada busca nova abre uma "geração": respostas de uma geração anterior (inicial ou de "mais") são descartadas.
export function useOpcoes(carregar) {
  const [busca, setBusca] = useState('')
  const buscaAtrasada = useAtraso(busca.trim(), 300)
  const [estado, setEstado] = useState({ itens: null, total: 0, erro: null })
  const [maisDe, setMaisDe] = useState(null) // { busca } do "Mostrar mais" em andamento
  const carregandoMais = maisDe?.busca === buscaAtrasada
  const carregarRef = useRef(carregar)
  const geracao = useRef(0)
  const itensAtuais = useRef(null)
  useEffect(() => {
    carregarRef.current = carregar
  })

  useEffect(() => {
    const minha = ++geracao.current
    itensAtuais.current = null
    carregarRef.current({ busca: buscaAtrasada || undefined, limite: POR_PAGINA_DE_OPCOES, deslocamento: 0 })
      .then((r) => {
        if (minha !== geracao.current) return
        itensAtuais.current = r.itens
        setEstado({ itens: r.itens, total: r.total, erro: null })
      })
      .catch(() => {
        if (minha !== geracao.current) return
        itensAtuais.current = []
        setEstado({ itens: [], total: 0, erro: 'Não foi possível carregar as opções.' })
      })
  }, [buscaAtrasada])

  const mostrarMais = useCallback(async () => {
    const minha = geracao.current
    const atuais = itensAtuais.current
    if (!atuais) return
    const marca = { busca: buscaAtrasada }
    setMaisDe(marca)
    try {
      const r = await carregarRef.current({
        busca: buscaAtrasada || undefined,
        limite: POR_PAGINA_DE_OPCOES,
        deslocamento: atuais.length,
      })
      if (minha !== geracao.current) return
      const vistos = new Set(itensAtuais.current.map((i) => i.id))
      itensAtuais.current = [...itensAtuais.current, ...r.itens.filter((i) => !vistos.has(i.id))]
      setEstado({ itens: itensAtuais.current, total: r.total, erro: null })
    } catch {
      if (minha === geracao.current) setEstado((e) => ({ ...e, erro: 'Não foi possível carregar mais opções.' }))
    } finally {
      setMaisDe((m) => (m === marca ? null : m))
    }
  }, [buscaAtrasada])

  return { busca, setBusca, ...estado, carregandoMais, mostrarMais }
}

// Ocupação antes e depois de somar as horas do cliente (null quando não há capacidade).
export function previaDeOcupacao(item, horas) {
  const capacidade = Number(item?.capacidade)
  if (!capacidade || Number.isNaN(capacidade)) return null
  const reservado = Number(item.reservado ?? 0)
  return { antes: reservado / capacidade, depois: (reservado + Number(horas ?? 0)) / capacidade }
}
