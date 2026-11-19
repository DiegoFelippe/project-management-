import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import Caixa from '@/components/campos/Caixa'
import Flutuante from '@/components/campos/Flutuante'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LIMITES } from './modelo'

const BUSCA_A_PARTIR_DE = 8
const nome = (titulo) => titulo?.trim() || 'Sem título'
const simples = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// "Depende de" de uma tarefa no editor: os chips (com o X para tirar) e "Adicionar", que abre só as tarefas que vêm
// ANTES dela na lista, agrupadas por etapa (assim nunca há ciclo). `chips`: [{ id, ordem, titulo, invalida }] (invalida
// = a dependência agora vem depois, ao mover uma tarefa); `anteriores()`: [{ etapa: { id, nome, numero }, tarefas: [{ id,
// ordem, titulo }] }], lido só ao abrir; `marcadas`: os ids de que ela depende; `aoAlternar(id)` e `aoTirar(id)`.
export default function EscolherDependencias({ id, titulo, chips, marcadas, anteriores, aoAlternar, aoTirar }) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const botao = useRef(null)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-legenda">Depende de</span>
      {chips.map((c) => (
        <span key={c.id} data-chip="" data-invalida={c.invalida || undefined}
          title={c.invalida ? 'Esta tarefa vem depois: mova uma das duas ou tire a dependência.' : undefined}
          className={cn('inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2 text-legenda font-medium',
            c.invalida ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'bg-muted text-foreground/80')}>
          <span className="min-w-0 truncate">{c.ordem} · {nome(c.titulo)}</span>
          <button type="button" aria-label={`Tirar a dependência de "${nome(c.titulo)}"`} onClick={() => aoTirar(c.id)}
            className="botao-animado hover:bg-foreground/10 grid size-5 shrink-0 place-items-center rounded-full transition-[background-color,translate,scale] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button ref={botao} type="button" variant="ghost" size="sm" aria-haspopup="dialog" aria-expanded={aberto}
        onClick={() => { setTermo(''); setAberto((a) => !a) }}>
        <Plus /> Adicionar
      </Button>
      {aberto && (
        <Flutuante ancora={botao} aoFechar={() => setAberto(false)} largura={320} altura={360} rotulo="Depende de"
          className="max-h-[360px] p-2" aoAbrir={(lista) => lista.querySelector('input')?.focus()}>
          <Opcoes titulo={titulo} grupos={anteriores()} marcadas={marcadas} termo={termo} aoBuscar={setTermo} aoAlternar={aoAlternar} id={id} />
        </Flutuante>
      )}
    </div>
  )
}

function Opcoes({ id, titulo, grupos, marcadas, termo, aoBuscar, aoAlternar }) {
  const total = grupos.reduce((n, g) => n + g.tarefas.length, 0)
  if (!total) {
    return (
      <p className="text-muted-foreground p-2 text-rotulo">
        Esta é a primeira tarefa: não há nada antes dela. Só tarefas que vêm antes na lista podem ser dependências.
      </p>
    )
  }
  const marcadasAgora = new Set(marcadas)
  const cheia = marcadasAgora.size >= LIMITES.dependencias
  const procurado = simples(termo.trim())
  const filtrados = grupos
    .map((g) => ({ ...g, tarefas: procurado ? g.tarefas.filter((t) => simples(nome(t.titulo)).includes(procurado)) : g.tarefas }))
    .filter((g) => g.tarefas.length)
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground px-1 text-rotulo">"{nome(titulo)}" só pode ser marcada depois de:</p>
      {total > BUSCA_A_PARTIR_DE && (
        <Input type="search" aria-label="Buscar tarefa" placeholder="Buscar tarefa" value={termo} className="h-8"
          onChange={(e) => aoBuscar(e.target.value)} />
      )}
      {cheia && <p className="text-notice px-1 text-legenda">Até {LIMITES.dependencias} dependências por tarefa.</p>}
      {filtrados.map((g) => (
        <div key={g.etapa.id}>
          <p className="section-label px-1 pt-1">{g.etapa.numero} · {g.etapa.nome?.trim() || 'Etapa sem nome'}</p>
          {g.tarefas.map((t) => {
            const marcada = marcadasAgora.has(t.id)
            const rotulo = `${t.ordem} · ${nome(t.titulo)}`
            return (
              <Caixa key={t.id} id={`${id}-op-${t.id}`} nome={rotulo} marcado={marcada} desabilitado={cheia && !marcada}
                aoMudar={() => aoAlternar(t.id)} className="hover:bg-accent w-full rounded-lg px-2 py-1.5"
                rotulo={<span className="line-clamp-2 text-rotulo">{rotulo}</span>} />
            )
          })}
        </div>
      ))}
      {!filtrados.length && <p className="text-muted-foreground p-2 text-center text-rotulo">Nada encontrado</p>}
    </div>
  )
}
