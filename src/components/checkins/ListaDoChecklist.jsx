import { memo } from 'react'
import { CalendarDays, Check, Clock, Lock, Play, StickyNote, TriangleAlert } from 'lucide-react'
import Caixa from '@/components/campos/Caixa'
import { ListaVazia } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { juntar, plural } from '@/lib/nomes'
import { BarraDeProgresso } from './CartaoDoModelo'
import { diaCurto, feitaPorEm, mesmaSituacao } from './situacao'

const SELO_ANDAMENTO = 'border-transparent bg-accent text-primary-texto'
const SELO_ATRASADA = 'border-transparent bg-destructive/10 text-destructive'
const SELO_BLOQUEADA = 'border-transparent bg-muted text-muted-foreground'
const SELO_SESSAO = 'border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300'

// Os selos da tarefa (a lista e a janela da tarefa): Feita por … em …; Em andamento; Atrasada · venceu 12/11, Vence hoje
// ou Vence 20/11; Bloqueada e o que ela espera. Em andamento e bloqueada (uma dependência foi reaberta) é um selo só,
// "Em andamento · espera N tarefas", como no fluxograma. `idMotivo` vai no motivo do bloqueio (a caixa desligada aponta
// para ele).
export function SelosDaTarefa({ tarefa, situacao, idMotivo }) {
  if (tarefa.estado === 'feita') {
    return (
      <>
        <Badge variant="positive"><Check /> Feita</Badge>
        <span className="text-muted-foreground text-legenda">{feitaPorEm(tarefa)}</span>
      </>
    )
  }
  const andamento = tarefa.estado === 'andamento'
  const motivo = situacao.bloqueada && (
    <span id={idMotivo} className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {andamento
        ? <Badge variant="outline" className={SELO_ANDAMENTO}><Play /> Em andamento · espera {plural(situacao.espera.length, 'tarefa', 'tarefas')}</Badge>
        : <Badge variant="outline" className={SELO_BLOQUEADA}><Lock /> Bloqueada</Badge>}{' '}
      <span className="text-muted-foreground min-w-0 text-legenda break-words">
        {andamento ? '' : 'espera '}{juntar(situacao.espera.map((d) => d.titulo))}
      </span>
    </span>
  )
  return (
    <>
      {andamento && (motivo || <Badge variant="outline" className={SELO_ANDAMENTO}><Play /> Em andamento</Badge>)}
      {situacao.atrasada ? <Badge variant="outline" className={SELO_ATRASADA}><TriangleAlert /> Atrasada · venceu {diaCurto(tarefa.vence_em)}</Badge>
        : situacao.venceHoje ? <Badge variant="notice"><Clock /> Vence hoje</Badge>
          : tarefa.vence_em ? <Badge variant="outline"><CalendarDays /> Vence {diaCurto(tarefa.vence_em)}</Badge>
            : null}
      {!andamento && motivo}
    </>
  )
}

// Um item da lista. Memorizado: com as mesmas props (a tarefa, a situação e as funções não mudam de identidade quando
// a tarefa não mudou), marcar uma num check-list de 500 só redesenha ela e as que ela libera. `ocupada`: indo para o
// banco agora — a caixa continua ligada (o foco do teclado fica nela), o item diz aria-busy e quem chama ignora outro
// clique até a resposta.
// A situação é recalculada a cada mudança (objetos novos): conta igual pelo valor; o resto, pela identidade.
const mesmasProps = (a, b) => Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every((chave) => (chave === 'situacao' ? mesmaSituacao(a.situacao, b.situacao) : Object.is(a[chave], b[chave])))

const ItemDaTarefa = memo(function ItemDaTarefa({ tarefa, situacao, podeMarcar, ocupada, aoMarcar, aoAbrir }) {
  const feita = tarefa.estado === 'feita'
  const bloqueada = !feita && situacao.bloqueada
  const idMotivo = bloqueada ? `motivo-${tarefa.id}` : undefined
  return (
    <li aria-busy={ocupada || undefined} className="flex items-start gap-3 px-4 py-3 aria-busy:cursor-progress">
      <Caixa nome={tarefa.titulo} marcado={feita} desabilitado={!podeMarcar || bloqueada} descritoPor={idMotivo}
        aoMudar={(marcada) => aoMarcar(tarefa, marcada ? 'feita' : 'a_fazer')} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={() => aoAbrir(tarefa)}
            className="botao-animado hover:text-primary min-w-0 rounded-sm text-left text-corpo font-semibold break-words transition-[color,translate,scale] outline-none hover:-translate-y-px hover:underline focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
            {tarefa.titulo}
          </button>
          {!tarefa.obrigatoria && <Badge variant="outline">Opcional</Badge>}
          {tarefa.na_sessao && <Badge variant="outline" className={SELO_SESSAO}><Clock /> Nesta sessão</Badge>}
        </div>
        {tarefa.descricao && <p className="text-muted-foreground text-rotulo break-words">{tarefa.descricao}</p>}
        <div data-selos className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SelosDaTarefa tarefa={tarefa} situacao={situacao} idMotivo={idMotivo} />
        </div>
        {tarefa.nota && (
          <p className="bg-muted/60 flex items-start gap-1.5 rounded-lg px-2 py-1 text-rotulo">
            <StickyNote className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{tarefa.nota}</span>
          </p>
        )}
      </div>
    </li>
  )
}, mesmasProps)

const VAZIO = { feitas: 'Nenhuma tarefa feita ainda.', pendentes: 'Tudo feito: nenhuma tarefa pendente.' }

// O check-list em lista: um cartão por etapa (número, nome, "3 de 5" e barra) com as tarefas na ordem do modelo. Cada
// tarefa: a caixa de marcar (desligada para quem não marca e na bloqueada, que mostra o que espera), o título (abre a
// janela da tarefa), "Opcional", "Nesta sessão", a descrição, os selos e a nota. `filtro` ('todas' | 'pendentes' |
// 'feitas') roda na tela: o check-list já veio inteiro; etapa sem nenhuma tarefa no filtro some. `ocupadas`: as tarefas
// que estão indo para o banco agora. `aoMarcar` e `aoAbrir` precisam ser estáveis (useCallback) para o memo dos itens.
export default function ListaDoChecklist({ etapas, tarefas, situacoes, filtro, podeMarcar, ocupadas, aoMarcar, aoAbrir }) {
  const daEtapa = new Map(etapas.map((e) => [e.id, []]))
  for (const t of tarefas) daEtapa.get(t.etapa_id)?.push(t)
  const entra = (t) => filtro === 'todas' || (filtro === 'feitas') === (t.estado === 'feita')

  const blocos = etapas.map((etapa, i) => {
    const todas = daEtapa.get(etapa.id)
    const mostradas = todas.filter(entra)
    if (!mostradas.length) return null
    const feitas = todas.filter((t) => t.estado === 'feita').length
    const pct = todas.length ? Math.round((feitas / todas.length) * 100) : 0
    const nome = `${i + 1} · ${etapa.nome}`
    return (
      <section key={etapa.id} aria-label={nome} className="card min-w-0 overflow-hidden">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
          <span className="bg-primary/10 text-primary-texto grid size-7 shrink-0 place-items-center rounded-lg text-rotulo font-bold tabular-nums">
            {i + 1}
          </span>
          <h3 className="min-w-0 flex-1 text-subtitulo font-semibold break-words">{etapa.nome}</h3>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-legenda font-semibold tabular-nums">{feitas} de {todas.length}</span>
            <BarraDeProgresso pct={pct} rotulo={`Progresso de ${etapa.nome}`} className="h-1.5 w-20 sm:w-28" />
          </div>
        </header>
        <ul aria-label={`Tarefas de ${etapa.nome}`} className="divide-y">
          {mostradas.map((t) => (
            <ItemDaTarefa key={t.id} tarefa={t} situacao={situacoes.get(t.id)} podeMarcar={podeMarcar} ocupada={ocupadas.has(t.id)}
              aoMarcar={aoMarcar} aoAbrir={aoAbrir} />
          ))}
        </ul>
      </section>
    )
  }).filter(Boolean)

  if (!blocos.length) return <ListaVazia>{VAZIO[filtro] ?? 'Nenhuma tarefa neste check-list.'}</ListaVazia>
  return <div className="grid min-w-0 grid-cols-1 gap-4">{blocos}</div>
}
