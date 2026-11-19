import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import Quadradinhos from '@/components/graficos/Quadradinhos'
import { COR_OUTROS, corDaPaleta, corDaSerie } from '@/components/graficos/cores'
import { fraseDasCidades, nomeDaCidade } from '@/lib/frasesDosGraficos'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const TITULO = 'Clientes por cidade'
// "Sem cidade" fica com a cor que vem depois das 6 cidades na ordem da paleta (laranja), separada do grafite de "Outras".
const SEM_CIDADE = corDaPaleta('laranja')

// Os grupos: as 6 maiores cidades (do banco, da maior para a menor) pela paleta, "Outras" em grafite e "Sem cidade" por
// último; grupo zero fica de fora.
function gruposDe({ cidades, outras }) {
  const comNome = cidades.filter((c) => c.cidade).map((c, i) => ({ nome: nomeDaCidade(c), n: c.clientes, cor: corDaSerie(i) }))
  const semCidade = cidades.find((c) => !c.cidade)?.clientes ?? 0
  return [
    ...comNome,
    ...(outras > 0 ? [{ nome: 'Outras', n: outras, cor: COR_OUTROS }] : []),
    ...(semCidade > 0 ? [{ nome: 'Sem cidade', n: semCidade, cor: SEM_CIDADE }] : []),
  ]
}

// Clientes por cidade (Início, central e gestão; pedido do Diego, 19/11): um quadradinho por cliente que não está
// arquivado, na cor da cidade, hoje (não segue o período: clientes_por_cidade). Mais de 100: cada quadradinho é 1%.
export default function ClientesPorCidade({ dados, erro = false, atualizando = false, aoTentarDeNovo }) {
  const subtitulo = `Situação de hoje${dados ? ` · ${INTEIRO.format(dados.total)} ${dados.total === 1 ? 'cliente' : 'clientes'}` : ''}`
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={TITULO} subtitulo={subtitulo} estado={erro ? 'erro' : 'carregando'} altura={160}
      erro="Não foi possível carregar os clientes por cidade." aoTentarDeNovo={aoTentarDeNovo} />
  }

  const grupos = gruposDe(dados)
  const { total } = dados
  return (
    <CartaoDeGrafico titulo={TITULO} subtitulo={subtitulo} leitura={total ? fraseDasCidades(dados) : null} atualizando={atualizando}
      estado={total ? 'pronto' : 'vazio'} vazio="Nenhum cliente ainda."
      tabela={{
        rotulo: TITULO,
        colunas: ['Cidade', 'Clientes', '%'],
        linhas: grupos.map((g) => [g.nome, INTEIRO.format(g.n), `${Math.round((g.n / total) * 100)}%`]),
      }}>
      <Quadradinhos rotulo={TITULO} grupos={grupos} />
    </CartaoDeGrafico>
  )
}
