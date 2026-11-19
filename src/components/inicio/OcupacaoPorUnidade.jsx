import { Link } from 'react-router'
import BarrasHorizontais from '@/components/graficos/BarrasHorizontais'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import { corDaPaleta } from '@/components/graficos/cores'
import { fraseDaOcupacao } from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const FOLGA = 0.7
// As faixas (pedido do Diego, 19/11): o fundo suave de cada uma e a barra no tom cheio da faixa em que o valor cai.
const COR_DA_FAIXA = { acima: 'var(--destructive-cheio)', serie: corDaPaleta('azul'), folga: 'var(--notice-cheio)' }
const zonasAte = (maximo) => [
  { ate: FOLGA, cor: 'var(--notice-soft)' },
  { ate: 1, cor: corDaPaleta('azul', 'suave') },
  { ate: maximo, cor: 'var(--destructive-soft)' },
]
const LEGENDA = [
  { forma: 'quadrado', cor: COR_DA_FAIXA.acima, texto: 'Acima de 100%' },
  { forma: 'quadrado', cor: COR_DA_FAIXA.serie, texto: '70% a 100%' },
  { forma: 'quadrado', cor: COR_DA_FAIXA.folga, texto: 'Folga (abaixo de 70%)' },
]

// Ocupação por consultoria (central) ou por consultor (gestão) (design "3."; de 19/11, em faixas): do mais ocupado ao
// menos, cada linha com as faixas de fundo (folga abaixo de 70%, 70% a 100%, acima) e a barra fina no tom da faixa do
// valor, com a marca do valor e a de 100%; acima, o alerta; folga, a seta. Até 12 (com mais, os 6 mais
// ocupados e os 6 com mais folga, separados por "… N no meio"); a leitura conta todos (ranking_resumo). O número é o do
// cartão: no Mês atual, reservado ÷ capacidade; no passado e no período, a utilização (realizado ÷ capacidade). Links
// de hoje: consultoria → Consultorias na aba Ocupação; consultor visível → a ficha em Usuários.
export default function OcupacaoPorUnidade({ painel, recorte: recorteAgora, erro = false, atualizando = false, aoTentarDeNovo }) {
  const recorte = painel?.recorte ?? recorteAgora
  const central = recorte === 'tudo'
  const passado = painel?.passado ?? false
  const nomeDoNumero = passado ? 'utilização' : 'ocupação'
  const titulo = `${passado ? 'Utilização' : 'Ocupação'} por ${central ? 'consultoria' : 'consultor'}`
  const ranking = painel?.ranking ?? []
  if (erro || !painel) {
    return <CartaoDeGrafico titulo={titulo} estado={erro ? 'erro' : 'carregando'} altura={260} legenda={LEGENDA}
      erro={`Não foi possível carregar a ${nomeDoNumero} por ${central ? 'consultoria' : 'consultor'}.`} aoTentarDeNovo={aoTentarDeNovo} />
  }

  const { mes } = painel
  const verTodos = central ? `/consultorias?aba=ocupacao&mes=${mes}` : `/usuarios?mes=${mes}`
  const resumo = painel.ranking_resumo ?? {}
  const noMeio = resumo.no_meio ?? 0
  // As sem capacidade vão para o fim da ordem: as que ficaram de fora aparecem depois da última barra.
  const foraSemCapacidade = resumo.sem_capacidade ?? 0
  const rodape = foraSemCapacidade > 0
    ? `+ ${INTEIRO.format(foraSemCapacidade)} ${central ? (foraSemCapacidade === 1 ? 'consultoria' : 'consultorias') : (foraSemCapacidade === 1 ? 'consultor' : 'consultores')} sem capacidade`
    : undefined
  const neste = painel.intervalo ? 'neste período' : 'neste mês'
  const usado = (u) => (passado ? u.realizado : u.reservado)
  const escalaMax = Math.max(1.25, ...ranking.map((u) => u.ocupacao ?? 0)) * 1.03
  const acoes = (
    <Link to={verTodos} className="px-1 text-rotulo font-medium text-primary hover:underline pointer-coarse:py-3">{central ? 'Ver todas' : 'Ver todos'}</Link>
  )

  return (
    <CartaoDeGrafico titulo={titulo} leitura={ranking.length ? fraseDaOcupacao(painel, recorte) : null} legenda={LEGENDA} acoes={acoes}
      altura={260} atualizando={atualizando} estado={ranking.length ? 'pronto' : 'vazio'}
      vazio={central ? `Nenhuma consultoria com capacidade ${neste}.` : `Nenhum consultor com capacidade ${neste}.`}
      tabela={{
        rotulo: titulo,
        colunas: [central ? 'Consultoria' : 'Consultor', passado ? 'Utilização' : 'Ocupação', passado ? 'Realizado' : 'Reservado', 'Capacidade'],
        linhas: ranking.map((u) => [u.nome, formatarOcupacao(u.ocupacao), formatarHoras(usado(u)), formatarHoras(u.capacidade)]),
      }}>
      <BarrasHorizontais rotulo={titulo} marca100={{ valor: 1, rotulo: '100%' }} rodape={rodape}
        escalaMax={escalaMax} zonas={zonasAte(escalaMax)}
        separador={noMeio > 0 ? { depoisDe: 6, texto: `… ${INTEIRO.format(noMeio)} no meio` } : null}
        itens={ranking.map((u) => {
          const semCapacidade = u.ocupacao == null
          const tom = !semCapacidade && u.ocupacao > 1 ? 'acima' : !semCapacidade && u.ocupacao < FOLGA ? 'folga' : 'serie'
          return {
            chave: u.id,
            nome: u.nome,
            href: central ? verTodos : u.visivel ? `/usuarios?pessoa=${u.id}&mes=${mes}` : undefined,
            sub: central ? `${INTEIRO.format(u.pessoas ?? 0)} ${u.pessoas === 1 ? 'consultor' : 'consultores'}` : semCapacidade ? 'sem capacidade' : undefined,
            valor: u.ocupacao ?? 0,
            tom: tom === 'folga' ? 'folga' : 'serie',
            cor: COR_DA_FAIXA[tom],
            valorTexto: formatarOcupacao(u.ocupacao),
            aria: `${u.nome}: ${formatarOcupacao(u.ocupacao)} de ${nomeDoNumero}`,
            dica: {
              titulo: u.nome,
              linhas: [
                { valor: formatarOcupacao(u.ocupacao), rotulo: nomeDoNumero, cor: COR_DA_FAIXA[tom] },
                { valor: `${formatarHoras(usado(u))} de ${formatarHoras(u.capacidade)}`, rotulo: passado ? 'realizado' : 'reservado' },
              ],
            },
          }
        })} />
    </CartaoDeGrafico>
  )
}
