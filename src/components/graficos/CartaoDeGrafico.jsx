import { useId, useState } from 'react'
import { ChartColumn, RotateCcw, Table } from 'lucide-react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Legenda from './Legenda'
import Leitura from './Leitura'
import TabelaDoGrafico from './TabelaDoGrafico'

// Cartão de todo gráfico (design 2026-11-17-graficos-do-inicio-e-do-cliente): título, a leitura (frase com o número
// que importa), a legenda (só com 2 ou mais itens) e o botão "Ver em tabela", que troca o gráfico pela TabelaDoGrafico
// com os mesmos números. O nome do botão é fixo e o estado é o aria-pressed (só o ícone e o title trocam); é o mesmo
// botão nos dois modos, então o foco fica nele.
// estado: 'carregando' | 'erro' (a frase e "Tentar de novo") | 'vazio' (a frase `vazio` no lugar do gráfico) |
// 'pronto'. Carregando, nada pula quando o gráfico chega: a área tem a `altura` do gráfico e as linhas da leitura e da
// legenda ficam reservadas (a da leitura, a menos que leitura={null}; a da legenda quando `legenda` já vem com 2 ou
// mais itens: passe a legenda fixa também enquanto carrega). `altura` é a do SVG do gráfico de dentro: quem monta o
// cartão passa a mesma que dá ao gráfico (padrões: GraficoDeColunas 210, GraficoDeLinha 200; barras em HTML, uma
// estimativa). `acoes`: botões ou links extras no topo (ex.: "Ver todos"). `atualizando`: trocou o período e o novo
// ainda não chegou; o gráfico de antes fica a 60%.
export default function CartaoDeGrafico({
  titulo, leitura, legenda, tabela, estado = 'pronto', vazio, erro, aoTentarDeNovo, acoes, altura = 210, atualizando = false,
  className, children,
}) {
  const idDoTitulo = useId()
  const [emTabela, setEmTabela] = useState(false)
  const pronto = estado === 'pronto'
  const mostrarTabela = pronto && emTabela && tabela

  return (
    <section aria-labelledby={idDoTitulo} className={cn('card flex min-w-0 flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idDoTitulo} className="text-subtitulo font-semibold">{titulo}</h2>
          {estado === 'carregando' && leitura !== null && (
            <span data-reserva="leitura" aria-hidden="true" className="mt-0.5 flex h-[18px] items-center">
              <span className="h-2.5 w-48 max-w-full rounded-full bg-muted" />
            </span>
          )}
          {estado !== 'carregando' && estado !== 'erro' && (Array.isArray(leitura) ? <Leitura partes={leitura} /> : leitura)}
        </div>
        {(acoes || (pronto && tabela)) && (
          <div className="flex shrink-0 items-center gap-1">
            {acoes}
            {pronto && tabela && (
              <Button type="button" variant="ghost" size="icon" aria-pressed={emTabela} onClick={() => setEmTabela((v) => !v)}
                aria-label="Ver em tabela" title={emTabela ? 'Ver gráfico' : 'Ver em tabela'}>
                {emTabela ? <ChartColumn aria-hidden="true" /> : <Table aria-hidden="true" />}
              </Button>
            )}
          </div>
        )}
      </div>

      {pronto && !mostrarTabela && legenda?.length >= 2 && <Legenda itens={legenda} />}
      {estado === 'carregando' && legenda?.length >= 2 && (
        <span data-reserva="legenda" aria-hidden="true" className="flex h-4 items-center">
          <span className="h-2 w-40 max-w-full rounded-full bg-muted" />
        </span>
      )}

      {estado === 'carregando' && (
        <div className="grid place-items-center" style={{ minHeight: altura }}>
          <GraficoCarregando texto="Carregando…" />
        </div>
      )}
      {estado === 'erro' && (
        <div role="alert" className="flex flex-col items-start gap-3 py-4">
          <p className="text-corpo text-destructive">{erro ?? 'Não foi possível carregar o gráfico.'}</p>
          {aoTentarDeNovo && (
            <Button type="button" variant="outline" size="sm" onClick={aoTentarDeNovo}>
              <RotateCcw aria-hidden="true" /> Tentar de novo
            </Button>
          )}
        </div>
      )}
      {estado === 'vazio' && <div className="py-6 text-corpo text-muted-foreground">{vazio}</div>}
      {pronto && (mostrarTabela
        ? <TabelaDoGrafico {...tabela} />
        : <div className={cn('min-w-0 transition-opacity duration-200', atualizando && 'opacity-60')}>{children}</div>)}
    </section>
  )
}
