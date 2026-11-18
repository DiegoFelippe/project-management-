import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert } from 'lucide-react'
import CampoNumero from '@/components/campos/CampoNumero'
import Chave from '@/components/campos/Chave'
import { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { juntar, plural } from '@/lib/nomes'
import { cn } from '@/lib/utils'
import EscolherDependencias from './EscolherDependencias'
import {
  LIMITES, acrescentarEtapa, acrescentarTarefa, alternarDependencia, dependentesDe, moverEtapa, moverTarefa, mudarEtapa,
  mudarTarefa, tirarEtapa, tirarTarefas,
} from './modelo'

const PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
const nome = (texto, reserva) => texto?.trim() || reserva

function BotaoIcone({ rotulo, icone: Icone, perigo, ...props }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={rotulo} title={rotulo} className={cn('shrink-0', perigo && PERIGO)} {...props}>
      <Icone aria-hidden="true" />
    </Button>
  )
}

// Confirmação dentro da própria etapa ou tarefa (Manter recebe o foco), dizendo o que sai junto. Esc com o foco aqui
// desiste só dela: ouvido na janela e na captura, para chegar antes do Esc da janela do modelo (que fecharia tudo).
function ConfirmarNaLinha({ base, id, texto, rotulo, aoManter, aoApagar }) {
  const caixa = useRef(null)
  const manter = useRef(aoManter)
  useEffect(() => { manter.current = aoManter })
  useEffect(() => {
    const tecla = (e) => {
      if (e.key !== 'Escape' || !caixa.current?.contains(document.activeElement)) return
      e.stopPropagation()
      e.preventDefault()
      manter.current()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])
  return (
    <div ref={caixa} role="alert" className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
      <p className="min-w-0 flex-1 basis-56 text-rotulo">{texto}</p>
      <Button id={`${base}-manter-${id}`} type="button" variant="outline" size="sm" onClick={aoManter}>Manter</Button>
      <Button type="button" variant="destructive" size="sm" onClick={aoApagar}><Trash2 /> {rotulo}</Button>
    </div>
  )
}

// Uma tarefa do editor. Só redesenha quando a própria tarefa ou o que se mostra dela muda (as props são valores simples,
// os chips contam pela chave do conteúdo e as ações são estáveis): digitar numa tarefa não redesenha as outras 499.
const mesmaTarefa = (antes, depois) => Object.keys(depois).every((k) => k === 'chips' || Object.is(antes[k], depois[k]))
const TarefaDoEditor = memo(function TarefaDoEditor({
  base, tarefa: t, ordem, primeira, ultima, erro, invalida, chips, confirmacao, acoes,
}) {
  const id = (parte) => `${base}-${parte}-${t.id}`
  return (
    <li aria-label={`Tarefa ${ordem}`} data-erro={erro || invalida || undefined}
      className={cn('bg-card space-y-2.5 rounded-xl border p-2.5 sm:p-3', (erro || invalida) && 'border-destructive/60 ring-destructive/15 ring-2')}>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span title={`Tarefa ${ordem}`} className="bg-muted text-muted-foreground grid h-6 min-w-6 shrink-0 place-items-center rounded-md px-1 text-mini tabular-nums">
          {ordem}
        </span>
        <Input id={id('tt')} aria-label={`Título da tarefa ${ordem}`} value={t.titulo} maxLength={LIMITES.titulo}
          placeholder="Título (ex.: Análise do DRE)" aria-invalid={(erro && !t.titulo.trim()) || undefined}
          className="min-w-40 flex-1 basis-40 font-medium" onChange={(e) => acoes.tarefa(t.id, { titulo: e.target.value })} />
        {/* Sem espaço para o título (celular), os botões descem para a linha de baixo, à direita. */}
        <div className="ml-auto flex shrink-0 items-center">
          <BotaoIcone id={id('sobe')} rotulo={`Subir a tarefa ${ordem}`} icone={ChevronUp} disabled={primeira} onClick={() => acoes.moverTarefa(t.id, -1)} />
          <BotaoIcone id={id('desce')} rotulo={`Descer a tarefa ${ordem}`} icone={ChevronDown} disabled={ultima} onClick={() => acoes.moverTarefa(t.id, 1)} />
          <BotaoIcone id={id('apagar')} rotulo={`Apagar a tarefa ${ordem}`} icone={Trash2} perigo onClick={() => acoes.apagarTarefa(t.id)} />
        </div>
      </div>
      {confirmacao && (
        <ConfirmarNaLinha base={base} id={t.id} texto={confirmacao} rotulo="Apagar tarefa" aoManter={() => acoes.manter(id('apagar'))}
          aoApagar={() => acoes.confirmarTarefa(t.id)} />
      )}
      <Input aria-label={`Descrição da tarefa ${ordem}`} value={t.descricao} maxLength={LIMITES.descricaoDaTarefa}
        placeholder="Descrição curta (opcional)" className="h-8" onChange={(e) => acoes.tarefa(t.id, { descricao: e.target.value })} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Chave ligada={t.obrigatoria} aoMudar={(ligada) => acoes.tarefa(t.id, { obrigatoria: ligada })}
          rotulo={<>Obrigatória <span className="sr-only">(tarefa {ordem})</span></>} />
        <div className="flex items-center gap-2">
          <Label htmlFor={id('pz')} className="text-muted-foreground shrink-0">Prazo: dia <span className="sr-only">(tarefa {ordem})</span></Label>
          <CampoNumero id={id('pz')} valor={t.prazo_dias} min={0} max={LIMITES.prazo} aoMudar={(v) => acoes.tarefa(t.id, { prazo_dias: v })} />
        </div>
        <EscolherDependencias id={id('dep')} titulo={t.titulo} chips={chips} marcadas={t.depende_de}
          anteriores={() => acoes.anteriores(t.id)} aoAlternar={(dep) => acoes.alternar(t.id, dep)} aoTirar={(dep) => acoes.alternar(t.id, dep)} />
      </div>
      {invalida && (
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-rotulo">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Depende de uma tarefa que agora vem depois dela. Mova uma das duas ou tire a dependência.
        </p>
      )}
    </li>
  )
}, mesmaTarefa)

// A coluna das etapas e tarefas da janela do modelo, na ordem em que o consultor segue. `mudar(f)` aplica `f(rascunho)`
// (o setState de quem chama); `erros` ({ etapas, tarefas }: Sets de ids, do validarModelo) destaca o que impede salvar.
// Etapa: nome, subir/descer, apagar (com tarefas, pede confirmação). Tarefa: título, descrição, obrigatória, prazo,
// "depende de" (só as que vêm antes), subir/descer (atravessa etapas) e apagar (se outras dependem dela, pede
// confirmação). Uma dependência que passou a apontar para depois (ao mover) fica marcada na hora.
export default function EditorDeEtapas({ rascunho, mudar, erros }) {
  const base = useId()
  // O rascunho do último desenho, para as ações (estáveis) lerem na hora do clique.
  const atual = useRef(rascunho)
  useLayoutEffect(() => { atual.current = rascunho })
  const [armado, setArmado] = useState(null) // { tipo: 'etapa' | 'tarefa', id }: a confirmação aberta
  const focarDepois = useRef(null)

  // Depois de mover, criar ou apagar, o foco vai para onde a pessoa continua (o botão desligado cede para o título).
  useEffect(() => {
    const alvo = focarDepois.current
    if (!alvo) return
    focarDepois.current = null
    const [quem, reserva] = Array.isArray(alvo) ? alvo : [alvo]
    const el = document.getElementById(quem)
    if (el && !el.disabled) el.focus()
    else if (reserva) document.getElementById(reserva)?.focus()
  })

  const acoes = useMemo(() => {
    const id = (parte, quem) => `${base}-${parte}-${quem}`
    return {
      etapa: (etapaId, nomeNovo) => mudar((r) => mudarEtapa(r, etapaId, { nome: nomeNovo })),
      tarefa: (tarefaId, mudancas) => mudar((r) => mudarTarefa(r, tarefaId, mudancas)),
      alternar: (tarefaId, dep) => mudar((r) => alternarDependencia(r, tarefaId, dep)),
      moverTarefa: (tarefaId, direcao) => {
        focarDepois.current = [id(direcao < 0 ? 'sobe' : 'desce', tarefaId), id('tt', tarefaId)]
        mudar((r) => moverTarefa(r, tarefaId, direcao))
      },
      moverEtapa: (etapaId, direcao) => {
        focarDepois.current = [id(direcao < 0 ? 'sobe-etapa' : 'desce-etapa', etapaId), id('en', etapaId)]
        mudar((r) => moverEtapa(r, etapaId, direcao))
      },
      novaEtapa: () => {
        const { rascunho: novo, id: etapaId } = acrescentarEtapa(atual.current)
        focarDepois.current = id('en', etapaId)
        mudar(() => novo)
      },
      novaTarefa: (etapaId) => {
        const { rascunho: novo, id: tarefaId } = acrescentarTarefa(atual.current, etapaId)
        focarDepois.current = id('tt', tarefaId)
        mudar(() => novo)
      },
      apagarEtapa: (etapaId) => {
        if (atual.current.etapas.find((e) => e.id === etapaId)?.tarefas.length) {
          focarDepois.current = id('manter', etapaId)
          setArmado({ tipo: 'etapa', id: etapaId })
        } else {
          focarDepois.current = `${base}-nova-etapa`
          mudar((r) => tirarEtapa(r, etapaId))
        }
      },
      confirmarEtapa: (etapaId) => {
        focarDepois.current = `${base}-nova-etapa`
        setArmado(null)
        mudar((r) => tirarEtapa(r, etapaId))
      },
      apagarTarefa: (tarefaId) => {
        const etapaId = atual.current.etapas.find((e) => e.tarefas.some((t) => t.id === tarefaId))?.id
        if (dependentesDe(atual.current, tarefaId).length) {
          focarDepois.current = id('manter', tarefaId)
          setArmado({ tipo: 'tarefa', id: tarefaId })
        } else {
          focarDepois.current = id('nt', etapaId)
          mudar((r) => tirarTarefas(r, [tarefaId]))
        }
      },
      confirmarTarefa: (tarefaId) => {
        focarDepois.current = id('nt', atual.current.etapas.find((e) => e.tarefas.some((t) => t.id === tarefaId))?.id)
        setArmado(null)
        mudar((r) => tirarTarefas(r, [tarefaId]))
      },
      manter: (voltarPara) => {
        focarDepois.current = voltarPara
        setArmado(null)
      },
      // As tarefas que vêm antes desta, por etapa (lido ao abrir o "Depende de").
      anteriores: (tarefaId) => {
        const grupos = []
        let ordem = 0
        for (const [i, e] of atual.current.etapas.entries()) {
          const tarefas = []
          for (const t of e.tarefas) {
            if (t.id === tarefaId) {
              if (tarefas.length) grupos.push({ etapa: { id: e.id, nome: e.nome, numero: i + 1 }, tarefas })
              return grupos
            }
            ordem += 1
            tarefas.push({ id: t.id, ordem, titulo: t.titulo })
          }
          if (tarefas.length) grupos.push({ etapa: { id: e.id, nome: e.nome, numero: i + 1 }, tarefas })
        }
        return grupos
      },
    }
  }, [base, mudar])

  // A ordem do modelo inteiro e quem é cada tarefa (para os números, os chips e a marca de "vem depois").
  const ordem = new Map()
  const porId = new Map()
  for (const e of rascunho.etapas) for (const t of e.tarefas) { ordem.set(t.id, ordem.size + 1); porId.set(t.id, t) }
  const total = ordem.size
  const ultimaEtapa = rascunho.etapas.length - 1
  // Os limites do banco: sem tarefa nova (nem etapa nova, que já vem com uma) em 500 tarefas; sem etapa nova em 50.
  const cheioDeTarefas = total >= LIMITES.tarefas
  const cheioDeEtapas = rascunho.etapas.length >= LIMITES.etapas
  const limite = cheioDeTarefas ? `O modelo chegou ao limite de ${plural(LIMITES.tarefas, 'tarefa', 'tarefas')}.`
    : cheioDeEtapas ? `O modelo chegou ao limite de ${plural(LIMITES.etapas, 'etapa', 'etapas')}.` : null
  const idDoLimite = `${base}-limite`

  // Os chips de cada tarefa e a chave do conteúdo deles (a tarefa memorizada compara a chave, não o objeto).
  function chipsDe(t) {
    const chips = t.depende_de.map((d) => ({
      id: d, ordem: ordem.get(d) ?? '?', titulo: porId.get(d)?.titulo ?? '',
      invalida: !ordem.has(d) || ordem.get(d) >= ordem.get(t.id),
    }))
    return { chips, chave: chips.map((c) => `${c.id}\u0001${c.ordem}\u0001${c.titulo}\u0001${c.invalida}`).join('\u0002') }
  }

  function confirmacaoDaTarefa(t) {
    if (armado?.tipo !== 'tarefa' || armado.id !== t.id) return null
    const quem = dependentesDe(rascunho, t.id).map((x) => nome(x.titulo, 'Sem título'))
    if (!quem.length) return `Apagar "${nome(t.titulo, 'Sem título')}"?`
    return `Apagar "${nome(t.titulo, 'Sem título')}"? ${juntar(quem.map((x) => `"${x}"`))} ${quem.length === 1 ? 'deixa' : 'deixam'} de depender dela.`
  }

  return (
    <SecaoFormulario titulo="Etapas e tarefas, na ordem em que o consultor segue">
      {rascunho.etapas.map((e, ei) => {
        const n = ei + 1
        const erroDaEtapa = erros?.etapas.has(e.id) ?? false
        return (
          <section key={e.id} aria-label={`Etapa ${n}`} data-erro={erroDaEtapa || undefined}
            className={cn('bg-muted/40 min-w-0 space-y-3 rounded-2xl border p-2.5 sm:p-3', erroDaEtapa && 'border-destructive/60 ring-destructive/15 ring-2')}>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="bg-primary-cheio text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md text-mini tabular-nums">{n}</span>
              <Input id={`${base}-en-${e.id}`} aria-label={`Nome da etapa ${n}`} value={e.nome} maxLength={LIMITES.etapa}
                placeholder="Nome da etapa (ex.: Diagnóstico)" aria-invalid={(erroDaEtapa && !e.nome.trim()) || undefined}
                className="min-w-40 flex-1 basis-40 font-semibold" onChange={(ev) => acoes.etapa(e.id, ev.target.value)} />
              <div className="ml-auto flex shrink-0 items-center">
                <span className="text-muted-foreground mr-1 text-legenda tabular-nums">
                  {e.tarefas.length ? plural(e.tarefas.length, 'tarefa', 'tarefas') : 'Nenhuma tarefa'}
                </span>
                <BotaoIcone id={`${base}-sobe-etapa-${e.id}`} rotulo={`Subir a etapa ${n}`} icone={ChevronUp} disabled={ei === 0}
                  onClick={() => acoes.moverEtapa(e.id, -1)} />
                <BotaoIcone id={`${base}-desce-etapa-${e.id}`} rotulo={`Descer a etapa ${n}`} icone={ChevronDown} disabled={ei === ultimaEtapa}
                  onClick={() => acoes.moverEtapa(e.id, 1)} />
                <BotaoIcone id={`${base}-apagar-etapa-${e.id}`} rotulo={`Apagar a etapa ${n}`} icone={Trash2} perigo
                  onClick={() => acoes.apagarEtapa(e.id)} />
              </div>
            </div>
            {armado?.tipo === 'etapa' && armado.id === e.id && (
              <ConfirmarNaLinha base={base} id={e.id} rotulo="Apagar etapa"
                texto={`Apagar a etapa "${nome(e.nome, 'sem nome')}" e ${plural(e.tarefas.length, 'tarefa', 'tarefas')} dela? As dependências para essas tarefas também saem.`}
                aoManter={() => acoes.manter(`${base}-apagar-etapa-${e.id}`)} aoApagar={() => acoes.confirmarEtapa(e.id)} />
            )}
            {e.tarefas.length > 0 && (
              <ol className="space-y-2">
                {e.tarefas.map((t, ti) => {
                  const { chips, chave } = chipsDe(t)
                  return (
                    <TarefaDoEditor key={t.id} base={base} tarefa={t} ordem={ordem.get(t.id)} acoes={acoes}
                      primeira={ei === 0 && ti === 0} ultima={ei === ultimaEtapa && ti === e.tarefas.length - 1}
                      erro={erros?.tarefas.has(t.id) ?? false} invalida={chips.some((c) => c.invalida)} chips={chips}
                      chaveDosChips={chave} confirmacao={confirmacaoDaTarefa(t)} />
                  )
                })}
              </ol>
            )}
            <Button id={`${base}-nt-${e.id}`} type="button" variant="ghost" size="sm" disabled={cheioDeTarefas}
              aria-describedby={cheioDeTarefas ? idDoLimite : undefined} onClick={() => acoes.novaTarefa(e.id)}>
              <Plus /> Tarefa nesta etapa
            </Button>
          </section>
        )
      })}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button id={`${base}-nova-etapa`} type="button" variant="outline" disabled={cheioDeEtapas || cheioDeTarefas}
          aria-describedby={limite ? idDoLimite : undefined} onClick={acoes.novaEtapa}>
          <Plus /> Nova etapa
        </Button>
        {limite && <p id={idDoLimite} className="text-muted-foreground text-legenda">{limite}</p>}
      </div>
    </SecaoFormulario>
  )
}
