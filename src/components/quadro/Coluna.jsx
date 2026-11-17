import { useRef, useState } from 'react'
import { Droppable } from '@hello-pangea/dnd'
import { Check, ChevronsDown, CircleCheck, Loader2, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import Chave from '@/components/campos/Chave'
import Flutuante from '@/components/campos/Flutuante'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CARTOES_POR_PAGINA } from '@/data/quadro'
import { cn } from '@/lib/utils'
import CartaoNoQuadro from './CartaoNoQuadro'
import { CORES_DAS_COLUNAS, corDaColuna, CORPO_NEUTRO } from './cores'

const BOTAO_PERIGO = 'hover:bg-destructive/10 hover:text-destructive'
const contar = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// Painel da cor: as 10 cores e "Automática" (radios; um clique grava na hora, para todos que veem o quadro) e a chave
// "Coluna de concluídos" (prazo não conta como atrasado), como no Mochi.
function PainelDaCor({ ancora, coluna, automatica, aoFechar, aoMudarCor, aoMudarConcluidos }) {
  const escolher = (cor) => {
    aoFechar()
    if ((cor ?? null) !== (coluna.cor ?? null)) aoMudarCor(cor)
  }
  return (
    <Flutuante ancora={ancora} aoFechar={aoFechar} largura={240} altura={250} rotulo="Cor da coluna" className="p-3">
      <p className="mb-2 text-rotulo font-semibold text-muted-foreground">Cor da coluna</p>
      <div role="radiogroup" aria-label="Cor da coluna">
        <div className="grid grid-cols-5 gap-2">
          {CORES_DAS_COLUNAS.map((cor, i) => (
            <button key={cor.nome} type="button" role="radio" aria-checked={coluna.cor === i} aria-label={cor.nome} title={cor.nome}
              onClick={() => escolher(i)}
              className={cn('botao-animado grid size-8 place-items-center rounded-full text-white outline-none transition-[translate,scale,box-shadow] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                cor.ponto, coluna.cor === i && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}>
              {coluna.cor === i && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button type="button" role="radio" aria-checked={coluna.cor == null} onClick={() => escolher(null)}
          className={cn('botao-animado mt-2.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-rotulo font-medium outline-none transition-[background-color,translate,scale] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
            coluna.cor == null ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent')}>
          <span className={cn('size-4 shrink-0 rounded-full opacity-60', CORES_DAS_COLUNAS[automatica].ponto)} aria-hidden="true" />
          Automática, pela posição
        </button>
      </div>
      <div className="mt-3 border-t pt-3">
        <Chave ligada={coluna.concluidos} aoMudar={aoMudarConcluidos} rotulo="Coluna de concluídos" className="text-rotulo font-semibold" />
        <p className="mt-1 text-legenda text-muted-foreground">Cartões aqui não aparecem como atrasados.</p>
      </div>
    </Flutuante>
  )
}

// Nome da coluna editado no lugar: Enter ou sair do campo grava; Esc desiste.
function NomeNoLugar({ nome, aoSalvar, aoTerminar }) {
  const [valor, setValor] = useState(nome)
  const desistiu = useRef(false)
  function terminar() {
    const limpo = valor.trim()
    if (!desistiu.current && limpo && limpo !== nome) aoSalvar(limpo)
    aoTerminar()
  }
  return (
    <Input autoFocus aria-label="Nome da coluna" maxLength={60} value={valor} className="h-8 font-semibold"
      onFocus={(e) => e.target.select()} onChange={(e) => setValor(e.target.value)} onBlur={terminar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          desistiu.current = true
          e.currentTarget.blur()
        }
      }} />
  )
}

// Uma coluna do quadro (300 px): cabeçalho com o contador na cor da coluna, o nome e as ações de quem mexe (renomear,
// cor e concluídos; apagar só a gestão); os cartões (lista onde se solta o arrasto); "ver mais" (50 por vez) e
// "Adicionar cartão". `alca`: as dragHandleProps da coluna (reordenar arrastando o cabeçalho); nula para quem só lê.
export default function Coluna({
  coluna, posicao, estado, hoje, podeMexer, podeApagar, arrastarCartoes, filtrando, alca,
  aoRenomear, aoMudarCor, aoMudarConcluidos, aoApagar, aoVerMais, aoNovoCartao, aoAbrirCartao,
}) {
  const [renomeando, setRenomeando] = useState(false)
  const [pintando, setPintando] = useState(false)
  const botaoCor = useRef(null)
  const cor = corDaColuna(coluna, posicao)
  const paleta = CORES_DAS_COLUNAS[cor]
  const escolhida = coluna.cor != null
  const itens = estado?.itens
  const total = estado?.total ?? coluna.cartoes ?? 0
  const faltam = Math.max(0, total - (itens?.length ?? 0))
  const proxima = Math.min(faltam, CARTOES_POR_PAGINA)

  return (
    <section aria-label={`Coluna ${coluna.nome}`}
      className={cn('flex w-[300px] shrink-0 flex-col gap-2.5 rounded-2xl border p-2.5', escolhida ? paleta.corpo : CORPO_NEUTRO)}>
      <div className="flex min-h-8 items-center justify-between gap-1 px-1 pt-0.5">
        {renomeando ? (
          <NomeNoLugar nome={coluna.nome} aoSalvar={aoRenomear} aoTerminar={() => setRenomeando(false)} />
        ) : (
          <div {...(alca ?? {})} aria-label={alca ? `Mover a coluna ${coluna.nome}` : undefined}
            className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50', alca && 'cursor-grab active:cursor-grabbing')}>
            <span title={contar(total, 'cartão', 'cartões')}
              className={cn('grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-rotulo font-bold tabular-nums', escolhida ? paleta.solido : paleta.tom)}>
              {total.toLocaleString('pt-BR')}
            </span>
            <h3 className="truncate text-corpo font-semibold text-foreground">{coluna.nome}</h3>
            {coluna.concluidos && (
              <span role="img" aria-label="Coluna de concluídos" title="Coluna de concluídos" className="-ml-1 shrink-0 text-positive">
                <CircleCheck className="size-3.5" aria-hidden="true" />
              </span>
            )}
          </div>
        )}
        {podeMexer && !renomeando && (
          <div className="flex shrink-0 items-center">
            <Button type="button" variant="ghost" size="icon" aria-label={`Renomear a coluna ${coluna.nome}`} title="Renomear"
              onClick={() => setRenomeando(true)}><Pencil className="size-3.5" /></Button>
            <Button ref={botaoCor} type="button" variant="ghost" size="icon" aria-label={`Cor da coluna ${coluna.nome}`} title="Cor e concluídos"
              aria-expanded={pintando} aria-haspopup="dialog" onClick={() => setPintando((p) => !p)}><Palette className="size-3.5" /></Button>
            {podeApagar && (
              <Button type="button" variant="ghost" size="icon" aria-label={`Apagar a coluna ${coluna.nome}`} title="Apagar coluna"
                className={BOTAO_PERIGO} onClick={aoApagar}><Trash2 className="size-3.5" /></Button>
            )}
          </div>
        )}
      </div>
      {pintando && (
        <PainelDaCor ancora={botaoCor} coluna={coluna} automatica={corDaColuna({ cor: null }, posicao)} aoFechar={() => setPintando(false)}
          aoMudarCor={aoMudarCor} aoMudarConcluidos={aoMudarConcluidos} />
      )}

      <Droppable droppableId={coluna.id} type="cartao" isDropDisabled={!arrastarCartoes}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps}
            className={cn('flex min-h-[90px] flex-col gap-2 rounded-xl p-0.5 transition-colors', snapshot.isDraggingOver && 'bg-primary/5 ring-2 ring-primary/25')}>
            {!itens && !estado?.erro && [0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-card/70" />)}
            {estado?.erro && <p role="alert" className="px-1 text-rotulo text-destructive">{estado.erro}</p>}
            {itens?.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 px-3 py-6 text-center">
                <p className="text-rotulo text-muted-foreground">{filtrando ? 'Nenhum cartão com esses filtros' : 'Nenhum cartão aqui'}</p>
                {podeMexer && !filtrando && <p className="mt-0.5 text-legenda text-muted-foreground">Arraste um cartão ou crie um novo</p>}
              </div>
            )}
            {itens?.map((c, i) => (
              <CartaoNoQuadro key={c.id} cartao={c} indice={i} concluidos={coluna.concluidos} hoje={hoje}
                arrastavel={arrastarCartoes} aoAbrir={aoAbrirCartao} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {faltam > 0 && itens && (
        <Button type="button" variant="ghost" size="sm" className="w-full" disabled={estado?.carregandoMais} onClick={aoVerMais}>
          {estado?.carregandoMais ? <Loader2 className="animate-spin" /> : <ChevronsDown />}
          Ver mais {contar(proxima, 'cartão', 'cartões')}
          {faltam > proxima && <span className="font-normal text-muted-foreground tabular-nums">· faltam {faltam.toLocaleString('pt-BR')}</span>}
        </Button>
      )}
      {podeMexer && (
        <Button type="button" variant="ghost" size="sm" className="w-full" aria-label={`Adicionar cartão em ${coluna.nome}`} onClick={aoNovoCartao}>
          <Plus /> Adicionar cartão
        </Button>
      )}
    </section>
  )
}
