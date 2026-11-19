import { useState } from 'react'
import { FolderOpen, Loader2, PlayCircle, RefreshCw, Video } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { buscarAgora, tentarDeNovo } from '@/data/agenda'
import { cn } from '@/lib/utils'
import { situacaoDaReuniao } from './situacaoDaReuniao'

const situacaoDe = (evento) => ({
  reuniao: evento.reuniao, reuniao_erro: evento.reuniao_erro, pasta_id: evento.pasta_id, gravacao_url: evento.gravacao_url,
})

// A reunião do evento: Entrar no Meet, Abrir gravação, Pasta da reunião (leva à aba Arquivos do cliente, na pasta) e a
// situação depois da reunião, com "Buscar agora" e "Tentar de novo" para quem edita o evento. Reunião sem cliente não
// tem situação: a rotina não a processa (não há onde criar a pasta). `aoMudar`: a situação mudou (a tela relê).
export default function DetalheDoEvento({ evento, podeEditar, aoMudar }) {
  const [situacao, setSituacao] = useState(() => situacaoDe(evento))
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)
  const [agora] = useState(() => Date.now())
  // A situação vem do evento ou, depois do "Buscar agora", da resposta da rotina.
  const { estado, info } = situacaoDaReuniao({ ...evento, ...situacao }, agora)
  const pasta = situacao.pasta_id && evento.cliente_id ? `/clientes/${evento.cliente_id}?aba=arquivos&pasta=${situacao.pasta_id}` : null

  async function buscar() {
    if (buscando) return
    setBuscando(true)
    setErro(null)
    let resposta
    try {
      resposta = await (estado === 'aguardando' ? buscarAgora : tentarDeNovo)(evento.id)
    } catch {
      resposta = { erro: 'Não foi possível falar com o Google agora. Tente de novo.' }
    }
    setBuscando(false)
    if (resposta.erro) return setErro(resposta.erro)
    setSituacao(resposta.reuniao)
    aoMudar?.()
  }

  if (!evento.meet_link && !situacao.gravacao_url && !pasta && !info) return null
  return (
    <section aria-label="A reunião" className="space-y-2.5">
      <h3 className="section-label">A reunião</h3>
      {(evento.meet_link || situacao.gravacao_url || pasta) && (
        <div className="flex flex-wrap gap-2">
          {evento.meet_link && (
            <Button asChild variant="outline" size="sm">
              <a href={evento.meet_link} target="_blank" rel="noreferrer"><Video /> Entrar no Meet</a>
            </Button>
          )}
          {situacao.gravacao_url && (
            <Button asChild variant="outline" size="sm">
              <a href={situacao.gravacao_url} target="_blank" rel="noreferrer"><PlayCircle /> Abrir gravação</a>
            </Button>
          )}
          {pasta && (
            <Button asChild variant="outline" size="sm">
              <Link to={pasta}><FolderOpen /> Pasta da reunião</Link>
            </Button>
          )}
        </div>
      )}
      {info && (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-rotulo font-semibold', info.tom)}>
              <info.icone className="size-3.5" aria-hidden="true" />
              <span>{info.rotulo}</span>
            </span>
            {podeEditar && info.acao && (
              <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={buscando} onClick={buscar}>
                {buscando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw />}
                {buscando ? 'Buscando…' : info.acao}
              </Button>
            )}
          </div>
          {situacao.reuniao_erro && (estado === 'erro' || estado === 'aguardando') && (
            <p className="mt-2 text-rotulo text-muted-foreground">{situacao.reuniao_erro}</p>
          )}
          {estado === 'aguardando' && !situacao.reuniao_erro && (
            <p className="mt-2 text-rotulo text-muted-foreground">
              A pasta com a transcrição e a documentação aparece nos Arquivos do cliente quando o Google terminar a transcrição.
            </p>
          )}
          {erro && <p role="alert" className="mt-2 text-rotulo text-destructive">{erro}</p>}
        </div>
      )}
    </section>
  )
}
