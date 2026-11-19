import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { listarAusencias } from '@/data/capacidade'
import { formatarDia } from '@/lib/mes'
import { useListaPaginada } from '@/lib/useListaPaginada'

const lerAusencias = ({ perfilId, pagina }) => listarAusencias(perfilId, { pagina })

// Tabela paginada (no banco) das ausências de uma pessoa. `acoes(ausencia)` desenha os botões da linha;
// sem ele a lista é só de leitura. `versao` muda para recarregar.
export default function AusenciasDaPessoa({ perfilId, versao = 0, acoes }) {
  const { resultado, erro, paginacao } = useListaPaginada(lerAusencias, { perfilId }, { versao })

  if (erro) return <p role="alert" className="text-corpo text-destructive">Não foi possível carregar as ausências.</p>
  if (!resultado) return <GraficoCarregando texto="Carregando as ausências…" className="py-6" />
  if (resultado.itens.length === 0) return <ListaVazia>Nenhuma ausência registrada.</ListaVazia>
  return (
    <Tabela rotulo="Ausências" colunas={['De', 'Até', 'Motivo']} larguraMinima={420} semAcoes={!acoes} paginacao={paginacao}>
      {resultado.itens.map((a) => (
        <Linha key={a.id}>
          <Celula className="tabular-nums">{formatarDia(a.de)}</Celula>
          <Celula className="tabular-nums">{formatarDia(a.ate)}</Celula>
          <Celula className="text-muted-foreground">{a.motivo}</Celula>
          {acoes && <CelulaAcoes>{acoes(a)}</CelulaAcoes>}
        </Linha>
      ))}
    </Tabela>
  )
}
