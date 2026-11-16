import { Archive, ArchiveRestore, ArrowRightLeft, Clock, History, Pencil, Send, Trash2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BotaoCheckin from './BotaoCheckin'

const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

// Ações da linha por papel: a central (e o dono) distribui e cuida do cadastro; admin e gestor escolhem o
// consultor e ajustam a previsão; em Meus clientes, quem atende faz check-in/check-out e lança horas.
export function AcoesDaLinha({ cliente, aba, central, gestao, aberto, idDoAviso, abrir, aoMudar }) {
  if (central) {
    return (
      <>
        {aba === 'distribuir' && (
          <Button variant="ghost" size="sm" onClick={() => abrir('mandar', cliente)}><Send /> Mandar para consultoria</Button>
        )}
        {aba === 'nas_consultorias' && (
          <Button variant="ghost" size="sm" onClick={() => abrir('mandar', cliente)}><ArrowRightLeft /> Mover</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => abrir('formulario', cliente)}><Pencil /> Editar</Button>
        {cliente.arquivado ? (
          <Button variant="ghost" size="sm" onClick={() => abrir('reativar', cliente)}><ArchiveRestore /> Reativar</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => abrir('arquivar', cliente)}><Archive /> Arquivar</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => abrir('apagar', cliente)} className={BOTAO_PERIGO}><Trash2 /> Apagar</Button>
      </>
    )
  }
  if (aba === 'meus') {
    return (
      <>
        <BotaoCheckin key={aberto?.id ?? 'livre'} cliente={cliente} aberto={aberto} idDoAviso={idDoAviso} aoMudar={aoMudar} />
        <Button variant="ghost" size="sm" onClick={() => abrir('lancar', cliente)}><History /> Lançar horas</Button>
      </>
    )
  }
  if (!gestao) return null
  return (
    <>
      {aba === 'aguardando' && (
        <Button variant="ghost" size="sm" onClick={() => abrir('consultor', cliente)}><UserCheck /> Escolher consultor</Button>
      )}
      {aba === 'atendimento' && (
        <>
          <Button variant="ghost" size="sm" onClick={() => abrir('consultor', cliente)}><ArrowRightLeft /> Trocar consultor</Button>
          <Button variant="ghost" size="sm" onClick={() => abrir('previsao', cliente)}><Clock /> Ajustar previsão</Button>
        </>
      )}
    </>
  )
}
