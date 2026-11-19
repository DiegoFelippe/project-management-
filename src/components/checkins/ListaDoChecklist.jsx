import { ListaVazia } from '@/components/comum/Tabela'
import { BarraDeProgresso } from './CartaoDoModelo'
import LinhaDaTarefa from './LinhaDaTarefa'
import { contagemDaEtapa, entraNoFiltro, estaResolvida } from './situacao'

const VAZIO = {
  feitas: 'Nenhuma tarefa feita ainda.',
  pendentes: 'Tudo resolvido: nenhuma tarefa pendente.',
  nao_se_aplica: 'Nenhuma tarefa marcada como "não se aplica".',
}

// O check-list em lista: um cartão por etapa (número, nome, a contagem — "3 de 5 feitas", ou "4 de 5 resolvidas" quando
// alguma não se aplica — e a barra das resolvidas) com as tarefas na ordem do modelo, uma LinhaDaTarefa cada (o check, o
// título, o selo, o prazo e as ações; o resto fica no Editar). `filtro` ('todas' | 'pendentes' | 'feitas' |
// 'nao_se_aplica') roda na tela: o check-list já veio inteiro; etapa sem nenhuma tarefa no filtro some. `inicio`: o
// início dos prazos (o balão do prazo). `ocupadas`: as tarefas que estão indo para o banco agora. `aoMarcar`,
// `aoNaoSeAplica` e `aoEditar` precisam ser estáveis (useCallback) para o memo das linhas.
export default function ListaDoChecklist({
  etapas, tarefas, situacoes, filtro, inicio, podeMarcar, podeComentar, ocupadas, aoMarcar, aoNaoSeAplica, aoEditar,
}) {
  const daEtapa = new Map(etapas.map((e) => [e.id, []]))
  for (const t of tarefas) daEtapa.get(t.etapa_id)?.push(t)
  const entra = (t) => entraNoFiltro(t, filtro)

  const blocos = etapas.map((etapa, i) => {
    const todas = daEtapa.get(etapa.id)
    const mostradas = todas.filter(entra)
    if (!mostradas.length) return null
    const resolvidas = todas.filter(estaResolvida).length
    const pct = todas.length ? Math.round((resolvidas / todas.length) * 100) : 0
    const nome = `${i + 1} · ${etapa.nome}`
    return (
      <section key={etapa.id} aria-label={nome} className="card min-w-0 overflow-hidden">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
          <span className="bg-primary-cheio text-primary-foreground grid size-7 shrink-0 place-items-center rounded-lg text-rotulo font-bold tabular-nums">
            {i + 1}
          </span>
          <h3 className="min-w-0 flex-1 text-subtitulo font-semibold break-words">{etapa.nome}</h3>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-legenda font-semibold tabular-nums">{contagemDaEtapa(todas)}</span>
            <BarraDeProgresso pct={pct} rotulo={`Progresso de ${etapa.nome}`} className="h-1.5 w-20 sm:w-28" />
          </div>
        </header>
        <ul aria-label={`Tarefas de ${etapa.nome}`} className="divide-y">
          {mostradas.map((t) => (
            <LinhaDaTarefa key={t.id} tarefa={t} situacao={situacoes.get(t.id)} inicio={inicio} podeMarcar={podeMarcar}
              podeComentar={podeComentar} ocupada={ocupadas.has(t.id)} aoMarcar={aoMarcar} aoNaoSeAplica={aoNaoSeAplica} aoEditar={aoEditar} />
          ))}
        </ul>
      </section>
    )
  }).filter(Boolean)

  if (!blocos.length) return <ListaVazia>{VAZIO[filtro] ?? 'Nenhuma tarefa neste check-list.'}</ListaVazia>
  return <div className="grid min-w-0 grid-cols-1 gap-4">{blocos}</div>
}
