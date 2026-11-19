import { consultoresPorOcupacao } from '@/data/capacidade'
import EscolhaDeOcupacao from './EscolhaDeOcupacao'
import { rotuloDeOcupacao } from './rotulos'

// Escolher (ou trocar) o consultor do cliente entre os da consultoria dele. aoEscolher(consultorId, item) devolve { erro }.
export default function JanelaConsultor({ aberto, cliente, aoFechar, aoEscolher }) {
  const atual = cliente.consultor ?? null
  const carregar = (parametros) => consultoresPorOcupacao({ ...parametros, consultoriaId: cliente.consultoria_id })
  return (
    <EscolhaDeOcupacao aberto={aberto} aoFechar={aoFechar} carregar={carregar} atualId={atual?.id} horas={cliente.horas_mes}
      titulo={atual ? `Trocar o consultor de ${cliente.nome}` : `Escolher o consultor de ${cliente.nome}`}
      descricao="Consultores da consultoria com menos ocupação no mês primeiro. A sugestão é só uma ajuda: quem escolhe é você."
      rotuloDaBusca="Buscar consultor" rotuloDoValor={rotuloDeOcupacao}
      rotuloDoBotao={(c) => `${atual ? 'Trocar para' : 'Escolher'} ${c.nome}`}
      frasePrevia={(nome, antes, depois) => `${nome} passa de ${antes} para ${depois}.`}
      fraseSemCapacidade={(nome) => `${nome} está sem capacidade cadastrada.`}
      aoConfirmar={(id, item) => aoEscolher(id, item)} />
  )
}
