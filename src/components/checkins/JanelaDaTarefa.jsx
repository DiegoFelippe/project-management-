import { useEffect, useId, useState } from 'react'
import { Ban, Check, Circle, ClipboardCheck, Clock, Lock, Pause, Play } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import JanelaFormulario, { BotaoCancelar, CartaoDaSecao, SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { historicoDaTarefa } from '@/data/checklists'
import { diaEmSP, horaEmSP } from '@/lib/calendario'
import { MOTIVO_OBRIGATORIO } from '@/lib/erros'
import { formatarDia, hoje as hojeEmSP } from '@/lib/mes'
import { juntar } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import ComentariosDaTarefa from './ComentariosDaTarefa'
import { SeloDaSituacao, TempoCorrendo } from './LinhaDaTarefa'
import { dataPorExtenso, diaCurto, feitaPorEm, prazoEmPalavras, situacaoDaTarefa, textoDaEspera } from './situacao'
import { minutosFeitos, quandoEmSP } from './tempo'

const MAXIMO = 500
const EDITANDO_COMENTARIO = 'Salve ou cancele o comentário que você está editando.'
const SITUACOES = [
  { valor: 'a_fazer', rotulo: 'A fazer', icone: Circle },
  { valor: 'andamento', rotulo: 'Em andamento', icone: Play },
  { valor: 'pausada', rotulo: 'Pausada', icone: Pause },
  { valor: 'feita', rotulo: 'Feita', icone: Check },
  { valor: 'nao_se_aplica', rotulo: 'Não se aplica', icone: Ban },
]

// A regra do banco (marcar_tarefa): a fazer e não se aplica valem sempre; em andamento e feita pedem as dependências;
// pausada também, menos a partir de em andamento (pausar pode sempre).
const precisaDasDependencias = (destino, atual) => destino !== atual
  && (destino === 'andamento' || destino === 'feita' || (destino === 'pausada' && atual !== 'andamento'))

// O campo Motivo (o Editar e a janela da linha): obrigatório, até 500 letras, com o contador e o que acontece.
function CampoDoMotivo({ id, valor, aoMudar, erro, dica, autoFocus = false }) {
  return (
    <Campo id={id} rotulo="Motivo" erro={erro} dica={dica}>
      <Textarea id={id} rows={3} maxLength={MAXIMO} autoFocus={autoFocus} value={valor} onChange={(e) => aoMudar(e.target.value)}
        placeholder="Ex.: o cliente já tem o DRE auditado deste ano" />
      <span className="text-muted-foreground justify-self-end text-legenda tabular-nums">{valor.length}/{MAXIMO}</span>
    </Campo>
  )
}

// O que acontece ao marcar "não se aplica" (a bloqueada fecha, mas as que dependem dela continuam esperando).
function oQueAcontece(espera) {
  const fecha = espera.length
    ? `A tarefa fecha sem ser feita. As que dependem dela continuam esperando ${juntar(espera.map((d) => d.titulo))}.`
    : 'A tarefa fecha sem ser feita e libera as que dependem dela.'
  return `${fecha} O motivo fica na tarefa e no Histórico do cliente, para a auditoria.`
}

// "Não se aplica" pedido na hora, da linha (acréscimo de 18/11 (2)): só o motivo. `aoMarcar(motivo)` grava e devolve
// { erro }; sem erro, a janela fecha. Fechar com o motivo escrito pergunta antes.
export function JanelaNaoSeAplica({ tarefa, situacao, aoMarcar, aoFechar }) {
  const [motivo, setMotivo] = useState('')
  const id = useId()
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => (motivo.trim() ? {} : { motivo: MOTIVO_OBRIGATORIO }),
  })
  function marcar(e) {
    e.preventDefault()
    if (conferir()) enviar(() => aoMarcar(motivo.trim()))
  }
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Por que não se aplica?" descricao={tarefa.titulo} icone={Ban}
      enviando={enviando} tentativa={tentativa} alterado={motivo.trim() !== ''} form="form-nao-se-aplica"
      rotuloEnviar="Marcar não se aplica" rotuloEnviando="Marcando…">
      <form id="form-nao-se-aplica" noValidate onSubmit={marcar} className="space-y-4">
        <CampoDoMotivo id={id} valor={motivo} aoMudar={setMotivo} erro={erros.motivo} dica={oQueAcontece(situacao.espera)} autoFocus />
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}

// O texto de cada linha do histórico curto (as do Histórico do cliente desta tarefa e os trechos de tempo).
function linhasDoHistorico({ eventos = [], trechos = [] }) {
  const por = (nome) => (nome ? ` por ${nome}` : '')
  const TEXTO = {
    tarefa_nao_se_aplica: (e) => `Não se aplica${por(e.autor)}: “${e.motivo}”`,
    motivo_trocado: (e) => `Motivo trocado${por(e.autor)}: “${e.motivo}”`,
    tarefa_reaberta: (e) => `Reaberta${por(e.autor)}`,
  }
  const doHistorico = eventos.filter((e) => TEXTO[e.tipo]).map((e) => ({ chave: e.id, em: e.em, texto: TEXTO[e.tipo](e) }))
  const dosTrechos = trechos.map((t) => ({
    chave: `${t.inicio}-${t.pessoa}`,
    em: t.inicio,
    texto: t.fim
      ? `Trabalhada${por(t.pessoa)}: ${minutosFeitos((new Date(t.fim) - new Date(t.inicio)) / 1000)}`
      : `Em andamento${por(t.pessoa)}`,
  }))
  return [...doHistorico, ...dosTrechos].sort((a, b) => new Date(b.em) - new Date(a.em)).slice(0, 10)
}

// O histórico curto da tarefa (historico_da_tarefa): as últimas linhas do Histórico dela e os trechos de tempo.
function HistoricoDaTarefa({ tarefaId }) {
  const [historico, setHistorico] = useState(undefined)
  const idTitulo = useId()
  useEffect(() => {
    let ativo = true
    historicoDaTarefa(tarefaId).then((h) => ativo && setHistorico(h ?? null), () => ativo && setHistorico(null))
    return () => {
      ativo = false
    }
  }, [tarefaId])
  const linhas = historico ? linhasDoHistorico(historico) : []
  return (
    <section aria-labelledby={idTitulo} className="min-w-0 space-y-2">
      <h3 id={idTitulo} className="section-label">Histórico da tarefa</h3>
      {historico === undefined ? <p className="text-muted-foreground text-rotulo">Carregando…</p>
        : !linhas.length ? <p className="text-muted-foreground text-rotulo">Nada ainda.</p>
          : (
            <ol aria-labelledby={idTitulo} className="space-y-2">
              {linhas.map((l) => (
                <li key={l.chave} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 text-rotulo">
                  <span aria-hidden="true" className="bg-input mt-1.5 size-2 rounded-full" />
                  <span className="break-words">{l.texto}</span>
                  <span className="text-muted-foreground col-start-2 text-legenda tabular-nums">{quandoEmSP(l.em)}</span>
                </li>
              ))}
            </ol>
          )}
      <p className="text-muted-foreground text-legenda">O histórico completo fica na aba Histórico do cliente.</p>
    </section>
  )
}

// Quando o trecho aberto começou: "11:55" (hoje) ou "16/11 11:55".
function desde(instante) {
  const dia = diaEmSP(instante)
  return dia === hojeEmSP() ? horaEmSP(instante) : `${diaCurto(dia)} ${horaEmSP(instante)}`
}

// O tempo feito (a soma dos trechos; na em andamento, o relógio correndo e desde quando), ou nada.
function linhaDoTempo(tarefa) {
  if (tarefa.estado === 'andamento' && tarefa.trecho_aberto_desde) {
    return <>Tempo feito: <strong><TempoCorrendo tarefa={tarefa} /></strong> · em andamento desde {desde(tarefa.trecho_aberto_desde)}</>
  }
  if (!(tarefa.tempo_segundos > 0)) return null
  return <>Tempo feito: <strong className="tabular-nums">{minutosFeitos(tarefa.tempo_segundos)}</strong>{tarefa.estado === 'pausada' && ' · pausada'}</>
}

// Editar tarefa (acréscimo de 18/11 (2), protótipo v2): o título e a descrição vêm do modelo (só ler); a situação em abas
// (A fazer · Em andamento · Pausada · Feita · Não se aplica; com dependência pendente, as que pedem dependências ficam
// desligadas, com "Espera: …"); o motivo só em Não se aplica (trocar o motivo é aqui); o prazo (só ler); a nota; os
// comentários (gravam na hora) e o histórico curto. Para quem marca (o consultor do cliente), Salvar manda
// `aoSalvar({ estado, motivo, nota, comentario })` (o rascunho do comentário vai junto) e devolve { erro }; sem erro, a
// janela fecha. Para os outros, Fechar, com a situação, o motivo e a nota só para ler (a gestão comenta). Fechar com algo
// mudado ou escrito pergunta antes. `aoMexer()`: um comentário entrou ou saiu (o check-list relê a contagem).
export default function JanelaDaTarefa({
  tarefa, etapas, tarefas, situacoes, nomeDoCliente, inicio, podeMarcar, aoSalvar, aoMexer, aoFechar,
}) {
  const [situacao, setSituacao] = useState(tarefa.estado)
  const [motivo, setMotivo] = useState(tarefa.motivo ?? '')
  const [nota, setNota] = useState(tarefa.nota ?? '')
  const [rascunho, setRascunho] = useState('')
  const [editandoComentario, setEditandoComentario] = useState(false)
  const idMotivo = useId()
  const idNota = useId()
  const s = situacoes.get(tarefa.id)
  const naoSeAplica = tarefa.estado === 'nao_se_aplica'
  // O que ela espera mesmo resolvida (reabrir a feita ou a que não se aplica pede as dependências, como Iniciar).
  const espera = situacaoDaTarefa({ ...tarefa, estado: 'a_fazer' }, new Map(tarefas.map((t) => [t.id, t])), null).espera
  const alterado = useAlterado({ situacao, motivo, nota }) || rascunho.trim() !== '' || editandoComentario
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => ({
      ...(situacao === 'nao_se_aplica' && !motivo.trim() ? { motivo: MOTIVO_OBRIGATORIO } : {}),
      ...(editandoComentario ? { comentario: EDITANDO_COMENTARIO } : {}),
    }),
  })

  function salvar(e) {
    e.preventDefault()
    if (!podeMarcar || !conferir()) return
    enviar(() => aoSalvar({
      estado: situacao,
      motivo: situacao === 'nao_se_aplica' ? motivo.trim() : null,
      nota: nota.trim(),
      comentario: rascunho.trim() || null,
    }))
  }

  const numeroDaEtapa = etapas.findIndex((e) => e.id === tarefa.etapa_id) + 1
  const detalhe = `Editar tarefa · ${nomeDoCliente} · etapa ${numeroDaEtapa}, ${etapas[numeroDaEtapa - 1]?.nome ?? ''} · ${tarefa.obrigatoria ? 'obrigatória' : 'opcional'}`
  const prazo = tarefa.vence_em ? prazoEmPalavras(tarefa, s) : null
  // Quem fechou e quando: para quem marca, embaixo das abas ("Não se aplica por Ana em 14/11/2026"); para os outros, com o
  // selo.
  const fechadaPor = feitaPorEm(tarefa)
  const quem = (tarefa.estado === 'feita' || naoSeAplica) && (podeMarcar ? (
    <p className="text-muted-foreground text-legenda">
      {fechadaPor.startsWith('por ') ? `${naoSeAplica ? 'Não se aplica' : 'Feita'} ${fechadaPor}` : fechadaPor.charAt(0).toUpperCase() + fechadaPor.slice(1)}
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {naoSeAplica ? <SeloDaSituacao tarefa={tarefa} situacao={s} /> : <Badge variant="positive"><Check /> Feita</Badge>}
      <span className="text-muted-foreground text-legenda">{fechadaPor}</span>
    </div>
  ))
  const tempo = linhaDoTempo(tarefa)

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={tarefa.titulo} descricao={detalhe} icone={ClipboardCheck} largura="xl"
      enviando={enviando} tentativa={tentativa} alterado={alterado} form="form-tarefa"
      rotuloEnviar={podeMarcar ? 'Salvar' : undefined} rodape={podeMarcar ? undefined : <BotaoCancelar>Fechar</BotaoCancelar>}>
      <form id="form-tarefa" noValidate onSubmit={salvar} className="space-y-5">
        <div className="bg-muted/60 flex items-start gap-2.5 rounded-xl px-3 py-2.5">
          <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            {tarefa.descricao && <p className="text-corpo break-words">{tarefa.descricao}</p>}
            <p className="text-muted-foreground text-legenda">Vem do modelo: o título e a descrição mudam no modelo.</p>
          </div>
        </div>

        <SecaoFormulario titulo="Situação">
          {podeMarcar ? (
            <AbasSegmentadas rotulo="Situação" valor={situacao} aoMudar={setSituacao} abas={SITUACOES.map((aba) => ({
              ...aba, desligada: espera.length > 0 && precisaDasDependencias(aba.valor, tarefa.estado),
            }))} />
          ) : !quem && (SeloDaSituacao({ tarefa, situacao: s }) ?? <p className="text-corpo">A fazer</p>)}
          {quem}
          {podeMarcar && espera.length > 0 && (
            <p className="text-muted-foreground flex items-start gap-2 text-rotulo">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{textoDaEspera({ espera })}.</span>
            </p>
          )}
          {tempo && (
            <p className="text-muted-foreground flex items-start gap-2 text-rotulo">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [&_strong]:text-foreground [&_strong]:font-semibold">{tempo}</span>
            </p>
          )}
        </SecaoFormulario>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="min-w-0 space-y-5">
            {podeMarcar && situacao === 'nao_se_aplica' && (
              <CampoDoMotivo id={idMotivo} valor={motivo} aoMudar={setMotivo} erro={erros.motivo}
                dica={naoSeAplica ? 'Trocar o motivo grava "Motivo trocado" no Histórico do cliente.' : oQueAcontece(espera)} />
            )}
            {!podeMarcar && naoSeAplica && (
              <section aria-labelledby={`${idMotivo}-titulo`} className="space-y-1">
                <h3 id={`${idMotivo}-titulo`} className="section-label flex items-center gap-1.5"><Ban className="size-3.5" aria-hidden="true" /> Motivo</h3>
                <p className="text-corpo break-words">{tarefa.motivo}</p>
              </section>
            )}
            <section aria-labelledby={`${idNota}-prazo`} className="space-y-2">
              <h3 id={`${idNota}-prazo`} className="section-label">Prazo</h3>
              <CartaoDaSecao className="space-y-0.5 p-3">
                {prazo ? (
                  <>
                    <p className="text-corpo"><strong className="font-semibold">{prazo.texto}</strong> · {prazo.situacao.charAt(0).toLowerCase() + prazo.situacao.slice(1)}</p>
                    <p className="text-muted-foreground text-legenda tabular-nums">
                      {dataPorExtenso(tarefa.vence_em)} · dia {tarefa.prazo_dias} a partir de {formatarDia(inicio)}
                    </p>
                  </>
                ) : <p className="text-corpo">Sem prazo</p>}
              </CartaoDaSecao>
            </section>
            {podeMarcar ? (
              <Campo id={idNota} rotulo="Nota (opcional)">
                <Textarea id={idNota} rows={3} maxLength={MAXIMO} value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ex.: faltam os extratos de setembro" />
                <span className="text-muted-foreground justify-self-end text-legenda tabular-nums">{nota.length}/{MAXIMO}</span>
              </Campo>
            ) : (
              <section aria-labelledby={`${idNota}-nota`} className="space-y-1">
                <h3 id={`${idNota}-nota`} className="section-label">Nota</h3>
                <p className={cn('text-corpo break-words', !tarefa.nota && 'text-muted-foreground')}>{tarefa.nota || 'Sem nota.'}</p>
              </section>
            )}
          </div>
          <div className="min-w-0 space-y-6">
            <ComentariosDaTarefa tarefaId={tarefa.id} total={tarefa.comentarios ?? 0} rascunho={rascunho} aoMudarRascunho={setRascunho}
              aoEditar={setEditandoComentario} erroDaEdicao={erros.comentario} aoMexer={aoMexer} />
            <HistoricoDaTarefa tarefaId={tarefa.id} />
          </div>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
