import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  cartoesDoQuadro, indicadoresDoQuadro, moverCartao, moverColuna, quadroDoCliente, quadroPorId, quadrosDoCliente,
} from '@/data/quadro'
import { ouvirQuadro } from '@/data/quadroAoVivo'

// Filtros da barra do quadro. responsavel: '' | 'sem' | id (nomeDoResponsavel só para o seletor mostrar o nome).
export const FILTROS_VAZIOS = { busca: '', prioridade: '', responsavel: '', nomeDoResponsavel: null, prazo: '' }
export const temFiltro = (f) => Boolean(f.busca.trim() || f.prioridade || f.responsavel || f.prazo)
const doBanco = ({ busca, prioridade, responsavel, prazo }) => ({ busca: busca.trim(), prioridade, responsavel, prazo })

// O banco disse que a pessoa não vê mais (o quadro, a coluna ou o cartão sumiram para ela): reler o quadro.
const PERDEU = /sem_permissao|coluna_invalida/
const perdeuAcesso = (erro) => erro?.code === '42501' || PERDEU.test(erro?.message ?? '')

function juntar(a, b) {
  if (!a) return b
  return {
    eventos: [...(a.eventos ?? []), ...(b.eventos ?? [])],
    tudo: a.tudo || b.tudo,
    acesso: a.acesso || b.acesso,
    tabelas: [...new Set([...(a.tabelas ?? []), ...(b.tabelas ?? [])])],
    colunas: [...new Set([...(a.colunas ?? []), ...(b.colunas ?? [])])],
    cartoes: a.cartoes && b.cartoes ? [...new Set([...a.cartoes, ...b.cartoes])] : null,
  }
}

const inserir = (lista, indice, item) => [...lista.slice(0, indice), item, ...lista.slice(indice)]

// O quadro do cliente na tela: o quadro (colunas), uma página de cartões por coluna (mais com "ver mais"), os 4 números,
// o tempo real e o arrastar otimista. Quem vê o quê é do banco: a central lista os quadros do cliente (um por
// consultoria que o atendeu) e abre o escolhido (`escolher(id)`; sem escolha, o atual) só para ler; os outros recebem o
// quadro da consultoria que atende. `filtros` já vem com a busca atrasada (a pessoa parou de digitar).
//
// Tempo real (src/data/quadroAoVivo.js): avisos juntos a cada 300 ms. "tudo" (conectou, reconectou, plano B, acesso)
// relê o quadro todo; aviso de colunas relê o quadro (nomes, cores, ordem) e as colunas novas; aviso de cartões relê só
// as colunas citadas. Enquanto um cartão está levantado ou indo para o banco, os avisos esperam (a releitura no meio do
// arrasto bagunçaria a ordem da tela) e são aplicados juntos depois. Leitura velha de uma coluna (pedida antes de outra)
// é descartada. Se a releitura disser que a pessoa não vê mais o quadro, para de ouvir e `semAcesso` fica ligado.
export function useQuadro({ clienteId, central, filtros }) {
  const [quadros, setQuadros] = useState(null)
  const [escolhido, setEscolhido] = useState(null)
  const [quadro, setQuadro] = useState(undefined) // undefined = carregando; null = sem quadro
  const [erro, setErro] = useState(null)
  const [semAcesso, setSemAcesso] = useState(false)
  const [colunas, setColunas] = useState({}) // colunaId → { itens, total, carregandoMais, erro }
  const [indicadores, setIndicadores] = useState(null)

  const quadroRef = useRef(undefined)
  const colunasRef = useRef({})
  const filtrosRef = useRef(doBanco(filtros))
  const escolhidoRef = useRef(escolhido)
  const paginas = useRef({}) // colunaId → páginas carregadas
  const pedidos = useRef({}) // colunaId → número do último pedido
  const pedidoDoQuadro = useRef(0)
  const pedidoDosNumeros = useRef(0)
  const teveQuadro = useRef(false)
  const parar = useRef(null)
  const ocupado = useRef(0)
  const pendente = useRef(null)

  const mudarQuadro = useCallback((q) => {
    quadroRef.current = q
    setQuadro(q)
  }, [])

  const mudarColunas = useCallback((mudar) => {
    colunasRef.current = mudar(colunasRef.current)
    setColunas(colunasRef.current)
  }, [])

  const mudarColuna = useCallback((colunaId, campos) => {
    mudarColunas((c) => ({ ...c, [colunaId]: { ...c[colunaId], ...campos } }))
  }, [mudarColunas])

  const lerQuadro = useCallback(async () => {
    const numero = ++pedidoDoQuadro.current
    const atual = () => numero === pedidoDoQuadro.current
    try {
      let q
      if (central) {
        const lista = await quadrosDoCliente(clienteId)
        if (!atual()) return undefined
        setQuadros(lista)
        const quero = lista.find((x) => x.id === escolhidoRef.current) ?? lista.find((x) => x.atual) ?? lista[0]
        q = quero ? await quadroPorId(quero.id) : null
      } else {
        q = await quadroDoCliente(clienteId)
      }
      if (!atual()) return undefined
      setErro(null)
      if (!q && teveQuadro.current) {
        setSemAcesso(true)
        parar.current?.()
      }
      if (q) teveQuadro.current = true
      mudarQuadro(q ?? null)
      return q ?? null
    } catch {
      // Na abertura, o erro aparece no lugar do quadro; numa releitura, o quadro que está na tela fica (a próxima
      // releitura, ou o plano B, tenta de novo).
      if (atual() && quadroRef.current === undefined) setErro('Não foi possível carregar o quadro.')
      return undefined
    }
  }, [central, clienteId, mudarQuadro])

  const lerNumeros = useCallback(async (quadroId) => {
    const numero = ++pedidoDosNumeros.current
    try {
      const r = await indicadoresDoQuadro({ quadroId, ...filtrosRef.current })
      if (numero === pedidoDosNumeros.current) setIndicadores(r)
    } catch {
      // Os números ficam como estavam; a próxima releitura tenta de novo.
    }
  }, [])

  // Relê a coluna com as páginas que já estavam abertas ("ver mais").
  const lerColuna = useCallback(async (quadroId, colunaId) => {
    const numero = (pedidos.current[colunaId] ?? 0) + 1
    pedidos.current[colunaId] = numero
    const quantas = paginas.current[colunaId] ?? 1
    try {
      const respostas = await Promise.all(Array.from({ length: quantas }, (_, i) =>
        cartoesDoQuadro({ quadroId, colunaId, pagina: i + 1, ...filtrosRef.current })))
      if (pedidos.current[colunaId] !== numero) return
      const vistos = new Set()
      const itens = respostas.flatMap((r) => r.itens).filter((c) => !vistos.has(c.id) && vistos.add(c.id))
      paginas.current[colunaId] = quantas
      mudarColuna(colunaId, { itens, total: respostas[0].total, erro: null })
    } catch (falha) {
      if (pedidos.current[colunaId] !== numero) return
      mudarColuna(colunaId, { erro: 'Não foi possível carregar os cartões.' })
      if (perdeuAcesso(falha)) lerQuadro()
    }
  }, [lerQuadro, mudarColuna])

  const lerTudo = useCallback(async () => {
    const q = await lerQuadro()
    if (!q) return
    await Promise.all([...q.colunas.map((c) => lerColuna(q.id, c.id)), lerNumeros(q.id)])
  }, [lerColuna, lerNumeros, lerQuadro])

  // Relê o quadro (colunas) e carrega as colunas que ainda não estavam na tela.
  const relerQuadro = useCallback(async (colunasParaReler = []) => {
    const q = await lerQuadro()
    if (!q) return
    for (const c of q.colunas) {
      if (colunasParaReler.includes(c.id) || !(c.id in colunasRef.current)) lerColuna(q.id, c.id)
    }
  }, [lerColuna, lerQuadro])

  const verMais = useCallback(async (colunaId) => {
    const q = quadroRef.current
    if (!q) return
    const numero = (pedidos.current[colunaId] ?? 0) + 1
    pedidos.current[colunaId] = numero
    const proxima = (paginas.current[colunaId] ?? 1) + 1
    mudarColuna(colunaId, { carregandoMais: true })
    try {
      const r = await cartoesDoQuadro({ quadroId: q.id, colunaId, pagina: proxima, ...filtrosRef.current })
      if (pedidos.current[colunaId] !== numero) return
      paginas.current[colunaId] = proxima
      const antes = colunasRef.current[colunaId]?.itens ?? []
      const vistos = new Set(antes.map((c) => c.id))
      mudarColuna(colunaId, { itens: [...antes, ...r.itens.filter((c) => !vistos.has(c.id))], total: r.total, carregandoMais: false })
    } catch {
      if (pedidos.current[colunaId] === numero) mudarColuna(colunaId, { carregandoMais: false })
      toast.error('Não foi possível carregar mais cartões.')
    }
  }, [mudarColuna])

  // ── Tempo real ──

  const aplicar = useCallback((resumo) => {
    const q = quadroRef.current
    if (!q) return
    if (resumo.tudo) {
      lerTudo()
      return
    }
    const tabelas = resumo.tabelas ?? []
    if (tabelas.includes('quadro_colunas')) {
      // Os ids de colunas de cada aviso de cartões (os de colunas só mudam o quadro).
      const deCartoes = (resumo.eventos ?? []).filter((e) => e?.tabela && e.tabela !== 'quadro_colunas').flatMap((e) => e.colunas ?? [])
      relerQuadro(deCartoes)
    } else {
      for (const c of q.colunas) if (resumo.colunas?.includes(c.id)) lerColuna(q.id, c.id)
    }
    lerNumeros(q.id)
  }, [lerColuna, lerNumeros, lerTudo, relerQuadro])

  const receber = useRef(null)
  useEffect(() => {
    receber.current = (resumo) => {
      if (ocupado.current > 0) pendente.current = juntar(pendente.current, resumo)
      else aplicar(resumo)
    }
  }, [aplicar])

  const quadroId = quadro?.id
  useEffect(() => {
    if (!quadroId) return undefined
    const pararDeOuvir = ouvirQuadro(quadroId, (resumo) => receber.current(resumo), { juntarMs: 300 })
    parar.current = pararDeOuvir
    return () => {
      pararDeOuvir()
      if (parar.current === pararDeOuvir) parar.current = null
    }
  }, [quadroId])

  // ── Abrir e filtrar ──

  useEffect(() => {
    escolhidoRef.current = escolhido
    // Lê na volta seguinte, fora da montagem (o StrictMode monta duas vezes e só a segunda lê).
    const espera = setTimeout(lerTudo, 0)
    return () => clearTimeout(espera)
  }, [lerTudo, escolhido])

  // A central troca de quadro (o de outra consultoria que atendeu o cliente): começa do zero.
  const escolher = useCallback((id) => {
    pedidos.current = {}
    paginas.current = {}
    teveQuadro.current = false
    pendente.current = null
    colunasRef.current = {}
    setColunas({})
    setIndicadores(null)
    setSemAcesso(false)
    mudarQuadro(undefined)
    setEscolhido(id)
  }, [mudarQuadro])

  const chaveDosFiltros = JSON.stringify(doBanco(filtros))
  useEffect(() => {
    filtrosRef.current = JSON.parse(chaveDosFiltros)
    const q = quadroRef.current
    if (!q) return
    // Filtro novo volta para a primeira página de cada coluna.
    paginas.current = {}
    for (const c of q.colunas) lerColuna(q.id, c.id)
    lerNumeros(q.id)
  }, [chaveDosFiltros, lerColuna, lerNumeros])

  // ── Arrastar ──

  const comecarArrasto = useCallback(() => {
    ocupado.current += 1
  }, [])

  const liberar = useCallback(() => {
    ocupado.current = Math.max(0, ocupado.current - 1)
    if (ocupado.current === 0 && pendente.current) {
      const resumo = pendente.current
      pendente.current = null
      aplicar(resumo)
    }
  }, [aplicar])

  const desfazer = useCallback((mensagem) => {
    toast.error(mensagem)
    lerTudo()
  }, [lerTudo])

  const soltarCartao = useCallback(async ({ draggableId, source, destination }) => {
    const q = quadroRef.current
    const de = source.droppableId
    const para = destination.droppableId
    const origem = colunasRef.current[de]?.itens ?? []
    const cartao = origem.find((c) => c.id === draggableId)
    if (!q || !cartao) return
    const semEle = origem.filter((c) => c.id !== cartao.id)
    const destino = de === para ? semEle : (colunasRef.current[para]?.itens ?? [])
    const antesId = destino[destination.index - 1]?.id ?? null
    const depoisId = destino[destination.index]?.id ?? null
    const fotografia = { [de]: colunasRef.current[de], [para]: colunasRef.current[para] }
    // Leitura dessas colunas pedida antes do arrasto chegaria com a ordem velha: descarta.
    for (const id of [de, para]) pedidos.current[id] = (pedidos.current[id] ?? 0) + 1
    const movido = { ...cartao, coluna_id: para }
    mudarColunas((c) => (de === para
      ? { ...c, [de]: { ...c[de], itens: inserir(semEle, destination.index, movido) } }
      : {
          ...c,
          [de]: { ...c[de], itens: semEle, total: Math.max(0, (c[de]?.total ?? 1) - 1) },
          [para]: { ...c[para], itens: inserir(destino, destination.index, movido), total: (c[para]?.total ?? 0) + 1 },
        }))
    const resposta = await moverCartao({ cartaoId: cartao.id, colunaId: para, antesId, depoisId })
    if (resposta.erro) {
      mudarColunas((c) => ({ ...c, ...fotografia }))
      desfazer(resposta.erro)
    } else if (resposta.renumerou) {
      lerColuna(q.id, para)
    }
  }, [desfazer, lerColuna, mudarColunas])

  const soltarColuna = useCallback(async ({ draggableId, destination }) => {
    const q = quadroRef.current
    const coluna = q?.colunas.find((c) => c.id === draggableId)
    if (!coluna) return
    const semEla = q.colunas.filter((c) => c.id !== coluna.id)
    const antesId = semEla[destination.index - 1]?.id ?? null
    const depoisId = semEla[destination.index]?.id ?? null
    mudarQuadro({ ...q, colunas: inserir(semEla, destination.index, coluna) })
    const resposta = await moverColuna({ colunaId: coluna.id, antesId, depoisId })
    if (resposta.erro) {
      mudarQuadro(q)
      desfazer(resposta.erro)
    }
  }, [desfazer, mudarQuadro])

  const soltar = useCallback(async (resultado) => {
    try {
      const { source, destination, type } = resultado
      if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return
      if (type === 'coluna') await soltarColuna(resultado)
      else await soltarCartao(resultado)
    } finally {
      liberar()
    }
  }, [liberar, soltarCartao, soltarColuna])

  return {
    quadros, quadro, erro, semAcesso, colunas, indicadores,
    escolher, lerTudo, relerQuadro, lerColuna, lerNumeros, verMais, mudarQuadro, comecarArrasto, soltar,
  }
}
