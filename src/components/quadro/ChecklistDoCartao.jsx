import { useRef, useState } from 'react'
import { Check, ListChecks, Plus, X } from 'lucide-react'
import Caixa from '@/components/campos/Caixa'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apagarItemDoChecklist, criarItemDoChecklist, editarItemDoChecklist } from '@/data/quadro'
import { cn } from '@/lib/utils'
import { useEscNoCampo } from './useEscNoCampo'

// Checklist do cartão (um só, como no Mochi), com a barra de progresso. Quem mexe marca, adiciona (Enter adiciona e a
// caixa continua aberta para o próximo), edita o texto no lugar (clique no texto; Enter grava, Esc desiste) e apaga com
// confirmação. Cada mudança grava sozinha e aparece na hora; se o banco recusar, volta como estava e `aoRecusar(erro)`
// avisa a janela (que mostra o motivo e confere o acesso). `aoMexer()`: algo foi gravado (o quadro relê ao fechar).
export default function ChecklistDoCartao({ cartaoId, itensIniciais, podeMexer, aoMexer, aoRecusar }) {
  const [itens, setItens] = useState(itensIniciais ?? [])
  const [novo, setNovo] = useState(null) // null = fechado; texto = digitando um item novo
  const [editando, setEditando] = useState(null) // { id, texto }
  const [apagando, setApagando] = useState(null)
  const campoNovo = useRef(null)
  const campoEdicao = useRef(null)
  const total = itens.length
  const feitos = itens.filter((i) => i.feito).length
  const porcento = total ? Math.round((feitos / total) * 100) : 0

  useEscNoCampo(campoNovo, novo !== null, () => setNovo(null))
  useEscNoCampo(campoEdicao, Boolean(editando), () => setEditando(null))

  const trocar = (id, campos) => setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...campos } : i)))

  async function marcar(item, feito) {
    trocar(item.id, { feito })
    const resposta = await editarItemDoChecklist(item.id, { feito })
    if (resposta.erro) {
      trocar(item.id, { feito: item.feito })
      aoRecusar(resposta.erro)
    } else aoMexer()
  }

  async function adicionar() {
    const texto = novo?.trim()
    if (!texto) return
    setNovo('')
    const resposta = await criarItemDoChecklist(cartaoId, texto)
    if (resposta.erro) {
      setNovo((atual) => atual || texto)
      aoRecusar(resposta.erro)
      return
    }
    setItens((lista) => [...lista, resposta.item])
    aoMexer()
  }

  async function salvarEdicao() {
    const edicao = editando
    setEditando(null)
    const item = itens.find((i) => i.id === edicao?.id)
    const texto = edicao?.texto.trim()
    if (!item || !texto || texto === item.texto) return
    trocar(item.id, { texto })
    const resposta = await editarItemDoChecklist(item.id, { texto })
    if (resposta.erro) {
      trocar(item.id, { texto: item.texto })
      aoRecusar(resposta.erro)
    } else aoMexer()
  }

  async function apagar(item) {
    const resposta = await apagarItemDoChecklist(item.id)
    if (resposta.erro) {
      aoRecusar(resposta.erro)
      return resposta
    }
    setItens((lista) => lista.filter((i) => i.id !== item.id))
    aoMexer()
    return resposta
  }

  const aoTeclarEnter = (fazer) => (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    fazer()
  }

  return (
    <section aria-labelledby="titulo-do-checklist" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id="titulo-do-checklist" className="section-label flex items-center gap-1.5">
          <ListChecks className="size-3.5" aria-hidden="true" /> Checklist
        </h3>
        {total > 0 && (
          <div className="flex items-center gap-2">
            <div role="progressbar" aria-label="Progresso do checklist" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcento}
              className="h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:w-28">
              <div className={cn('h-full rounded-full transition-[width] duration-300', feitos === total ? 'bg-positive' : 'bg-primary')}
                style={{ width: `${porcento}%` }} />
            </div>
            <span className="text-legenda font-semibold tabular-nums text-muted-foreground">{feitos}/{total}</span>
          </div>
        )}
      </div>

      {total > 0 && (
        <ul aria-label="Itens do checklist" className="space-y-0.5">
          {itens.map((item) => (
            // No toque, 12 px em cima e embaixo: a linha fica com 44 px, a altura do alvo da Caixa, e um alvo não cobre o outro.
            <li key={item.id} className="group flex items-start gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-muted/50 pointer-coarse:py-3">
              {podeMexer ? (
                <Caixa nome={item.texto} marcado={item.feito} aoMudar={(feito) => marcar(item, feito)} className="mt-0.5" />
              ) : (
                <span role="img" aria-label={item.feito ? 'Feito' : 'A fazer'}
                  className={cn('mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border',
                    item.feito ? 'border-primary-cheio bg-primary-cheio text-primary-foreground' : 'bg-card')}>
                  {item.feito && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                </span>
              )}
              {editando?.id === item.id ? (
                <Input ref={campoEdicao} autoFocus aria-label="Texto do item" maxLength={300} value={editando.texto}
                  className="h-8 flex-1" onChange={(e) => setEditando({ id: item.id, texto: e.target.value })}
                  onKeyDown={aoTeclarEnter(salvarEdicao)} onBlur={salvarEdicao} />
              ) : podeMexer ? (
                <button type="button" aria-label={`Editar o item ${item.texto}`} onClick={() => setEditando({ id: item.id, texto: item.texto })}
                  className={cn('botao-animado min-w-0 flex-1 cursor-text rounded-md px-1 text-left text-corpo break-words outline-none transition-[color,translate,scale] duration-150 hover:-translate-y-px hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]',
                    item.feito && 'text-muted-foreground line-through')}>
                  {item.texto}
                </button>
              ) : (
                <span className={cn('min-w-0 flex-1 px-1 text-corpo break-words', item.feito && 'text-muted-foreground line-through')}>{item.texto}</span>
              )}
              {podeMexer && editando?.id !== item.id && (
                <Button type="button" variant="ghost" size="icon" aria-label={`Apagar o item ${item.texto}`} onClick={() => setApagando(item)}
                  className="size-7 shrink-0 opacity-60 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!total && !podeMexer && <p className="text-corpo text-muted-foreground">Nenhum item no checklist.</p>}

      {podeMexer && (novo === null ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setNovo('')}><Plus /> Adicionar item</Button>
      ) : (
        <Input ref={campoNovo} autoFocus aria-label="Novo item do checklist" placeholder="Novo item… (Enter adiciona)" maxLength={300}
          value={novo} className="h-9" onChange={(e) => setNovo(e.target.value)} onKeyDown={aoTeclarEnter(adicionar)}
          onBlur={() => (novo.trim() ? adicionar() : setNovo(null))} />
      ))}

      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo="Apagar o item do checklist?"
          descricao={`“${apagando.texto}” sai do checklist.`} rotuloConfirmar="Apagar item" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
