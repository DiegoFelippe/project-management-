import { useCallback, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, X } from 'lucide-react'
import CampoData from '@/components/campos/CampoData'
import Seletor from '@/components/campos/Seletor'
import Avatar from '@/components/comum/Avatar'
import { Label } from '@/components/ui/label'
import { pessoasDoQuadro } from '@/data/quadro'
import { hoje } from '@/lib/mes'
import { cn } from '@/lib/utils'
import { atalhosDoPrazo, OPCOES_DE_PRIORIDADE, PRIORIDADES, seloDoPrazo, TONS_DO_PRAZO } from './cores'
import EstadoDaGravacao from './EstadoDaGravacao'

const OPCOES = [{ valor: '', rotulo: 'Sem prioridade' }, ...OPCOES_DE_PRIORIDADE]
const dataLonga = (dia) => format(parseISO(dia), "d 'de' MMM 'de' yyyy", { locale: ptBR })

// Rótulo + estado da gravação + o campo (quem mexe) ou o valor (quem só lê).
function Campo({ id, rotulo, estado, editavel, children }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {editavel ? <Label htmlFor={id}>{rotulo}</Label> : <span className="form-label mb-0">{rotulo}</span>}
        <EstadoDaGravacao estado={estado} />
      </div>
      {children}
    </div>
  )
}

// Lateral da janela do cartão, como no Mochi: Coluna, Prazo (atalhos Hoje, Amanhã e Sexta), Prioridade e Responsáveis
// (só quem atende o cliente: a lista vem do banco, pela busca). Cada campo grava sozinho (quem chama grava e passa o
// estado em `estados`). Quem só lê vê os valores, sem campos.
export default function LateralDoCartao({
  cartao, quadro, podeMexer, estados = {}, aoMudarColuna, aoMudarPrazo, aoMudarPrioridade, aoIncluirResponsavel, aoTirarResponsavel,
}) {
  const [atalhos] = useState(() => atalhosDoPrazo())
  const prioridade = PRIORIDADES[cartao.prioridade]
  const selo = seloDoPrazo(cartao.prazo, hoje(), cartao.coluna?.concluidos)
  const responsaveis = cartao.responsaveis ?? []

  const buscar = useCallback(async (termo) => {
    const { itens, total } = await pessoasDoQuadro({ quadroId: quadro.id, termo })
    return { itens: itens.map((p) => ({ valor: p.id, rotulo: p.nome, avatar: p })), total }
  }, [quadro.id])

  return (
    <>
      <Campo id="cartao-coluna" rotulo="Coluna" estado={estados.coluna} editavel={podeMexer}>
        {podeMexer ? (
          <Seletor id="cartao-coluna" valor={cartao.coluna_id} aoMudar={aoMudarColuna}
            opcoes={quadro.colunas.map((c) => ({ valor: c.id, rotulo: c.nome }))} />
        ) : <p className="text-corpo text-foreground">{cartao.coluna?.nome}</p>}
      </Campo>

      <Campo id="cartao-prazo" rotulo="Prazo" estado={estados.prazo} editavel={podeMexer}>
        {podeMexer ? (
          <CampoData id="cartao-prazo" valor={cartao.prazo ?? ''} aoMudar={aoMudarPrazo} atalhos={atalhos} placeholder="Sem prazo" />
        ) : <p className="text-corpo text-foreground">{cartao.prazo ? dataLonga(cartao.prazo) : 'Sem prazo'}</p>}
        {selo && selo.tom !== 'neutro' && (
          <span className={cn('inline-flex w-fit items-center gap-1 rounded-lg px-2 py-0.5 text-legenda font-semibold', TONS_DO_PRAZO[selo.tom])}>
            <CalendarDays className="size-3" aria-hidden="true" />{selo.titulo}
          </span>
        )}
      </Campo>

      <Campo id="cartao-prioridade" rotulo="Prioridade" estado={estados.prioridade} editavel={podeMexer}>
        {podeMexer ? (
          <Seletor id="cartao-prioridade" valor={cartao.prioridade ?? ''} aoMudar={aoMudarPrioridade} opcoes={OPCOES} />
        ) : prioridade ? (
          <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-rotulo font-semibold', prioridade.selo)}>
            <span className={cn('size-1.5 rounded-full', prioridade.ponto)} aria-hidden="true" />{prioridade.rotulo}
          </span>
        ) : <p className="text-corpo text-muted-foreground">Sem prioridade</p>}
      </Campo>

      <Campo id="cartao-responsavel" rotulo="Responsáveis" estado={estados.responsaveis} editavel={podeMexer}>
        {responsaveis.length > 0 ? (
          <ul aria-label="Responsáveis do cartão" className="flex flex-wrap gap-1.5">
            {responsaveis.map((p) => (
              <li key={p.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-0.5 pr-1 pl-0.5 text-rotulo">
                <Avatar pessoa={p} className="size-6 ring-0" />
                <span className="min-w-0 truncate">{p.nome}</span>
                {podeMexer ? (
                  <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => aoTirarResponsavel(p)}
                    className="botao-animado grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-[color,background-color,translate,scale] hover:-translate-y-px hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : <span className="w-1" />}
              </li>
            ))}
          </ul>
        ) : <p className="text-corpo text-muted-foreground">Sem responsável.</p>}
        {podeMexer && (
          <Seletor id="cartao-responsavel" valor="" buscar={buscar} placeholder="Adicionar responsável"
            aoMudar={(_valor, opcao) => opcao?.avatar && aoIncluirResponsavel(opcao.avatar)} />
        )}
      </Campo>
    </>
  )
}
