import { useEffect, useState } from 'react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { listarEventos } from '@/data/clientes'
import { textoDoEvento } from './rotulos'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Tabela Histórico do cliente (quando, o quê, quem), paginada no banco. Os nomes já vêm filtrados pelo banco.
// versao muda quando a página mudou algo (para recarregar).
export default function HistoricoDoCliente({ clienteId, versao }) {
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let ativo = true
    listarEventos(clienteId, { pagina })
      .then((r) => {
        if (!ativo) return
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o histórico.'))
    return () => {
      ativo = false
    }
  }, [clienteId, pagina, versao])

  const itens = resultado?.itens ?? null
  return (
    <section aria-labelledby="titulo-historico" className="grid gap-2">
      <h2 id="titulo-historico" className="text-lg font-semibold">Histórico</h2>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando o histórico…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>Nada no histórico ainda.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Histórico" colunas={['Quando', 'O quê', 'Quem']} larguraMinima={520}
          paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
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
