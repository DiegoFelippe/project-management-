import { buscarConsultoriasComoOpcoes } from '@/components/campos/opcoesDeConsultoria'
import Seletor from '@/components/campos/Seletor'
import { Label } from '@/components/ui/label'
import { buscarConsultorias } from '@/data/consultorias'

// A lista vem do banco, pelo nome, nunca inteira (milhares de consultorias).
const buscar = buscarConsultoriasComoOpcoes(buscarConsultorias)

// Só quem vê tudo (administrador geral e central): escolhe de qual consultoria olhar ("" = todas).
export default function FiltroConsultoria({ valor, aoMudar }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="filtro-consultoria" className="shrink-0 text-muted-foreground">Consultoria</Label>
      <div className="w-48">
        <Seletor id="filtro-consultoria" tamanho="sm" valor={valor} aoMudar={aoMudar} buscar={buscar} rotuloTodos="Todas" />
      </div>
    </div>
  )
}
