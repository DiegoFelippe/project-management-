import { Archive, ArchiveRestore, ArrowRightLeft, Clock, History, Pencil, Send, Trash2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BotaoCheckin from './BotaoCheckin'
import { estiloDaAcao } from './estiloDaAcao'

const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
const PERIGO_NO_CABECALHO = 'text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive'

// Na barra da página do cliente (noCabecalho), as ações secundárias ficam só com o ícone no celular; o nome continua
// para o leitor de tela. A principal do contexto mantém o texto.
function Rotulo({ noCabecalho, children }) {
  return noCabecalho ? <span className="max-sm:sr-only">{children}</span> : children
}

// Ações da linha por papel: a central (e o dono) distribui e cuida do cadastro; admin e gestor escolhem o
// consultor e ajustam a previsão; em Meus clientes, quem atende faz check-in/check-out e lança horas.
export function AcoesDaLinha({ cliente, aba, central, gestao, aberto, idDoAviso, abrir, aoMudar, noCabecalho = false }) {
  if (central) {
    return (
      <>
        {aba === 'distribuir' && (
          <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => abrir('mandar', cliente)}><Send /> Mandar para consultoria</Button>
        )}
        {aba === 'nas_consultorias' && (
          <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('mandar', cliente)}><ArrowRightLeft /> <Rotulo noCabecalho={noCabecalho}>Mover</Rotulo></Button>
        )}
        <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('formulario', cliente)}><Pencil /> <Rotulo noCabecalho={noCabecalho}>Editar</Rotulo></Button>
        {cliente.arquivado ? (
          <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('reativar', cliente)}><ArchiveRestore /> <Rotulo noCabecalho={noCabecalho}>Reativar</Rotulo></Button>
        ) : (
          <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('arquivar', cliente)}><Archive /> <Rotulo noCabecalho={noCabecalho}>Arquivar</Rotulo></Button>
        )}
        <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('apagar', cliente)} className={noCabecalho ? PERIGO_NO_CABECALHO : BOTAO_PERIGO}><Trash2 /> <Rotulo noCabecalho={noCabecalho}>Apagar</Rotulo></Button>
      </>
    )
  }
  if (aba === 'meus') {
    return (
      <>
        <BotaoCheckin noCabecalho={noCabecalho} key={aberto?.id ?? 'livre'} cliente={cliente} aberto={aberto} idDoAviso={idDoAviso} aoMudar={aoMudar} />
        <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('lancar', cliente)}><History /> <Rotulo noCabecalho={noCabecalho}>Lançar horas</Rotulo></Button>
      </>
    )
  }
  if (!gestao) return null
  return (
    <>
      {aba === 'aguardando' && (
        <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => abrir('consultor', cliente)}><UserCheck /> Escolher consultor</Button>
      )}
      {aba === 'atendimento' && (
        <>
          <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('consultor', cliente)}><ArrowRightLeft /> <Rotulo noCabecalho={noCabecalho}>Trocar consultor</Rotulo></Button>
          <Button {...estiloDaAcao(noCabecalho)} onClick={() => abrir('previsao', cliente)}><Clock /> <Rotulo noCabecalho={noCabecalho}>Ajustar previsão</Rotulo></Button>
        </>
      )}
    </>
  )
}
