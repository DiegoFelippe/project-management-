import { useEffect, useState } from 'react'
import { Archive, Trash2, TriangleAlert } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usoDoModelo } from '@/data/checklists'
import { cn } from '@/lib/utils'

const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// "A", "A e B", "A, B e C" e, quando o banco contou mais do que mandou de nomes, "… e mais N".
function nomesDosClientes(nomes, total) {
  const resto = total - nomes.length
  if (resto > 0) return `${nomes.join(', ')} e mais ${resto.toLocaleString('pt-BR')}`
  return nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}

// Apagar um modelo, com a confirmação que diz o que some junto (regra CRUD do CLAUDE.md). Antes, pergunta ao banco quem
// usa (usoDoModelo): sem uso, apaga as etapas e as tarefas do modelo (e oferece arquivar no lugar); em uso, não apaga —
// só arquiva (os clientes continuam com o check-list), e os nomes são só os dos clientes que a pessoa vê. O banco recusa
// apagar modelo em uso de qualquer jeito: se alguém aplicou no meio do caminho, o motivo aparece aqui.
// `modelo`: a linha da lista ({ id, nome, etapas, tarefas, arquivado_em }); `aoApagar()` e `aoArquivar()` → { erro }.
export default function ApagarModelo({ modelo, aoFechar, aoApagar, aoArquivar }) {
  const [uso, setUso] = useState({ carregando: true })
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const arquivado = Boolean(modelo.arquivado_em)

  useEffect(() => {
    let ativo = true
    usoDoModelo(modelo.id).then(
      (dados) => ativo && setUso({ dados }),
      () => ativo && setUso({ falhou: true }),
    )
    return () => { ativo = false }
  }, [modelo.id])

  async function fazer(acao) {
    if (enviando) return
    setEnviando(true)
    setErro(null)
    const resposta = await acao()
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  const clientes = uso.dados?.clientes ?? 0
  const emUso = clientes > 0
  const sumiu = !uso.carregando && !uso.falhou && !uso.dados
  const oQueSome = `Somem junto ${plural(modelo.etapas, 'etapa', 'etapas')} e ${plural(modelo.tarefas, 'tarefa', 'tarefas')} do modelo.`
  const arquiveNoLugar = arquivado ? '' : ' Se quiser só tirar da lista, arquive.'

  let titulo = `Apagar "${modelo.nome}"?`
  let texto
  if (uso.carregando) texto = 'Conferindo se algum cliente usa este modelo…'
  else if (sumiu) texto = 'Este modelo não está mais disponível.'
  else if (uso.falhou) {
    texto = `${oQueSome} Não foi possível conferir se algum cliente usa este modelo. Se algum usar, o app não deixa apagar. Não dá para desfazer.${arquiveNoLugar}`
  } else if (emUso) {
    titulo = `"${modelo.nome}" está em uso`
    const nomes = uso.dados.nomes ?? []
    const quem = clientes === 1 ? '1 cliente que você vê usa' : `${clientes.toLocaleString('pt-BR')} clientes que você vê usam`
    texto = `${quem} este modelo${nomes.length ? `: ${nomesDosClientes(nomes, clientes)}` : ''}. Por isso ele não pode ser apagado. ${arquivado
      ? 'Ele já está arquivado: os clientes continuam com o check-list.'
      : `Arquive: ele sai da lista de modelos para aplicar e ${clientes === 1 ? 'o cliente continua' : 'os clientes continuam'} com o check-list.`}`
  } else texto = `${oQueSome} Nenhum cliente usa este modelo. Não dá para desfazer.${arquiveNoLugar}`

  const decidido = !uso.carregando && !sumiu
  const podeArquivar = decidido && !arquivado
  const podeApagar = decidido && !emUso

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && !enviando && aoFechar()}>
      <DialogContent role="alertdialog" className="sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3 text-left">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', emUso ? 'bg-notice-soft text-notice' : 'bg-destructive/10 text-destructive')}>
            {emUso ? <TriangleAlert className="size-5" aria-hidden="true" /> : <Trash2 className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="text-janela">{titulo}</DialogTitle>
            <DialogDescription className="text-rotulo">{texto}</DialogDescription>
          </div>
        </DialogHeader>
        {erro && <Aviso>{erro}</Aviso>}
        <DialogFooter>
          {decidido && emUso && arquivado ? (
            <Button type="button" onClick={aoFechar}>Entendi</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
              {podeArquivar && (
                <Button type="button" variant={podeApagar ? 'outline' : 'default'} disabled={enviando} onClick={() => fazer(aoArquivar)}>
                  <Archive /> Arquivar
                </Button>
              )}
              {podeApagar && (
                <Button type="button" variant="destructive" disabled={enviando} onClick={() => fazer(aoApagar)}>
                  <Trash2 /> Apagar
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
