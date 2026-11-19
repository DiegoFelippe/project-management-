import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { useAtraso } from '@/lib/useAtraso'
import { cn } from '@/lib/utils'
import { useCampo } from './contextoDoCampo'
import Flutuante from './Flutuante'

const ALTURA_LISTA = 288
const BUSCA_LOCAL_A_PARTIR_DE = 8

function Marca({ opcao }) {
  return opcao.avatar ? <Avatar pessoa={opcao.avatar} className="size-6 ring-0" /> : null
}

// Lista de escolha do padrão Hub no lugar do <select>. `opcoes`: [{ valor, rotulo, detalhe?, avatar? }] (`avatar` é a
// pessoa { id, nome, foto }). Com `buscar` (async termo => ({ itens, total })) a lista vem do banco, nunca inteira:
// `opcoes` só precisa trazer a escolha atual, e o rodapé diz "N de TOTAL" quando há mais do que o mostrado.
// Sem `buscar`, a busca (a partir de 8 opções) filtra `opcoes` na tela. `rotuloTodos` acrescenta a opção vazia
// dos filtros. `tamanho`: "sm" nas barras de filtro, "md" nos formulários. No toque (pointer-coarse), o campo (.input) e cada opção
// têm 44 px de altura. `multiplo` (várias de uma vez: usabilidade, U7): `valor` é a lista dos escolhidos, cada clique (ou
// Enter) marca ou desmarca sem fechar a lista, `aoMudar(lista, opcao)` diz qual mudou, e o gatilho diz quantas há
// (`resumo(n)`); quem usa mostra as escolhidas fora do campo, com o nome.
export default function Seletor({
  id, valor, aoMudar, opcoes = [], buscar, rotuloTodos, tamanho = 'md', placeholder = 'Selecione', desabilitado = false,
  multiplo = false, resumo = (n) => (n === 1 ? '1 escolhida' : `${n} escolhidas`),
}) {
  const listaId = useId()
  const campo = useCampo(id) // dentro de um Campo com erro: marcado e descrito pelo erro (usabilidade, U2)
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [ativo, setAtivo] = useState(-1) // escolha de quem usa o teclado ou o mouse; -1 = ainda não escolheu
  const [remoto, setRemoto] = useState(null)
  const [escolhido, setEscolhido] = useState(null)
  const gatilho = useRef(null)
  const pedido = useRef(0)
  const procurado = useRef(null) // termo do último pedido desta abertura
  const termoAtrasado = useAtraso(termo, 250)
  const comBusca = !!buscar || opcoes.length > BUSCA_LOCAL_A_PARTIR_DE

  // Termo vazio busca na hora (ao abrir não pode sobrar o termo atrasado da vez anterior); com termo, espera a pessoa parar de digitar.
  useEffect(() => {
    if (!buscar || !aberto) return
    const quero = termo.trim()
    if ((quero !== '' && quero !== termoAtrasado.trim()) || quero === procurado.current) return
    procurado.current = quero
    const numero = ++pedido.current
    const chegou = (r) => { if (numero === pedido.current) { setRemoto({ ...r, termo: quero }); setAtivo(-1) } }
    buscar(quero).then(chegou).catch(() => chegou({ itens: [], total: 0, erro: true }))
  }, [buscar, aberto, termo, termoAtrasado])

  const todos = useMemo(() => (rotuloTodos != null ? { valor: '', rotulo: rotuloTodos } : null), [rotuloTodos])
  const mostradas = useMemo(() => {
    const fonte = buscar ? (remoto?.itens ?? []) : opcoes.filter((o) => {
      const q = termo.trim().toLowerCase()
      return !q || o.rotulo.toLowerCase().includes(q) || (o.detalhe ?? '').toLowerCase().includes(q)
    })
    return todos && !termo.trim() ? [todos, ...fonte] : fonte
  }, [buscar, remoto, opcoes, termo, todos])

  const atual = String(valor ?? '')
  const valores = multiplo ? (valor ?? []).map(String) : null
  const marcou = (o) => (multiplo ? valores.includes(String(o.valor)) : String(o.valor) === atual)
  // O resultado do banco só vale para o termo que está na caixa; enquanto não, a lista é do termo velho e Enter não escolhe.
  const fresco = !buscar || remoto?.termo === termo.trim()
  const padrao = termo.trim() ? (mostradas.length ? 0 : -1) : multiplo ? -1 : mostradas.findIndex((o) => String(o.valor) === atual)
  const ativoNaLista = ativo >= 0 && ativo < mostradas.length ? ativo : padrao
  const selecionada = multiplo ? undefined : opcoes.find((o) => String(o.valor) === atual) ?? remoto?.itens.find((o) => String(o.valor) === atual)
    ?? (escolhido && String(escolhido.valor) === atual ? escolhido : undefined) ?? (atual === '' ? todos : undefined)
  const textoDoGatilho = multiplo ? (valores.length ? resumo(valores.length) : null) : selecionada?.rotulo

  function abrir() {
    if (desabilitado) return
    setTermo('')
    setRemoto(null)
    procurado.current = null
    setAtivo(-1)
    setAberto(true)
  }

  function escolher(opcao) {
    if (multiplo) {
      const novos = marcou(opcao) ? valor.filter((v) => String(v) !== String(opcao.valor)) : [...valor, opcao.valor]
      return aoMudar(novos, opcao)
    }
    setEscolhido(opcao)
    aoMudar(opcao.valor, opcao)
    setAberto(false)
    gatilho.current?.focus()
  }

  function teclas(e) {
    const ultimo = mostradas.length - 1
    const novo = { ArrowDown: Math.min(ultimo, ativoNaLista + 1), ArrowUp: Math.max(0, ativoNaLista - 1), ...(comBusca ? {} : { Home: 0, End: ultimo }) }[e.key]
    if (novo !== undefined) { e.preventDefault(); setAtivo(novo) }
    else if (e.key === 'Enter') { e.preventDefault(); if (fresco && mostradas[ativoNaLista]) escolher(mostradas[ativoNaLista]) }
  }

  const total = remoto?.total ?? 0
  const tamanhoDoCampo = tamanho === 'sm' ? 'py-1.5 text-rotulo' : ''
  const idOpcao = (i) => `${listaId}-${i}`

  return (
    <>
      <button ref={gatilho} id={id} type="button" role="combobox" disabled={desabilitado} aria-haspopup="listbox" aria-expanded={aberto} aria-controls={aberto ? listaId : undefined}
        aria-invalid={campo.invalido || undefined} aria-describedby={campo.descritoPor}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); abrir() } }}
        className={cn('input texto-de-campo botao-animado flex cursor-pointer items-center gap-2 text-left', tamanhoDoCampo, !campo.invalido && (aberto || (selecionada && rotuloTodos != null && selecionada.valor !== '')) && 'border-primary/60', aberto && 'ring-primary/15 ring-2')}>
        {selecionada && <Marca opcao={selecionada} />}
        <span className={cn('min-w-0 flex-1 truncate', textoDoGatilho ? 'text-foreground font-medium' : 'text-muted-foreground')}>{textoDoGatilho ?? placeholder}</span>
        <ChevronDown className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </button>

      {aberto && (
        <Flutuante ancora={gatilho} aoFechar={() => setAberto(false)} largura={288} alargar altura={ALTURA_LISTA} role="presentation"
          className="max-h-72 p-1.5" onKeyDown={teclas}>
          {comBusca && (
            <div className="relative mb-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" aria-hidden="true" />
              <input autoFocus role="combobox" aria-expanded="true" aria-controls={listaId} aria-activedescendant={ativoNaLista >= 0 ? idOpcao(ativoNaLista) : undefined} aria-label="Buscar"
                value={termo} onChange={(e) => { setTermo(e.target.value); setAtivo(-1) }} placeholder="Buscar..." className="input py-1.5 pl-8 texto-de-campo" />
            </div>
          )}
          <div id={listaId} role="listbox" aria-multiselectable={multiplo || undefined} tabIndex={comBusca ? -1 : 0} ref={(el) => { if (el && !comBusca) el.focus() }} aria-activedescendant={!comBusca && ativoNaLista >= 0 ? idOpcao(ativoNaLista) : undefined} className="outline-none">
            {mostradas.map((o, i) => {
              const marcada = marcou(o)
              return (
                <div key={o.valor} id={idOpcao(i)} role="option" aria-selected={marcada} onClick={() => escolher(o)} onMouseMove={() => ativoNaLista !== i && setAtivo(i)}
                  ref={(el) => { if (el && i === ativoNaLista) el.scrollIntoView?.({ block: 'nearest' }) }}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 pointer-coarse:min-h-11', marcada && 'bg-primary/10', i === ativoNaLista && 'bg-accent')}>
                  <Marca opcao={o} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-rotulo', marcada ? 'text-primary-texto font-medium' : 'text-foreground')}>{o.rotulo}</span>
                    {o.detalhe && <span className="text-muted-foreground block truncate text-legenda">{o.detalhe}</span>}
                  </span>
                  {marcada && <Check className="text-primary-texto size-3.5 shrink-0" aria-hidden="true" />}
                </div>
              )
            })}
          </div>
          {buscar && !fresco && <p className="text-muted-foreground py-3 text-center text-rotulo">Buscando…</p>}
          {remoto?.erro && <p role="alert" className="text-muted-foreground py-3 text-center text-rotulo">Não foi possível carregar as opções.</p>}
          {!remoto?.erro && fresco && (buscar ? remoto : true) && mostradas.length === (todos && !termo.trim() ? 1 : 0) && <p className="text-muted-foreground py-3 text-center text-rotulo">Nada encontrado</p>}
          {buscar && fresco && remoto && !remoto.erro && (
            <p className="text-muted-foreground mt-1 border-t px-2.5 pt-1.5 text-mini">
              {total > remoto.itens.length ? `${remoto.itens.length} de ${total.toLocaleString('pt-BR')}. Refine a busca.` : `${total.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
            </p>
          )}
        </Flutuante>
      )}
    </>
  )
}
