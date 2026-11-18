import { useId, useState } from 'react'
import { Ban, Check, ClipboardCheck, Lock, Play, Undo2 } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import JanelaFormulario, { CartaoDaSecao, SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MOTIVO_OBRIGATORIO } from '@/lib/erros'
import { formatarDia } from '@/lib/mes'
import { juntar, plural } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import { SelosDaTarefa } from './ListaDoChecklist'
import { estaResolvida, feitaPorEm, rotuloDaSituacao } from './situacao'

const MAXIMO_DA_NOTA = 500
const MAXIMO_DO_MOTIVO = 500

// A cor de cada situação (a bolinha das tarefas relacionadas), a mesma do fluxograma.
const PINTA = {
  feita: 'bg-positive', andamento: 'bg-primary', livre: 'bg-input', bloqueada: 'bg-muted-foreground/40', hoje: 'bg-notice',
  atrasada: 'bg-destructive',
}

// O que cada botão manda e o texto dele enquanto grava.
const ACOES = {
  comecar: { estado: 'andamento', rotulo: 'Começar', andando: 'Começando…', icone: Play },
  feita: { estado: 'feita', rotulo: 'Marcar como feita', andando: 'Marcando…', icone: Check },
  voltar: { estado: 'a_fazer', rotulo: 'Voltar para a fazer', andando: 'Voltando…', icone: Undo2 },
  reabrir: { estado: 'a_fazer', rotulo: 'Reabrir tarefa', andando: 'Reabrindo…', icone: Undo2 },
  nota: { estado: null, rotulo: 'Salvar nota', andando: 'Salvando…', icone: Check },
  // Com o motivo aberto (o botão do corpo some), o principal repete o nome da ação; curto para caber a 360 px.
  naoSeAplica: { estado: 'nao_se_aplica', rotulo: 'Não se aplica', andando: 'Marcando…', icone: Ban },
}

function situacaoEmPalavras(tarefa, s) {
  if (estaResolvida(tarefa)) return feitaPorEm(tarefa)
  if (s.faltam === null) return 'Sem prazo'
  if (s.atrasada) return `Atrasada há ${plural(-s.faltam, 'dia', 'dias')}`
  if (s.venceHoje) return 'Vence hoje'
  return `Faltam ${plural(s.faltam, 'dia', 'dias')}`
}

function Relacionadas({ rotulo, tarefas, situacoes, vazio, aoAbrir }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="section-label">{rotulo}</p>
      {tarefas.length ? (
        <ul aria-label={rotulo} className="space-y-1">
          {tarefas.map((t) => {
            const s = situacoes.get(t.id)
            return (
              <li key={t.id}>
                <button type="button" onClick={() => aoAbrir(t)}
                  className="botao-animado hover:bg-accent flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-[background-color,translate,scale] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
                  {s?.cor === 'nao_se_aplica'
                    ? <Ban aria-hidden="true" className="text-muted-foreground size-3 shrink-0" strokeWidth={2.5} />
                    : <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', PINTA[s?.cor] ?? PINTA.livre)} />}
                  <span className="min-w-0 flex-1 truncate text-rotulo font-medium">{t.titulo}</span>
                  <span className="text-muted-foreground shrink-0 text-legenda">{s ? rotuloDaSituacao(t, s) : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-rotulo">{vazio}</p>
      )}
    </div>
  )
}

// Janela da tarefa do check-list do cliente: onde ela está (cliente, etapa, obrigatória ou opcional), os selos, a
// descrição, o prazo e a situação, do que ela depende e o que ela libera (clicáveis: abrem aquela tarefa), o motivo (na
// que não se aplica) e a nota.
// Para quem marca (o consultor do cliente) o rodapé muda com a situação: a fazer → Começar e Marcar como feita; em
// andamento → Voltar para a fazer e Marcar como feita; feita ou não se aplica → Reabrir tarefa e Salvar nota; bloqueada →
// Salvar nota (e Voltar para a fazer se já tinha começado). Para os outros: Fechar, e a nota e o motivo só para ler.
// "Não se aplica" (a fazer ou em andamento, não bloqueada): o botão no corpo abre o campo Motivo (obrigatório, até 500
// letras, o erro embaixo do campo) e o rodapé vira Cancelar, Voltar (sai do motivo) e Não se aplica (grava).
// `aoAgir({ estado, nota, motivo? })` grava (estado nulo = só a nota; motivo só no "não se aplica") e devolve { erro };
// sem erro, a janela fecha. `situacoes`: a situação de cada tarefa (situacaoDaTarefa), por id.
export default function JanelaDaTarefa({ tarefa, etapas, tarefas, situacoes, nomeDoCliente, inicio, podeMarcar, aoAgir, aoAbrir, aoFechar }) {
  const [nota, setNota] = useState(tarefa.nota ?? '')
  const [acao, setAcao] = useState(null)
  const [erro, setErro] = useState(null)
  const [comMotivo, setComMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroDoMotivo, setErroDoMotivo] = useState(null)
  const idNota = useId()
  const idMotivo = useId()
  const s = situacoes.get(tarefa.id)
  const feita = tarefa.estado === 'feita'
  const naoSeAplica = tarefa.estado === 'nao_se_aplica'
  const resolvida = feita || naoSeAplica
  const bloqueada = !resolvida && s.bloqueada
  const podeNaoSeAplica = podeMarcar && !resolvida && !bloqueada
  const numeroDaEtapa = etapas.findIndex((e) => e.id === tarefa.etapa_id) + 1
  const etapa = etapas[numeroDaEtapa - 1]
  const porId = new Map(tarefas.map((t) => [t.id, t]))
  const dependeDe = (tarefa.depende_de ?? []).map((id) => porId.get(id)).filter(Boolean)
  const libera = tarefas.filter((t) => t.depende_de?.includes(tarefa.id))

  async function agir(chave) {
    if (acao) return
    const pedido = { estado: ACOES[chave].estado, nota }
    if (chave === 'naoSeAplica') {
      if (!motivo.trim()) {
        setErroDoMotivo(MOTIVO_OBRIGATORIO)
        document.getElementById(idMotivo)?.focus()
        return
      }
      pedido.motivo = motivo.trim()
    }
    setAcao(chave)
    setErro(null)
    const resposta = await aoAgir(pedido)
    setAcao(null)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  function sairDoMotivo() {
    setComMotivo(false)
    setMotivo('')
    setErroDoMotivo(null)
    setErro(null)
  }

  // O botão principal envia o formulário (Marcar como feita, Não se aplica ou Salvar nota); os outros são
  // botões comuns.
  let secundarias = []
  let principal = null
  if (podeMarcar) {
    if (resolvida) [secundarias, principal] = [['reabrir'], 'nota']
    else if (bloqueada) [secundarias, principal] = [tarefa.estado === 'andamento' ? ['voltar'] : [], 'nota']
    else if (comMotivo) [secundarias, principal] = [[], 'naoSeAplica']
    else [secundarias, principal] = [[tarefa.estado === 'andamento' ? 'voltar' : 'comecar'], 'feita']
  }
  // No celular os botões secundários ficam só com o ícone (o nome continua para o leitor de tela), como na janela do
  // cartão do quadro: Cancelar, o secundário e o principal cabem a 360 px.
  const conteudoDoBotao = (chave, secundario = false) => {
    const { rotulo, andando, icone: Icone } = ACOES[chave]
    if (acao === chave) return andando
    return <><Icone /> {secundario ? <span className="max-sm:sr-only">{rotulo}</span> : rotulo}</>
  }

  const detalhe = `${nomeDoCliente} · etapa ${numeroDaEtapa}, ${etapa?.nome ?? ''} · ${tarefa.obrigatoria ? 'obrigatória' : 'opcional'}`
  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={tarefa.titulo} descricao={detalhe} icone={ClipboardCheck} largura="lg"
      enviando={Boolean(acao)}
      rodape={podeMarcar ? (
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={Boolean(acao)}>Cancelar</Button>
          {comMotivo && (
            <Button type="button" variant="outline" disabled={Boolean(acao)} onClick={sairDoMotivo}>
              <Undo2 /> <span className="max-sm:sr-only">Voltar</span>
            </Button>
          )}
          {secundarias.map((chave) => (
            <Button key={chave} type="button" variant="outline" disabled={Boolean(acao)} onClick={() => agir(chave)}>
              {conteudoDoBotao(chave, true)}
            </Button>
          ))}
          <Button type="submit" form="form-tarefa" disabled={Boolean(acao)}>{conteudoDoBotao(principal)}</Button>
        </>
      ) : (
        <Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>
      )}>
      <form id="form-tarefa" noValidate onSubmit={(e) => { e.preventDefault(); if (principal) agir(principal) }} className="space-y-5">
        <div data-selos className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SelosDaTarefa tarefa={tarefa} situacao={s} />
        </div>
        {tarefa.descricao && <p className="text-corpo break-words">{tarefa.descricao}</p>}
        {bloqueada && podeMarcar && (
          <p className="bg-muted/60 flex items-start gap-2 rounded-xl border px-3 py-2 text-rotulo">
            <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">Ainda não dá para marcar: espera {juntar(s.espera.map((d) => d.titulo))}.</span>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <CartaoDaSecao className="p-3">
            <p className="section-label">Prazo</p>
            <p className="text-corpo tabular-nums">
              {tarefa.vence_em
                ? <><strong>{formatarDia(tarefa.vence_em)}</strong> · dia {tarefa.prazo_dias} a partir de {formatarDia(inicio)}</>
                : 'Sem prazo'}
            </p>
          </CartaoDaSecao>
          <CartaoDaSecao className="p-3">
            <p className="section-label">{feita ? 'Feita' : naoSeAplica ? 'Não se aplica' : 'Situação'}</p>
            <p className="text-corpo">{situacaoEmPalavras(tarefa, s)}</p>
          </CartaoDaSecao>
        </div>
        {naoSeAplica && (
          <section aria-labelledby={`${idMotivo}-titulo`} className="bg-muted/50 space-y-1 rounded-xl border px-3 py-2.5">
            <h3 id={`${idMotivo}-titulo`} className="section-label flex items-center gap-1.5">
              <Ban className="size-3.5" aria-hidden="true" /> Motivo
            </h3>
            <p className="text-corpo break-words">{tarefa.motivo}</p>
          </section>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Relacionadas rotulo="Depende de" tarefas={dependeDe} situacoes={situacoes} vazio="Nada: pode começar quando quiser." aoAbrir={aoAbrir} />
          <Relacionadas rotulo="Libera" tarefas={libera} situacoes={situacoes} vazio="Nenhuma tarefa espera por esta." aoAbrir={aoAbrir} />
        </div>
        {podeNaoSeAplica && !comMotivo && (
          <div className="bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2">
            <p className="text-muted-foreground min-w-0 flex-1 basis-48 text-rotulo">Esta tarefa não é necessária neste cliente?</p>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(acao)} onClick={() => setComMotivo(true)}>
              <Ban /> Não se aplica
            </Button>
          </div>
        )}
        {comMotivo && (
          <div className="bg-muted/40 grid gap-2 rounded-xl border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={idMotivo}>Motivo</Label>
              <span className="text-muted-foreground text-legenda tabular-nums">{motivo.length}/{MAXIMO_DO_MOTIVO}</span>
            </div>
            <Textarea id={idMotivo} rows={3} maxLength={MAXIMO_DO_MOTIVO} autoFocus required value={motivo}
              aria-invalid={erroDoMotivo ? true : undefined}
              aria-describedby={erroDoMotivo ? `${idMotivo}-erro ${idMotivo}-ajuda` : `${idMotivo}-ajuda`}
              placeholder="Ex.: o cliente já tem o DRE auditado deste ano"
              onChange={(e) => {
                setMotivo(e.target.value)
                if (erroDoMotivo && e.target.value.trim()) setErroDoMotivo(null)
              }} />
            {erroDoMotivo && <p id={`${idMotivo}-erro`} className="text-rotulo text-destructive">{erroDoMotivo}</p>}
            <p id={`${idMotivo}-ajuda`} className="text-muted-foreground text-legenda">
              A tarefa fecha sem ser feita e libera as que dependem dela. O motivo fica na tarefa e no Histórico do cliente,
              para a auditoria.
            </p>
          </div>
        )}
        {podeMarcar ? (
          <div className="grid gap-2">
            <Label htmlFor={idNota}>Nota (opcional)</Label>
            <textarea id={idNota} rows={3} maxLength={MAXIMO_DA_NOTA} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: faltam os extratos de setembro"
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 w-full rounded-md border px-3 py-2 texto-de-campo shadow-xs outline-none hover:border-primary/40 focus-visible:ring-4" />
          </div>
        ) : (
          <SecaoFormulario titulo="Nota">
            <p className={cn('text-corpo break-words', !tarefa.nota && 'text-muted-foreground')}>{tarefa.nota || 'Sem nota.'}</p>
          </SecaoFormulario>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
