import { Archive, ArchiveRestore, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import MenuDeAcoes from '@/components/comum/MenuDeAcoes'

// O "⋯" do cabeçalho da tela Quadros (outline, como os botões do cabeçalho): Novo quadro e Quadros arquivados para todos;
// para quem administra o quadro aberto (`pode_administrar`, do banco), Renomear e Arquivar (ou Restaurar, no arquivado,
// que não se renomeia) e Apagar. O banco continua mandando: a tela só esconde o que a pessoa não pode.
export default function MenuDoQuadro({ quadro, aoNovo, aoArquivados, aoRenomear, aoArquivar, aoRestaurar, aoApagar }) {
  const itens = [
    { rotulo: 'Novo quadro', icone: Plus, aoEscolher: aoNovo },
    { rotulo: 'Quadros arquivados', icone: ArchiveRestore, aoEscolher: aoArquivados },
  ]
  if (quadro?.pode_administrar) {
    if (quadro.arquivado_em) itens.push({ rotulo: 'Restaurar', icone: RotateCcw, aoEscolher: aoRestaurar })
    else {
      itens.push({ rotulo: 'Renomear', icone: Pencil, aoEscolher: aoRenomear })
      itens.push({ rotulo: 'Arquivar', icone: Archive, aoEscolher: aoArquivar })
    }
    itens.push({ rotulo: 'Apagar', icone: Trash2, aoEscolher: aoApagar, perigo: true })
  }
  return <MenuDeAcoes rotulo="Mais ações do quadro" variante="outline" className="size-9" itens={itens} />
}
