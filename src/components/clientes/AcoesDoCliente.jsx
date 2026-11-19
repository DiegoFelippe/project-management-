import { Archive, ArchiveRestore, ArrowRightLeft, Clock, History, Pencil, Send, Trash2, UserCheck } from 'lucide-react'
import { AcaoDaLinha } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import BotaoCheckin from './BotaoCheckin'
import { estiloDaAcao } from './estiloDaAcao'

const PERIGO_NO_CABECALHO = 'text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive'

// Ação secundária: na linha da tabela, só o ícone (AcaoDaLinha, auditoria G1); na barra da página do cliente
// (noCabecalho), outline com o nome, que fica só com o ícone no celular (o nome continua para o leitor de tela). `comTexto`
// mantém o nome escrito no celular: o "Lançar horas" do consultor (auditoria, R12).
function Acao({ noCabecalho, nome, icone: Icone, perigo = false, comTexto = false, onClick }) {
  if (!noCabecalho) return <AcaoDaLinha nome={nome} icone={Icone} perigo={perigo} onClick={onClick} />
  return (
    <Button {...estiloDaAcao(true)} onClick={onClick} className={perigo ? PERIGO_NO_CABECALHO : undefined}>
      <Icone /> <span className={comTexto ? undefined : 'max-sm:sr-only'}>{nome}</span>
    </Button>
  )
}

// Ações da linha por papel: a central (e o dono) distribui e cuida do cadastro; admin e gestor escolhem o
// consultor e ajustam a previsão; em Meus clientes, quem atende faz check-in/check-out e lança horas. A ação principal
// da situação (Mandar para consultoria, Escolher consultor, Fazer check-in) tem texto; as outras ficam em ordem fixa
// e, na linha, só com o ícone. A principal vem antes, à esquerda: os ícones não mudam de lugar de uma linha para outra.
export function AcoesDaLinha({ cliente, aba, central, gestao, aberto, idDoAviso, abrir, aoMudar, noCabecalho = false }) {
  const comum = { noCabecalho }
  if (central) {
    return (
      <>
        {aba === 'distribuir' && (
          <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => abrir('mandar', cliente)}><Send /> Mandar para consultoria</Button>
        )}
        {aba === 'nas_consultorias' && <Acao {...comum} nome="Mover" icone={ArrowRightLeft} onClick={() => abrir('mandar', cliente)} />}
        <Acao {...comum} nome="Editar" icone={Pencil} onClick={() => abrir('formulario', cliente)} />
        {cliente.arquivado
          ? <Acao {...comum} nome="Reativar" icone={ArchiveRestore} onClick={() => abrir('reativar', cliente)} />
          : <Acao {...comum} nome="Arquivar" icone={Archive} onClick={() => abrir('arquivar', cliente)} />}
        <Acao {...comum} nome="Apagar" icone={Trash2} perigo onClick={() => abrir('apagar', cliente)} />
      </>
    )
  }
  if (aba === 'meus') {
    return (
      <>
        <BotaoCheckin noCabecalho={noCabecalho} key={aberto?.id ?? 'livre'} cliente={cliente} aberto={aberto} idDoAviso={idDoAviso} aoMudar={aoMudar} />
        <Acao {...comum} nome="Lançar horas" icone={History} comTexto onClick={() => abrir('lancar', cliente)} />
      </>
    )
  }
  if (!gestao) return null
  // A gestão também edita os dados do cliente (pedido do Diego, 19/11), menos do arquivado. Na linha, o lápis fica no fim
  // (o mesmo lugar em toda linha) e toma o lugar do "Ajustar previsão", que está no formulário (no máximo 3 ícones); na
  // barra da página do cliente, os dois ficam.
  return (
    <>
      {aba === 'aguardando' && (
        <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => abrir('consultor', cliente)}><UserCheck /> Escolher consultor</Button>
      )}
      {aba === 'atendimento' && (
        <>
          <Acao {...comum} nome="Trocar consultor" icone={ArrowRightLeft} onClick={() => abrir('consultor', cliente)} />
          {noCabecalho && <Acao {...comum} nome="Ajustar previsão" icone={Clock} onClick={() => abrir('previsao', cliente)} />}
        </>
      )}
      {!cliente.arquivado && <Acao {...comum} nome="Editar" icone={Pencil} onClick={() => abrir('formulario', cliente)} />}
    </>
  )
}
