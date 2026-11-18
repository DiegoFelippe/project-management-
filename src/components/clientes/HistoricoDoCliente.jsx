import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { listarEventos } from '@/data/clientes'
import { useListaPaginada } from '@/lib/useListaPaginada'
import { textoDoEvento } from './rotulos'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Uma página do histórico (função do banco, com limite e deslocamento): página que ficou vazia depois da primeira é a
// que deixou de existir, e o useListaPaginada volta para a 1.
const lerEventos = ({ clienteId, pagina }) => listarEventos(clienteId, { pagina })
  .then((r) => ({ ...r, foraDaFaixa: pagina > 1 && r.itens.length === 0 }))

// Tabela Histórico do cliente (quando, o quê, quem), paginada no banco. Os nomes já vêm filtrados pelo banco.
// versao muda quando a página mudou algo (para recarregar).
export default function HistoricoDoCliente({ clienteId, versao }) {
  const { itens, erro: falhou, paginacao } = useListaPaginada(lerEventos, { clienteId }, { versao })
  const erro = falhou ? 'Não foi possível carregar o histórico.' : null
  return (
    <section aria-labelledby="titulo-historico" className="grid grid-cols-1 gap-2">
      <h2 id="titulo-historico" className="text-janela font-bold">Histórico</h2>
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando o histórico…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>Nada no histórico ainda.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Histórico" colunas={['Quando', 'O quê', 'Quem']} larguraMinima={520} semAcoes
          paginacao={paginacao}>
          {itens.map((e) => (
            <Linha key={e.id}>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(e.em))}</Celula>
              <Celula className="font-medium">{textoDoEvento(e)}</Celula>
              <Celula className="text-muted-foreground">{e.autor ?? '—'}</Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </section>
  )
}
