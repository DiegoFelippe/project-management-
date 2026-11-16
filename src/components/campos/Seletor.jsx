import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { useAtraso } from '@/lib/useAtraso'
import { cn } from '@/lib/utils'
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
// dos filtros. `tamanho`: "sm" nas barras de filtro, "md" nos formulários.
export default function Seletor({ id, valor, aoMudar, opcoes = [], buscar, rotuloTodos, tamanho = 'md', placeholder = 'Selecione', desabilitado = false }) {
  const listaId = useId()
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [ativo, setAtivo] = useState(-1)
  const [remoto, setRemoto] = useState(null)
  const [escolhido, setEscolhido] = useState(null)
  const gatilho = useRef(null)
  const pedido = useRef(0)
  const termoAtrasado = useAtraso(termo, 250)
  const comBusca = !!buscar || opcoes.length > BUSCA_LOCAL_A_PARTIR_DE

  useEffect(() => {
    if (!buscar || !aberto) return
    const numero = ++pedido.current
    buscar(termoAtrasado.trim())
      .then((r) => { if (numero === pedido.current) setRemoto(r) })
      .catch(() => { if (numero === pedido.current) setRemoto({ itens: [], total: 0 }) })
  }, [buscar, aberto, termoAtrasado])

  const todos = useMemo(() => (rotuloTodos != null ? { valor: '', rotulo: rotuloTodos } : null), [rotuloTodos])
  const mostradas = useMemo(() => {
    const fonte = buscar ? (remoto?.itens ?? []) : opcoes.filter((o) => {
      const q = termo.trim().toLowerCase()
      return !q || o.rotulo.toLowerCase().includes(q) || (o.detalhe ?? '').toLowerCase().includes(q)
    })
    return todos && !termo.trim() ? [todos, ...fonte] : fonte
  }, [buscar, remoto, opcoes, termo, todos])

  const atual = String(valor ?? '')
  const selecionada = opcoes.find((o) => String(o.valor) === atual) ?? remoto?.itens.find((o) => String(o.valor) === atual)
    ?? (escolhido && String(escolhido.valor) === atual ? escolhido : undefined) ?? (atual === '' ? todos : undefined)

  function abrir() {
    if (desabilitado) return
    setTermo('')
    setRemoto(null)
    setAtivo(-1)
    setAberto(true)
  }

  function escolher(opcao) {
    setEscolhido(opcao)
    aoMudar(opcao.valor)
    setAberto(false)
    gatilho.current?.focus()
  }

  function teclas(e) {
    const ultimo = mostradas.length - 1
    const novo = { ArrowDown: Math.min(ultimo, ativo + 1), ArrowUp: Math.max(0, ativo - 1), ...(comBusca ? {} : { Home: 0, End: ultimo }) }[e.key]
    if (novo !== undefined) { e.preventDefault(); setAtivo(novo) }
    else if (e.key === 'Enter' && mostradas[ativo]) { e.preventDefault(); escolher(mostradas[ativo]) }
  }

  const total = remoto?.total ?? 0
  const campo = tamanho === 'sm' ? 'py-1.5 text-[12.5px]' : ''
  const idOpcao = (i) => `${listaId}-${i}`

  return (
    <>
      <button ref={gatilho} id={id} type="button" disabled={desabilitado} aria-haspopup="listbox" aria-expanded={aberto}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); abrir() } }}
        className={cn('input botao-animado flex cursor-pointer items-center gap-2 text-left', campo, (aberto || (selecionada && rotuloTodos != null && selecionada.valor !== '')) && 'border-primary/60', aberto && 'ring-primary/15 ring-2')}>
        {selecionada && <Marca opcao={selecionada} />}
        <span className={cn('min-w-0 flex-1 truncate', selecionada ? 'text-foreground font-medium' : 'text-muted-foreground')}>{selecionada ? selecionada.rotulo : placeholder}</span>
        <ChevronDown className={cn('text-muted-foreground size-3.5 shrink-0 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </button>

      {aberto && (
        <Flutuante ancora={gatilho} aoFechar={() => setAberto(false)} largura={288} alargar altura={ALTURA_LISTA} role="presentation"
          className="max-h-72 p-1.5" onKeyDown={teclas}>
          {comBusca && (
            <div className="relative mb-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" aria-hidden="true" />
              <input autoFocus role="combobox" aria-expanded="true" aria-controls={listaId} aria-activedescendant={ativo >= 0 ? idOpcao(ativo) : undefined} aria-label="Buscar"
                value={termo} onChange={(e) => { setTermo(e.target.value); setAtivo(-1) }} placeholder="Buscar..." className="input py-1.5 pl-8 text-[12.5px]" />
            </div>
          )}
          <div id={listaId} role="listbox" tabIndex={comBusca ? -1 : 0} ref={(el) => { if (el && !comBusca) el.focus() }} aria-activedescendant={!comBusca && ativo >= 0 ? idOpcao(ativo) : undefined} className="outline-none">
            {mostradas.map((o, i) => {
              const marcada = String(o.valor) === atual
              return (
                <div key={o.valor} id={idOpcao(i)} role="option" aria-selected={marcada} onClick={() => escolher(o)} onMouseMove={() => setAtivo(i)}
                  ref={(el) => { if (el && i === ativo) el.scrollIntoView?.({ block: 'nearest' }) }}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5', marcada && 'bg-primary/10', i === ativo && 'bg-accent')}>
                  <Marca opcao={o} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[12.5px]', marcada ? 'text-primary font-medium' : 'text-foreground')}>{o.rotulo}</span>
                    {o.detalhe && <span className="text-muted-foreground block truncate text-[11px]">{o.detalhe}</span>}
                  </span>
                  {marcada && <Check className="text-primary size-3.5 shrink-0" aria-hidden="true" />}
                </div>
              )
            })}
          </div>
          {buscar && !remoto && <p className="text-muted-foreground py-3 text-center text-[12px]">Buscando…</p>}
          {(buscar ? remoto : true) && mostradas.length === (todos && !termo.trim() ? 1 : 0) && <p className="text-muted-foreground py-3 text-center text-[12px]">Nada encontrado</p>}
          {buscar && remoto && (
            <p className="text-muted-foreground mt-1 border-t px-2.5 pt-1.5 text-[10.5px]">
              {total > remoto.itens.length ? `${remoto.itens.length} de ${total.toLocaleString('pt-BR')}. Refine a busca.` : `${total.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
            </p>
          )}
        </Flutuante>
      )}
    </>
  )
}
