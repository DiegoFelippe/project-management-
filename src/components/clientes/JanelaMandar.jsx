import { consultoriasPorOcupacao } from '@/data/capacidade'
import EscolhaDeOcupacao from './EscolhaDeOcupacao'
import { rotuloDeOcupacao } from './rotulos'

const carregar = (parametros) => consultoriasPorOcupacao(parametros)

// Mandar o cliente para uma consultoria, ou mover para outra (quando já está em uma). aoMandar(consultoriaId, item) devolve { erro }.
export default function JanelaMandar({ aberto, cliente, aoFechar, aoMandar }) {
  const atual = cliente.consultoria ?? null
  return (
    <EscolhaDeOcupacao aberto={aberto} aoFechar={aoFechar} carregar={carregar} atualId={atual?.id} horas={cliente.horas_mes}
      titulo={atual ? `Mover ${cliente.nome} para outra consultoria` : `Mandar ${cliente.nome} para uma consultoria`}
      descricao="Consultorias com menos ocupação no mês primeiro. A sugestão é só uma ajuda: quem escolhe é você."
      rotuloDaBusca="Buscar consultoria" rotuloDoValor={rotuloDeOcupacao}
      rotuloDoBotao={(c) => `${atual ? 'Mover' : 'Mandar'} para ${c.nome}`}
      frasePrevia={(nome, antes, depois) => `A ocupação da ${nome} passa de ${antes} para ${depois}.`}
      fraseSemCapacidade={(nome) => `A ${nome} está sem capacidade cadastrada.`}
      aoConfirmar={(id, item) => aoMandar(id, item)} />
  )
}
