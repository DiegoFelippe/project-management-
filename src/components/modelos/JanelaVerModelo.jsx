import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Copy, Eye, ListChecks, ListOrdered, Pencil, Workflow } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import { GraficoCarregando } from '@/components/comum/Carregando'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { lerModelo } from '@/data/modelos'
import { diaEmSP } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { juntar } from '@/lib/nomes'
import { ordemGlobal } from './modelo'
import PreviaDoFluxo from './PreviaDoFluxo'

const ABAS = [{ valor: 'lista', rotulo: 'Lista', icone: ListOrdered }, { valor: 'fluxo', rotulo: 'Fluxograma', icone: Workflow }]

// "depois da 1", "depois da 1 e da 3", "depois da 1, da 2 e da 4".
const depoisDe = (numeros) => `depois ${juntar(numeros.map((n) => `da ${n}`))}`

// O modelo só para ler (Ver, na lista de modelos): abas Lista (etapas e tarefas com prazo, opcional e "depois de") e
// Fluxograma. Rodapé: Fechar e, conforme quem vê, Editar e Duplicar (quem mexe no modelo) ou "Duplicar para a minha
// consultoria" (a gestão num modelo da Central). Arquivado: só Fechar. `aoEditar(modelo)` e `aoDuplicar(modelo)`
// recebem o modelo já lido.
export default function JanelaVerModelo({ modeloId, aoFechar, aoEditar, aoDuplicar }) {
  const [estado, setEstado] = useState({ carregando: true })
  const [aba, setAba] = useState('lista')
  const idBase = useId()
  const painel = useRef(null)
  function trocarAba(valor) {
    setAba(valor)
    painel.current?.closest('[data-slot="janela-corpo"]')?.scrollTo?.({ top: 0 })
  }

  useEffect(() => {
    let ativo = true
    lerModelo(modeloId).then(
      (modelo) => ativo && setEstado({ modelo }),
      () => ativo && setEstado({ erro: true }),
    )
    return () => { ativo = false }
  }, [modeloId])

  const m = estado.modelo
  const arquivado = Boolean(m?.arquivado_em)
  const ordem = useMemo(() => ordemGlobal(m ?? { etapas: [] }), [m])
  const etapasDoFluxo = useMemo(() => (m?.etapas ?? []).map((e) => ({ id: e.id, nome: e.nome })), [m])
  const tarefasDoFluxo = useMemo(() => (m?.etapas ?? []).flatMap((e) => e.tarefas.map((t) => ({ ...t, etapa_id: e.id }))), [m])

  const descricao = m
    ? `${m.consultoria?.nome ?? 'Todas as consultorias'} · criado por ${m.criado_por?.nome ?? '—'} em ${formatarDia(diaEmSP(m.criado_em))}${arquivado ? ' · arquivado' : ''}`
    : null

  const acoes = []
  if (m && !arquivado && m.pode_editar) {
    acoes.push(
      <Button key="duplicar" type="button" variant="outline" onClick={() => aoDuplicar(m)}><Copy /> Duplicar</Button>,
      <Button key="editar" type="button" onClick={() => aoEditar(m)}><Pencil /> Editar</Button>,
    )
  } else if (m && !arquivado && m.pode_duplicar) {
    acoes.push(<Button key="duplicar" type="button" onClick={() => aoDuplicar(m)}><Copy /> Duplicar para a minha consultoria</Button>)
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={m?.nome ?? 'Modelo de check-in'} descricao={descricao} icone={ListChecks}
      largura="5xl" alturaFixa={Boolean(m)}
      abas={m ? <AbasSegmentadas rotulo="Visualização do modelo" comoAbas idBase={idBase} abas={ABAS} valor={aba} aoMudar={trocarAba} /> : null}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar}>Fechar</Button>
          {acoes}
        </>
      )}>
      {estado.carregando && <GraficoCarregando texto="Carregando o modelo…" className="py-12" />}
      {estado.erro && <Aviso>Não foi possível carregar o modelo.</Aviso>}
      {!estado.carregando && !estado.erro && !m && <p className="text-muted-foreground text-corpo">Este modelo não está mais disponível.</p>}
      {m && (
        <div ref={painel} role="tabpanel" id={`${idBase}-painel-${aba}`} aria-labelledby={`${idBase}-aba-${aba}`} className="min-w-0 space-y-4">
          {m.descricao && <p className="text-muted-foreground text-corpo">{m.descricao}</p>}
          {!m.pode_editar && !m.pode_duplicar && (
            <p className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-rotulo">
              <Eye className="size-4 shrink-0" aria-hidden="true" />
              Só leitura: quem cria e muda os modelos é a Central ou a gestão da consultoria.
            </p>
          )}
          {aba === 'lista' ? m.etapas.map((e, ei) => {
            const titulo = `${ei + 1} · ${e.nome}`
            return (
              <section key={e.id} className="space-y-2">
                <h3 className="section-label">{titulo}</h3>
                <ol aria-label={titulo} className="divide-y rounded-xl border">
                  {e.tarefas.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="bg-muted text-muted-foreground mt-0.5 grid h-6 min-w-6 shrink-0 place-items-center rounded-md px-1 text-mini tabular-nums">
                        {ordem.get(t.id)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-corpo font-semibold">
                          <span className="min-w-0 break-words">{t.titulo}</span>
                          {!t.obrigatoria && <Badge variant="outline">Opcional</Badge>}
                        </p>
                        {t.descricao && <p className="text-muted-foreground text-rotulo">{t.descricao}</p>}
                        <p className="text-muted-foreground text-legenda tabular-nums">
                          Dia {t.prazo_dias} · {t.depende_de.length ? depoisDe(t.depende_de.map((d) => ordem.get(d)).filter(Boolean)) : 'pode começar logo'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )
          }) : (
            <PreviaDoFluxo etapas={etapasDoFluxo} tarefas={tarefasDoFluxo} rotulo={`Fluxograma do modelo ${m.nome}`} />
          )}
        </div>
      )}
    </JanelaFormulario>
  )
}
