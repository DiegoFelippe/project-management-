import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import MapaDeCalor from '@/components/graficos/MapaDeCalor'
import { corDaPaleta } from '@/components/graficos/cores'
import { fraseDoCalor, horaDoCalor } from '@/lib/frasesDosGraficos'

const DIAS = [1, 2, 3, 4, 5, 6, 0] // segunda a domingo (domingo = 0, como o banco manda)
const CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const POR_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const HORAS = Array.from({ length: 14 }, (_, i) => i + 7) // 7h a 20h
const COR = corDaPaleta('violeta')
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Quando os check-ins acontecem (Início, todos; pedido do Diego, 19/11): mapa de calor dia da semana × hora de início
// (hora de São Paulo), uma cor só, nas últimas 8 semanas do período (o período inteiro, se for mais curto; a janela vem
// do banco e vai no subtítulo). Antes das 7h conta às 7h; depois das 20h, às 20h (checkins_por_dia_e_hora).
export default function QuandoOsCheckins({ dados, periodo, erro = false, atualizando = false, aoTentarDeNovo }) {
  const titulo = 'Quando os check-ins acontecem'
  const janela = dados ? `de ${diaMes(dados.de)} a ${diaMes(dados.ate)}` : null
  const subtitulo = `Dia da semana × hora de início${janela ? `, ${janela}${periodo && dados.de > periodo.de ? ' (as últimas 8 semanas)' : ''}` : ''}`
  if (erro || !dados) {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={erro ? 'erro' : 'carregando'} altura={200}
      erro="Não foi possível carregar os horários dos check-ins." aoTentarDeNovo={aoTentarDeNovo} />
  }

  const mapa = new Map(dados.celulas.map((c) => [`${c.dia_semana}-${c.hora}`, c.checkins]))
  const valores = DIAS.map((d) => HORAS.map((h) => mapa.get(`${d}-${h}`) ?? 0))
  const comCheckin = DIAS.flatMap((d, i) => HORAS.flatMap((h, j) => (valores[i][j] ? [[POR_EXTENSO[d], horaDoCalor(h), String(valores[i][j])]] : [])))

  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={comCheckin.length ? fraseDoCalor(dados) : null}
      atualizando={atualizando} estado={comCheckin.length ? 'pronto' : 'vazio'} vazio={`Nenhum check-in ${janela}.`}
      tabela={{ rotulo: 'Check-ins por dia da semana e hora de início', colunas: ['Dia', 'Hora de início', 'Check-ins'], linhas: comCheckin }}>
      {/* Janela nova = células novas, que entram de novo em cascata; a releitura da mesma janela não. */}
      <MapaDeCalor key={janela} rotulo={titulo} linhas={DIAS.map((d) => CURTOS[d])} colunas={HORAS.map(horaDoCalor)}
        rotulosX={HORAS.map((h) => `${h}h`)} valores={valores} cor={COR} unidade="check-ins" />
    </CartaoDeGrafico>
  )
}
