import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronsUp, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Button } from '@/components/ui/button'
import { apagarComentario, comentar, comentariosDoCartao, editarComentario } from '@/data/quadro'
import { FUSO } from '@/lib/mes'
import { useEscNoCampo } from './useEscNoCampo'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const quando = (instante) => QUANDO.format(new Date(instante))
const MAXIMO = 2000
const CAMPO_TEXTO = 'input texto-de-campo min-h-[4.5rem] resize-y leading-relaxed'
const BOTAO_PERIGO = 'hover:bg-destructive/10 hover:text-destructive'

// Comentários do cartão (texto simples, até 2000), como no Mochi: os 30 mais recentes, do mais antigo para o mais novo, e
// "Ver comentários anteriores" pede os de antes do mais antigo mostrado. Quem mexe comenta; edita e apaga os próprios
// ("· editado" depois de editar); a gestão (`podeGerir`) apaga o de qualquer um. Quem só lê, só lê. Recusa do banco:
// o que a pessoa escreveu fica e `aoRecusar(erro)` avisa a janela. `aoMexer()`: o quadro relê a contagem ao fechar.
export default function ComentariosDoCartao({ cartaoId, perfil, podeMexer, podeGerir, totalInicial = 0, aoMexer, aoRecusar }) {
  const [lista, setLista] = useState(null) // do mais antigo para o mais novo
  const [haMais, setHaMais] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState(null)
  const [total, setTotal] = useState(totalInicial)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState(null) // { id, texto }
  const [apagando, setApagando] = useState(null)
  const campoEdicao = useRef(null)
  const area = useRef(null)
  // Para onde rolar depois que a lista mudar: 'fim' (abriu, ou a pessoa comentou: os mais novos à vista) ou
  // { distancia } do fim (os anteriores entraram em cima: o que a pessoa lia não sai do lugar).
  const rolar = useRef(null)
  useEscNoCampo(campoEdicao, Boolean(editando), () => setEditando(null))

  useLayoutEffect(() => {
    const el = area.current
    const pedido = rolar.current
    if (!el || !pedido) return
    rolar.current = null
    el.scrollTop = pedido === 'fim' ? el.scrollHeight : el.scrollHeight - pedido.distancia
  }, [lista, haMais])

  useEffect(() => {
    let ativo = true
    comentariosDoCartao({ cartaoId })
      .then((r) => {
        if (!ativo) return
        rolar.current = 'fim'
        setLista([...r.itens].reverse())
        setHaMais(r.haMais)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os comentários.'))
    return () => {
      ativo = false
    }
  }, [cartaoId])

  async function verAnteriores() {
    if (carregandoMais || !lista?.length) return
    setCarregandoMais(true)
    try {
      const r = await comentariosDoCartao({ cartaoId, antesId: lista[0].id })
      const vistos = new Set(lista.map((c) => c.id))
      if (area.current) rolar.current = { distancia: area.current.scrollHeight - area.current.scrollTop }
      setLista((atual) => [...[...r.itens].reverse().filter((c) => !vistos.has(c.id)), ...atual])
      setHaMais(r.haMais)
    } catch {
      setErro('Não foi possível carregar os comentários anteriores.')
    } finally {
      setCarregandoMais(false)
    }
  }

  async function enviar() {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    setEnviando(true)
    const resposta = await comentar(cartaoId, limpo)
    setEnviando(false)
    if (resposta.erro) return aoRecusar(resposta.erro)
    const { autor_id: _autor, ...comentario } = resposta.comentario
    rolar.current = 'fim'
    setLista((atual) => [...(atual ?? []), { ...comentario, autor: { id: perfil.id, nome: perfil.nome, foto: perfil.foto, cor: perfil.cor } }])
    setTotal((n) => n + 1)
    setTexto('')
    aoMexer()
  }

  async function salvarEdicao() {
    const edicao = editando
    const atual = lista.find((c) => c.id === edicao?.id)
    const limpo = edicao?.texto.trim()
    if (!atual || !limpo) return
    if (limpo === atual.texto) return setEditando(null)
    const resposta = await editarComentario(atual.id, limpo)
    if (resposta.erro) return aoRecusar(resposta.erro)
    setLista((l) => l.map((c) => (c.id === atual.id ? { ...c, texto: limpo, editado_em: new Date().toISOString() } : c)))
    setEditando(null)
    aoMexer()
  }

  async function apagar(comentario) {
    const resposta = await apagarComentario(comentario.id)
    if (resposta.erro) {
      aoRecusar(resposta.erro)
      return resposta
    }
    setLista((l) => l.filter((c) => c.id !== comentario.id))
    setTotal((n) => Math.max(0, n - 1))
    aoMexer()
    return resposta
  }

  const meu = (c) => c.autor?.id === perfil.id

  return (
    <section aria-labelledby="titulo-dos-comentarios" className="min-w-0 space-y-3">
      <h3 id="titulo-dos-comentarios" className="section-label flex items-center gap-1.5">
        <MessageSquare className="size-3.5" aria-hidden="true" /> Comentários
        {total > 0 && <span className="font-normal tabular-nums tracking-normal">{total.toLocaleString('pt-BR')}</span>}
      </h3>

      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {lista?.length === 0 && <p className="text-corpo text-muted-foreground">Nenhum comentário ainda.</p>}
      {lista?.length > 0 && (
        <div ref={area} data-rolagem className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {haMais && (
            <Button type="button" variant="ghost" size="sm" className="w-full" disabled={carregandoMais} onClick={verAnteriores}>
              <ChevronsUp /> Ver comentários anteriores
            </Button>
          )}
          <ol aria-label="Comentários" className="space-y-2">
            {lista.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                <Avatar pessoa={c.autor ?? { nome: '?' }} className="mt-0.5 size-7" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-rotulo font-semibold text-foreground">{c.autor?.nome ?? 'Alguém que saiu'}</span>
                    <span className="text-legenda tabular-nums text-muted-foreground">{quando(c.criado_em)}</span>
                    {c.editado_em && (
                      <span className="text-legenda text-muted-foreground italic" title={`Editado em ${quando(c.editado_em)}`}>· editado</span>
                    )}
                  </div>
                  {editando?.id === c.id ? (
                    <div ref={campoEdicao} className="mt-1.5 grid gap-1.5">
                      <textarea autoFocus aria-label="Texto do comentário" maxLength={MAXIMO} rows={3} value={editando.texto} className={CAMPO_TEXTO}
                        onChange={(e) => setEditando({ id: c.id, texto: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            salvarEdicao()
                          }
                        }} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                        <Button type="button" size="sm" aria-label="Salvar comentário" disabled={!editando.texto.trim()} onClick={salvarEdicao}>Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <p data-texto className="mt-0.5 text-corpo whitespace-pre-wrap break-words text-foreground/90">{c.texto}</p>
                  )}
                </div>
                {podeMexer && editando?.id !== c.id && (meu(c) || podeGerir) && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {meu(c) && (
                      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Editar comentário"
                        onClick={() => setEditando({ id: c.id, texto: c.texto })}><Pencil /></Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className={`size-7 ${BOTAO_PERIGO}`} aria-label="Apagar comentário"
                      onClick={() => setApagando(c)}><Trash2 /></Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {podeMexer && (
        <div className="grid gap-2">
          <textarea aria-label="Novo comentário" placeholder="Escreva um comentário… (Ctrl + Enter envia)" maxLength={MAXIMO} rows={2}
            value={texto} className={CAMPO_TEXTO} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                enviar()
              }
            }} />
          <div className="flex items-center justify-end gap-3">
            {texto.length > MAXIMO - 200 && (
              <span className="mr-auto text-legenda tabular-nums text-muted-foreground">{texto.length}/{MAXIMO}</span>
            )}
            <Button type="button" variant="outline" disabled={!texto.trim() || enviando} onClick={enviar}>
              <Send /> {enviando ? 'Comentando…' : 'Comentar'}
            </Button>
          </div>
        </div>
      )}

      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo="Apagar o comentário?"
          descricao={meu(apagando) ? 'O comentário some do cartão.' : `O comentário some do cartão. Ele é de ${apagando.autor?.nome ?? 'outra pessoa'}.`}
          rotuloConfirmar="Apagar comentário" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
