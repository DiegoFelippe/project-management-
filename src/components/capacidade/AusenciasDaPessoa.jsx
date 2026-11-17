import { useEffect, useState } from 'react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { listarAusencias } from '@/data/capacidade'
import { formatarDia } from '@/lib/mes'

// Tabela paginada (no banco) das ausências de uma pessoa. `acoes(ausencia)` desenha os botões da linha;
// sem ele a lista é só de leitura. `versao` muda para recarregar.
export default function AusenciasDaPessoa({ perfilId, versao = 0, acoes }) {
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let ativo = true
    listarAusencias(perfilId, { pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as ausências.'))
    return () => {
      ativo = false
    }
  }, [perfilId, pagina, versao])

  if (erro) return <p role="alert" className="text-corpo text-destructive">{erro}</p>
  if (!resultado) return <GraficoCarregando texto="Carregando as ausências…" className="py-6" />
  if (resultado.itens.length === 0) return <ListaVazia>Nenhuma ausência registrada.</ListaVazia>
  return (
    <Tabela rotulo="Ausências" colunas={['De', 'Até', 'Motivo']} larguraMinima={420}
      paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
      {resultado.itens.map((a) => (
        <Linha key={a.id}>
          <Celula className="tabular-nums">{formatarDia(a.de)}</Celula>
          <Celula className="tabular-nums">{formatarDia(a.ate)}</Celula>
          <Celula className="text-muted-foreground">{a.motivo}</Celula>
          <CelulaAcoes>{acoes?.(a)}</CelulaAcoes>
        </Linha>
      ))}
    </Tabela>
  )
}
