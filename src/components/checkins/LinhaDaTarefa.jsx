import { memo } from 'react'
import { Ban, Clock, Eye, Lock, MessageSquare, Pause, Pencil, Play } from 'lucide-react'
import Caixa from '@/components/campos/Caixa'
import MenuDeAcoes from '@/components/comum/MenuDeAcoes'
import { AcaoDaLinha } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import PrazoDaTarefa from './PrazoDaTarefa'
import { mesmaSituacao, textoDaEspera } from './situacao'
import { minutosFeitos, relogio, segundosDaTarefa, useAgora } from './tempo'

const SELO_ANDAMENTO = 'border-transparent bg-accent text-primary-texto'
// Pausada: o fundo do cartão com borda (em andamento é o azul-claro) e o ícone de pausa: nunca só a cor.
const SELO_PAUSADA = 'border-input bg-card text-primary-texto'
const SELO_CINZA = 'border-transparent bg-muted text-muted-foreground'
const SELO_SESSAO = 'border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300'
// A feita é o check verde (a Caixa da casa é azul): o texto do check na cor do cartão segura o contraste no claro e no escuro.
const CHECK_VERDE = '[&_input:checked+span]:border-positive [&_input:checked+span]:bg-positive [&_input:checked+span]:text-card'

// O relógio da tarefa em andamento (o relógio comum da tela, um intervalo só para todas).
export function TempoCorrendo({ tarefa }) {
  const agora = useAgora(true)
  return <span className="tabular-nums">{relogio(segundosDaTarefa(tarefa, agora))}</span>
}

// O selo da situação (a linha e o Editar): Em andamento com o relógio (sem o trecho aberto, as de antes do relógio, sem
// ele), Pausada com os minutos feitos, Bloqueada (a fazer que espera outra) e Não se aplica. A feita não tem selo: o
// check verde já diz.
export function SeloDaSituacao({ tarefa, situacao }) {
  if (tarefa.estado === 'nao_se_aplica') {
    return <Badge variant="outline" data-selo="nao_se_aplica" className={SELO_CINZA}><Ban /> Não se aplica</Badge>
  }
  if (tarefa.estado === 'andamento') {
    return (
      <Badge variant="outline" data-selo="andamento" className={SELO_ANDAMENTO}>
        <Play /> Em andamento{tarefa.trecho_aberto_desde && <> · <TempoCorrendo tarefa={tarefa} /></>}
      </Badge>
    )
  }
  if (tarefa.estado === 'pausada') {
    return (
      <Badge variant="outline" data-selo="pausada" className={SELO_PAUSADA}>
        <Pause /> Pausada{tarefa.tempo_segundos > 0 && ` · ${minutosFeitos(tarefa.tempo_segundos)}`}
      </Badge>
    )
  }
  if (situacao.bloqueada) return <Badge variant="outline" data-selo="bloqueada" className={SELO_CINZA}><Lock /> Bloqueada</Badge>
  return null
}

// Iniciar / Pausar / Retomar: pausar a em andamento pode sempre (uma dependência reaberta não prende o relógio);
// começar e retomar pedem as dependências.
function acaoDoTempo(tarefa, bloqueada) {
  if (tarefa.estado === 'andamento') return { nome: 'Pausar', icone: Pause, estado: 'pausada' }
  return { nome: tarefa.estado === 'pausada' ? 'Retomar' : 'Iniciar', icone: Play, estado: 'andamento', presa: bloqueada }
}

// A situação é recalculada a cada mudança (objetos novos): conta igual pelo valor; o resto, pela identidade.
const mesmasProps = (a, b) => Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every((chave) => (chave === 'situacao' ? mesmaSituacao(a.situacao, b.situacao) : Object.is(a[chave], b[chave])))

// A linha da tarefa no check-list do cliente (acréscimo de 18/11 (2), protótipo v2, Variante A): o check (a que não se
// aplica tem o quadrado cinza com o ícone próprio), o título em texto (clicar nele não abre nada), o selo da situação,
// Opcional, Nesta sessão, a descrição e, na bloqueada, "Espera: …" (ligado ao check e ao Iniciar desligados). À direita:
// o prazo como botão, Iniciar/Pausar/Retomar, Não se aplica (pede o motivo na hora), 💬 N (só com comentários) e Editar
// (Ver para quem só lê). O que não vale para a linha guarda o lugar (o lápis não muda de lugar). No celular, as ações
// vão para o "⋯" (o Editar junto). Motivo, nota, "feita por" e comentários ficam no Editar.
// Memorizada: num check-list de 500, marcar uma só redesenha ela e as que ela libera (as funções precisam ser
// estáveis). `ocupada`: indo para o banco agora (aria-busy; quem chama ignora outro clique até a resposta).
function LinhaDaTarefa({ tarefa, situacao, inicio, podeMarcar, podeComentar, ocupada, aoMarcar, aoNaoSeAplica, aoEditar }) {
  const { titulo } = tarefa
  const feita = tarefa.estado === 'feita'
  const naoSeAplica = tarefa.estado === 'nao_se_aplica'
  const resolvida = feita || naoSeAplica
  const bloqueada = !resolvida && situacao.bloqueada
  const idEspera = bloqueada ? `espera-${tarefa.id}` : undefined
  const tempo = resolvida ? null : acaoDoTempo(tarefa, bloqueada)
  const lapis = podeMarcar || podeComentar ? { nome: 'Editar', icone: Pencil } : { nome: 'Ver', icone: Eye }
  const comentarios = tarefa.comentarios ?? 0
  const menu = [
    ...(podeMarcar && tempo && !tempo.presa ? [{ rotulo: tempo.nome, icone: tempo.icone, aoEscolher: () => aoMarcar(tarefa, tempo.estado) }] : []),
    ...(podeMarcar && !resolvida ? [{ rotulo: 'Não se aplica…', icone: Ban, aoEscolher: () => aoNaoSeAplica(tarefa) }] : []),
    ...(comentarios ? [{ rotulo: `Comentários (${comentarios})`, icone: MessageSquare, aoEscolher: () => aoEditar(tarefa) }] : []),
    { rotulo: lapis.nome, icone: lapis.icone, aoEscolher: () => aoEditar(tarefa) },
  ]

  return (
    <li aria-busy={ocupada || undefined}
      className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 aria-busy:cursor-progress sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]',
        naoSeAplica && 'bg-muted/40')}>
      <div className="col-start-1 row-start-1 pt-0.5">
        {naoSeAplica ? (
          <span aria-hidden="true" className="bg-muted text-muted-foreground border-input flex size-[18px] items-center justify-center rounded-[5px] border">
            <Ban className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <Caixa nome={titulo} marcado={feita} desabilitado={!podeMarcar || bloqueada} descritoPor={idEspera} className={CHECK_VERDE}
            aoMudar={(marcada) => aoMarcar(tarefa, marcada ? 'feita' : 'a_fazer')} />
        )}
      </div>
      <div className="col-start-2 row-start-1 min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span data-titulo className={cn('min-w-0 text-corpo font-semibold break-words', naoSeAplica && 'text-muted-foreground')}>{titulo}</span>
          <SeloDaSituacao tarefa={tarefa} situacao={situacao} />
          {!tarefa.obrigatoria && <Badge variant="outline">Opcional</Badge>}
          {tarefa.na_sessao && <Badge variant="outline" className={SELO_SESSAO}><Clock /> Nesta sessão</Badge>}
        </div>
        {tarefa.descricao && <p className="text-muted-foreground text-rotulo break-words">{tarefa.descricao}</p>}
        {bloqueada && <p id={idEspera} className="text-muted-foreground text-legenda break-words">{textoDaEspera(situacao)}</p>}
      </div>
      {tarefa.vence_em && (
        <div className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1 sm:-mt-1">
          <PrazoDaTarefa tarefa={tarefa} situacao={situacao} inicio={inicio} />
        </div>
      )}
      <div className="col-start-3 row-start-1 -mt-1.5 flex items-center sm:col-start-4">
        <div data-acoes className="flex items-center gap-0.5 max-sm:hidden">
          {podeMarcar && (
            <>
              <AcaoDaLinha nome={tempo?.nome ?? 'Iniciar'} aria-label={`${tempo?.nome} ${titulo}`} icone={tempo?.icone ?? Play}
                visivel={Boolean(tempo)} disabled={tempo?.presa} aria-describedby={tempo?.presa ? idEspera : undefined}
                onClick={() => aoMarcar(tarefa, tempo.estado)} />
              <AcaoDaLinha nome="Não se aplica" aria-label={`Não se aplica: ${titulo}`} icone={Ban} visivel={!resolvida}
                aria-haspopup="dialog" onClick={() => aoNaoSeAplica(tarefa)} />
            </>
          )}
          {comentarios > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="w-14 tabular-nums" title={plural(comentarios, 'comentário', 'comentários')}
              aria-label={`${plural(comentarios, 'comentário', 'comentários')} em ${titulo}`} aria-haspopup="dialog" onClick={() => aoEditar(tarefa)}>
              <MessageSquare /> {comentarios}
            </Button>
          ) : <span aria-hidden="true" className="inline-block w-14" />}
          <AcaoDaLinha nome={lapis.nome} aria-label={`${lapis.nome} ${titulo}`} icone={lapis.icone} aria-haspopup="dialog"
            onClick={() => aoEditar(tarefa)} />
        </div>
        <MenuDeAcoes rotulo={`Ações de ${titulo}`} itens={menu} className="sm:hidden" />
      </div>
    </li>
  )
}

export default memo(LinhaDaTarefa, mesmasProps)
