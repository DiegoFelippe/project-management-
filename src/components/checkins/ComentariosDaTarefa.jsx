import { useEffect, useId, useState } from 'react'
import { ChevronsUp, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import Campo from '@/components/campos/Campo'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { apagarComentarioDaTarefa, comentariosDaTarefa, comentarTarefa, editarComentarioDaTarefa } from '@/data/checklists'
import { quandoEmSP } from './tempo'

const MAXIMO = 2000
const BOTAO_PERIGO = 'hover:bg-destructive/10 hover:text-destructive'
const nomeDo = (comentario) => comentario.autor?.nome ?? 'Alguém sem acesso'

// Comentários da tarefa do check-list, no Editar (acréscimo de 18/11 (2); como os do cartão do Quadro): os 30 mais
// recentes, do mais antigo para o mais novo, e "Ver comentários anteriores". "Comentar" grava na hora, sem o Salvar da
// janela. Quem comenta (o consultor do cliente e a gestão) e o que cada um edita e apaga vêm do banco (podeComentar,
// pode_editar, pode_apagar); a Central e o dono só leem. O rascunho fica com a janela (`rascunho`, `aoMudarRascunho`):
// ela pergunta antes de descartar e o Salvar o envia. `aoEditar(sim)` diz se há um comentário em edição (a janela não
// salva com ele aberto, e `erroDaEdicao` aparece embaixo do campo). `aoMexer()`: o check-list relê a contagem.
export default function ComentariosDaTarefa({ tarefaId, total: totalInicial = 0, rascunho, aoMudarRascunho, aoEditar, erroDaEdicao, aoMexer }) {
  const [lista, setLista] = useState(null) // do mais antigo para o mais novo
  const [haMais, setHaMais] = useState(false)
  const [podeComentar, setPodeComentar] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState(null)
  const [total, setTotal] = useState(totalInicial)
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState(null) // { id, texto }
  const [apagando, setApagando] = useState(null)
  const idEdicao = useId()
  const idTitulo = useId()

  useEffect(() => {
    let ativo = true
    comentariosDaTarefa({ tarefaId })
      .then((r) => {
        if (!ativo) return
        setLista([...r.itens].reverse())
        setHaMais(r.haMais)
        setPodeComentar(r.podeComentar)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os comentários.'))
    return () => {
      ativo = false
    }
  }, [tarefaId])

  function editar(valor) {
    setEditando(valor)
    aoEditar?.(Boolean(valor))
  }

  // Recusa do banco: o que a pessoa escreveu fica e o aviso aparece; comentário que já foi apagado sai da lista.
  function recusou(resposta, id) {
    setErro(resposta.erro)
    if (resposta.desatualizado && id) setLista((l) => l.filter((c) => c.id !== id))
  }

  async function verAnteriores() {
    if (carregandoMais || !lista?.length) return
    setCarregandoMais(true)
    try {
      const r = await comentariosDaTarefa({ tarefaId, antesId: lista[0].id })
      const vistos = new Set(lista.map((c) => c.id))
      setLista((atual) => [...[...r.itens].reverse().filter((c) => !vistos.has(c.id)), ...atual])
      setHaMais(r.haMais)
    } catch {
      setErro('Não foi possível carregar os comentários anteriores.')
    } finally {
      setCarregandoMais(false)
    }
  }

  async function comentar() {
    const limpo = rascunho.trim()
    if (!limpo || enviando) return
    setEnviando(true)
    setErro(null)
    const resposta = await comentarTarefa(tarefaId, limpo)
    setEnviando(false)
    if (resposta.erro) return recusou(resposta)
    setLista((atual) => [...(atual ?? []), resposta.comentario])
    setTotal((n) => n + 1)
    aoMudarRascunho('')
    aoMexer?.()
  }

  async function salvarEdicao() {
    const atual = lista.find((c) => c.id === editando?.id)
    const limpo = editando?.texto.trim()
    if (!atual || !limpo) return
    if (limpo === atual.texto) return editar(null)
    setErro(null)
    const resposta = await editarComentarioDaTarefa(atual.id, limpo)
    if (resposta.erro) return recusou(resposta, atual.id)
    setLista((l) => l.map((c) => (c.id === atual.id ? resposta.comentario : c)))
    editar(null)
  }

  async function apagar(comentario) {
    const resposta = await apagarComentarioDaTarefa(comentario.id)
    if (resposta.erro) {
      if (resposta.desatualizado) setLista((l) => l.filter((c) => c.id !== comentario.id))
      return resposta
    }
    setLista((l) => l.filter((c) => c.id !== comentario.id))
    setTotal((n) => Math.max(0, n - 1))
    aoMexer?.()
    return resposta
  }

  const aoTeclar = (enviar) => (e) => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    enviar()
  }

  return (
    <section aria-labelledby={idTitulo} className="min-w-0 space-y-3">
      <h3 id={idTitulo} className="section-label flex items-center gap-1.5">
        <MessageSquare className="size-3.5" aria-hidden="true" /> Comentários
        {total > 0 && <span className="font-normal tabular-nums tracking-normal">{total.toLocaleString('pt-BR')}</span>}
      </h3>

      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {lista?.length === 0 && <p className="text-corpo text-muted-foreground">Nenhum comentário ainda.</p>}
      {lista?.length > 0 && (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {haMais && (
            <Button type="button" variant="ghost" size="sm" className="w-full" disabled={carregandoMais} onClick={verAnteriores}>
              <ChevronsUp /> Ver comentários anteriores
            </Button>
          )}
          <ol aria-label="Comentários" className="space-y-2">
            {lista.map((c) => (
              <li key={c.id} className="bg-muted/50 flex items-start gap-2.5 rounded-xl px-3 py-2.5">
                <Avatar pessoa={c.autor?.nome ? c.autor : { nome: '?' }} className="mt-0.5 size-7" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-foreground text-rotulo font-semibold">{nomeDo(c)}</span>
                    <span className="text-muted-foreground text-legenda tabular-nums">{quandoEmSP(c.criado_em)}</span>
                    {c.editado_em && (
                      <span className="text-muted-foreground text-legenda italic" title={`Editado em ${quandoEmSP(c.editado_em)}`}>· editado</span>
                    )}
                  </div>
                  {editando?.id === c.id ? (
                    <div className="mt-1.5 grid gap-1.5">
                      <Campo id={idEdicao} erro={erroDaEdicao}>
                        <Textarea id={idEdicao} autoFocus aria-label="Texto do comentário" maxLength={MAXIMO} rows={3} value={editando.texto}
                          onChange={(e) => setEditando({ id: c.id, texto: e.target.value })} onKeyDown={aoTeclar(salvarEdicao)} />
                      </Campo>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => editar(null)}>Cancelar</Button>
                        <Button type="button" size="sm" aria-label="Salvar comentário" disabled={!editando.texto.trim()} onClick={salvarEdicao}>Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <p data-texto className="text-foreground/90 mt-0.5 text-corpo break-words whitespace-pre-wrap">{c.texto}</p>
                  )}
                </div>
                {editando?.id !== c.id && (c.pode_editar || c.pode_apagar) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {c.pode_editar && (
                      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Editar comentário" title="Editar comentário"
                        onClick={() => editar({ id: c.id, texto: c.texto })}><Pencil /></Button>
                    )}
                    {c.pode_apagar && (
                      <Button type="button" variant="ghost" size="icon" className={`size-7 ${BOTAO_PERIGO}`} aria-label="Apagar comentário"
                        title="Apagar comentário" onClick={() => setApagando(c)}><Trash2 /></Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {podeComentar && (
        <div className="grid gap-2">
          <Textarea aria-label="Novo comentário" placeholder="Escreva um comentário… (Ctrl + Enter envia)" maxLength={MAXIMO} rows={2}
            value={rascunho} onChange={(e) => aoMudarRascunho(e.target.value)} onKeyDown={aoTeclar(comentar)} />
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <span className="text-muted-foreground mr-auto text-legenda">
              Vai na hora, sem precisar de Salvar.{rascunho.length > MAXIMO - 200 && ` ${rascunho.length}/${MAXIMO}`}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={!rascunho.trim() || enviando} onClick={comentar}>
              <Send /> {enviando ? 'Comentando…' : 'Comentar'}
            </Button>
          </div>
        </div>
      )}

      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo="Apagar o comentário?"
          descricao={`O comentário some da tarefa para todos.${apagando.pode_editar ? '' : ` Ele é de ${nomeDo(apagando)}.`}`}
          rotuloConfirmar="Apagar comentário" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
