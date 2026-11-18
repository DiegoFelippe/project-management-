import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Star } from 'lucide-react'
import Flutuante from '@/components/campos/Flutuante'
import { Button } from '@/components/ui/button'
import { quadrosParaEscolher, quadrosPorIds } from '@/data/quadros'
import { veTudo } from '@/lib/papeis'
import { esquecerQuadro, lerMemoria } from '@/lib/quadrosRecentes'
import { useAtraso } from '@/lib/useAtraso'
import { cn } from '@/lib/utils'

const POR_GRUPO = 20
const ALTURA = 384

const semAcento = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const cartoes = (n) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'cartão' : 'cartões'}`

// O seletor de quadros do cabeçalho da tela Quadros (desenho: docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md,
// "Seletor de quadros"): o botão mostra o quadro aberto e abre uma lista flutuante com busca e os grupos Favoritos,
// Recentes, Meus e Dos times (este não aparece para a central e o dono). Só quadros abertos. A busca vai ao banco
// (quadros_para_escolher, sem acento) 300 ms depois de parar de digitar; cada grupo traz até 20 e o rodapé diz "20 de 230
// — busque pelo nome" quando há mais. Os Recentes são os ids guardados no navegador, conferidos no banco
// (quadros_por_ids): o que não voltou sai da memória; com busca, o grupo filtra os poucos que já tem. Teclado: setas
// andam por todos os itens, Enter escolhe, Esc fecha (e o foco volta ao botão). `aoEscolher(id)` abre o quadro.
export default function SeletorDeQuadro({ perfil, quadro, aoEscolher }) {
  const [aberto, setAberto] = useState(false)
  const gatilho = useRef(null)

  function escolher(id) {
    setAberto(false)
    gatilho.current?.focus()
    aoEscolher(id)
  }

  return (
    <>
      <Button ref={gatilho} type="button" variant="outline" aria-haspopup="listbox" aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); setAberto(true) } }}
        className="justify-between max-sm:w-[calc(100vw-8.5rem)] sm:w-64">
        <span className={cn('min-w-0 flex-1 truncate text-left', !quadro && 'text-muted-foreground')}>{quadro?.nome ?? 'Escolher quadro'}</span>
        <span className="sr-only">, trocar de quadro</span>
        <ChevronDown className={cn('text-muted-foreground transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </Button>
      {aberto && (
        <ListaDeQuadros perfil={perfil} quadroId={quadro?.id} ancora={gatilho} aoFechar={() => setAberto(false)} aoEscolher={escolher} />
      )}
    </>
  )
}

function ListaDeQuadros({ perfil, quadroId, ancora, aoFechar, aoEscolher }) {
  const base = useId()
  const listaId = `${base}-lista`
  const [termo, setTermo] = useState('')
  const procurado = useAtraso(termo.trim(), 300)
  const [resposta, setResposta] = useState(null) // { favoritos, meus, dosTimes } (cada { itens, total }) | { erro: true }
  // Sem nada guardado, os Recentes nem vão ao banco.
  const [recentes, setRecentes] = useState(() => (lerMemoria(perfil.id).recentes.length ? null : []))
  const [ativo, setAtivo] = useState(0)
  const pedido = useRef(0)
  const dosTimes = !veTudo(perfil)

  // Recentes: os ids guardados, conferidos no banco uma vez por abertura.
  useEffect(() => {
    let vale = true
    const { recentes: ids } = lerMemoria(perfil.id)
    if (!ids.length) return undefined
    quadrosPorIds(ids)
      .then((itens) => {
        if (!vale) return
        const voltaram = new Set(itens.map((q) => q.id))
        for (const id of ids) if (!voltaram.has(id)) esquecerQuadro(perfil.id, id)
        setRecentes(itens)
      })
      .catch(() => vale && setRecentes([]))
    return () => {
      vale = false
    }
  }, [perfil.id])

  // Os grupos do banco: na abertura (sem busca) e quando a pessoa para de digitar. Resposta velha é descartada.
  useEffect(() => {
    const numero = ++pedido.current
    quadrosParaEscolher({ termo: procurado, limite: POR_GRUPO })
      .then((r) => {
        if (numero !== pedido.current) return
        setResposta(r)
        setAtivo(0)
      })
      .catch(() => numero === pedido.current && setResposta({ erro: true }))
  }, [procurado])

  const grupos = useMemo(() => {
    if (!resposta || resposta.erro) return []
    const busca = semAcento(procurado)
    const recentesQueCasam = (recentes ?? []).filter((q) => !busca || semAcento(q.nome).includes(busca))
    return [
      { chave: 'favoritos', titulo: 'Favoritos', ...resposta.favoritos },
      { chave: 'recentes', titulo: 'Recentes', itens: recentesQueCasam, total: recentesQueCasam.length },
      { chave: 'meus', titulo: 'Meus', ...resposta.meus },
      ...(dosTimes ? [{ chave: 'dosTimes', titulo: 'Dos times', ...resposta.dosTimes }] : []),
    ].filter((g) => g.itens.length > 0)
  }, [resposta, recentes, procurado, dosTimes])

  const opcoes = grupos.flatMap((g) => g.itens.map((q) => ({ grupo: g.chave, quadro: q })))
  const idDaOpcao = (o) => `${base}-${o.grupo}-${o.quadro.id}`
  const atual = opcoes.length ? Math.min(ativo, opcoes.length - 1) : -1
  const fresco = resposta && procurado === termo.trim()

  function teclas(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!opcoes.length) return
      setAtivo(e.key === 'ArrowDown' ? Math.min(opcoes.length - 1, atual + 1) : Math.max(0, atual - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (fresco && opcoes[atual]) aoEscolher(opcoes[atual].quadro.id)
    }
  }

  let indice = -1
  return (
    <Flutuante ancora={ancora} aoFechar={aoFechar} largura={320} alargar altura={ALTURA} rotulo="Escolher quadro"
      className="max-h-96 p-1.5">
      <div className="relative mb-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" aria-hidden="true" />
        <input autoFocus role="combobox" aria-expanded="true" aria-controls={listaId} aria-autocomplete="list" aria-label="Buscar quadro"
          aria-activedescendant={atual >= 0 ? idDaOpcao(opcoes[atual]) : undefined}
          value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={teclas} placeholder="Buscar pelo nome..."
          className="input texto-de-campo py-1.5 pl-8" />
      </div>
      <div id={listaId} role="listbox" aria-label="Quadros" className="outline-none">
        {grupos.map((g) => (
          <div key={g.chave} role="group" aria-labelledby={`${base}-${g.chave}`} className="pb-1">
            <div id={`${base}-${g.chave}`} role="presentation" className="section-label px-2.5 pt-2 pb-1">{g.titulo}</div>
            {g.itens.map((q) => {
              indice += 1
              const i = indice
              const marcado = q.id === quadroId
              return (
                <div key={q.id} id={idDaOpcao({ grupo: g.chave, quadro: q })} role="option" aria-selected={marcado}
                  onClick={() => aoEscolher(q.id)} onMouseMove={() => atual !== i && setAtivo(i)}
                  ref={(el) => { if (el && i === atual) el.scrollIntoView?.({ block: 'nearest' }) }}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 pointer-coarse:min-h-11', marcado && 'bg-primary/10', i === atual && 'bg-accent')}>
                  <Star className={cn('size-3.5 shrink-0', q.favorito ? 'fill-current text-notice' : 'text-muted-foreground/50')} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-rotulo', marcado ? 'text-primary-texto font-medium' : 'text-foreground')}>{q.nome}</span>
                    {q.time && <span className="text-muted-foreground block truncate text-legenda">{q.time.nome}</span>}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-legenda tabular-nums">{cartoes(q.cartoes ?? 0)}</span>
                </div>
              )
            })}
            {g.total > g.itens.length && (
              <p className="text-muted-foreground px-2.5 pt-1 text-mini">
                {`${g.itens.length.toLocaleString('pt-BR')} de ${g.total.toLocaleString('pt-BR')} — busque pelo nome`}
              </p>
            )}
          </div>
        ))}
      </div>
      {!resposta && <p className="text-muted-foreground py-3 text-center text-rotulo">Carregando os quadros…</p>}
      {resposta?.erro && <p role="alert" className="text-muted-foreground py-3 text-center text-rotulo">Não foi possível carregar os quadros.</p>}
      {resposta && !resposta.erro && !grupos.length && (
        <p className="text-muted-foreground py-3 text-center text-rotulo">{procurado ? 'Nenhum quadro com esse nome.' : 'Você ainda não tem quadros.'}</p>
      )}
    </Flutuante>
  )
}
