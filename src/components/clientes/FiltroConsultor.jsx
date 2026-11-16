import { useCallback } from 'react'
import Seletor from '@/components/campos/Seletor'
import { Label } from '@/components/ui/label'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { rotuloDeOcupacao } from './rotulos'

const SEM_CONSULTOR = { valor: 'sem', rotulo: 'Sem consultor' }
const LIMITE = 8

// Filtro "Consultor" da lista: Todos, Sem consultor ou uma pessoa buscada no banco (a de menor ocupação primeiro).
// valor: '' | 'sem' | id. nome: o nome da pessoa escolhida (para o campo continuar com ele ao voltar). aoMudar(valor, nome). consultoriaId: null = de todas as consultorias.
// comSemConsultor: false onde todo cliente tem consultor (Em atendimento), para não oferecer uma lista vazia.
export default function FiltroConsultor({ valor, nome, consultoriaId, comSemConsultor = true, aoMudar }) {
  const buscar = useCallback(async (termo) => {
    const { itens, total } = await consultoresPorOcupacao({ busca: termo || undefined, limite: LIMITE, consultoriaId: consultoriaId ?? null })
    const pessoas = itens.map((p) => ({ valor: p.id, rotulo: p.nome, detalhe: rotuloDeOcupacao(p), avatar: p }))
    // "Sem consultor" abre a lista (só sem busca); o total sobe junto para o rodapé "N de TOTAL" continuar certo.
    return comSemConsultor && !termo ? { itens: [SEM_CONSULTOR, ...pessoas], total: total + 1 } : { itens: pessoas, total }
  }, [consultoriaId, comSemConsultor])

  const atual = valor === 'sem' ? [SEM_CONSULTOR] : valor ? [{ valor, rotulo: nome ?? 'Consultor escolhido' }] : []

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="filtro-consultor" className="shrink-0 text-muted-foreground">Consultor</Label>
      <div className="w-48">
        <Seletor id="filtro-consultor" tamanho="sm" valor={valor} aoMudar={(novo, opcao) => aoMudar(novo, opcao?.rotulo ?? null)} buscar={buscar} rotuloTodos="Todos"
          opcoes={atual} />
      </div>
    </div>
  )
}
