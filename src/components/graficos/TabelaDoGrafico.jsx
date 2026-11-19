import { Celula, Linha, Tabela } from '@/components/comum/Tabela'

// A visão em tabela de um gráfico ("Ver em tabela"): a Tabela do projeto, só de leitura e sem paginação (são os mesmos
// pontos do gráfico, no máximo uns 31), com os mesmos números da dica. linhas: [[célula, …], …]; a primeira coluna é o
// nome (mês, semana, cliente) e as outras, números (tabular-nums). Larga demais para a tela, rola dentro do cartão.
export default function TabelaDoGrafico({ rotulo, colunas, linhas }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Tabela rotulo={rotulo} colunas={colunas} semAcoes semCartao larguraMinima={Math.max(280, colunas.length * 120)}>
        {linhas.map((linha, i) => (
          <Linha key={i}>
            {linha.map((celula, j) => <Celula key={j} className={j ? 'whitespace-nowrap tabular-nums' : undefined}>{celula}</Celula>)}
          </Linha>
        ))}
      </Tabela>
    </div>
  )
}
