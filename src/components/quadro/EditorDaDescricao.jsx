import { useEffect, useRef, useState } from 'react'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold, Check, Code, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, SquareCode,
  Strikethrough, Underline, Undo2, Unlink, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { urlsAssinadas } from '@/data/quadro'
import { TIPOS_DE_IMAGEM } from '@/lib/arquivos'
import { criarAssinador, imagemDoCartao, limparDescricao, limparHtmlColado, linkPermitido, normalizarLink } from './descricao'
import { useEscNoCampo } from './useEscNoCampo'

const ACEITAS = Object.keys(TIPOS_DE_IMAGEM).join(',')
const ehImagem = (arquivo) => Boolean(arquivo?.type?.startsWith('image/'))
const IMAGEM_DE_FORA = 'A imagem colada de outro endereço não entrou. Para pôr uma imagem, envie o arquivo pelo botão de imagem.'

// Imagem da descrição: o nó guarda o caminho no balde (src), nunca um link. Só entra (ao colar, arrastar ou abrir) a
// imagem deste cartão; o que aparece na tela é o link assinado, pedido na hora de mostrar (em lote, por `assinar`).
// Se a imagem não abre (o link venceu), pede um link novo uma vez; sem link (ou de novo sem abrir), mostra "Imagem
// indisponível". Sem a regra de markdown "![](endereço)" do TipTap, que criaria imagem de fora.
const ImagemDoCartao = Image.extend({
  addOptions() {
    return { ...this.parent?.(), inline: false, allowBase64: false, pasta: '', assinar: async () => null }
  },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: (el) => (imagemDoCartao(el.getAttribute('src'), this.options.pasta) ? null : false) }]
  },
  addInputRules() {
    return []
  },
  addNodeView() {
    const { pasta, assinar } = this.options
    return ({ node }) => {
      const caixa = document.createElement('div')
      caixa.className = 'imagem-da-descricao'
      const img = document.createElement('img')
      const aviso = document.createElement('span')
      aviso.className = 'imagem-indisponivel'
      aviso.textContent = 'Imagem indisponível'
      caixa.append(img, aviso)
      let atual
      let pediuDeNovo = false
      const indisponivel = (sim) => {
        img.hidden = sim
        aviso.hidden = !sim
      }
      const assinarEMostrar = (src) => assinar(src).then((url) => {
        if (atual !== src) return
        if (url) img.src = url
        else indisponivel(true)
      })
      img.addEventListener('error', () => {
        if (!atual || pediuDeNovo) return indisponivel(true)
        pediuDeNovo = true
        assinar.esquecer?.(atual)
        assinarEMostrar(atual)
      })
      const mostrar = (n) => {
        img.alt = n.attrs.alt || 'Imagem da descrição'
        if (n.attrs.title) img.title = n.attrs.title
        else img.removeAttribute('title')
        const src = n.attrs.src
        if (src === atual) return
        atual = src
        pediuDeNovo = false
        img.removeAttribute('src')
        indisponivel(false)
        // Endereço de fora nunca é carregado (o banco também não deixa gravar).
        if (!imagemDoCartao(src, pasta)) return indisponivel(true)
        assinarEMostrar(src)
      }
      mostrar(node)
      return {
        dom: caixa,
        update: (n) => {
          if (n.type !== node.type) return false
          mostrar(n)
          return true
        },
      }
    }
  },
})

function Ferramenta({ nome, ativo, desabilitado, aoClicar, children }) {
  return (
    <Button type="button" variant="ghost" size="icon" title={nome} aria-label={nome} aria-pressed={ativo ?? undefined}
      disabled={desabilitado}
      // O clique não tira a seleção do texto (a formatação vale para o trecho escolhido).
      onMouseDown={(e) => e.preventDefault()} onClick={aoClicar}
      className="aria-pressed:bg-primary/10 aria-pressed:text-primary-texto">
      {children}
    </Button>
  )
}

const Separador = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

// Descrição do cartão com o editor do Mochi (TipTap): negrito, itálico, sublinhado, tachado, títulos, listas, citação,
// código, link e imagem por upload. Só os nós e marcas que o banco aceita (StarterKit + imagem). Colar texto do Word ou
// de uma página traz a formatação, nunca HTML cru: o que é perigoso sai, imagem de fora não entra (e a pessoa é avisada)
// e link só http, https ou mailto. `conteudo`: o JSON gravado (lido só ao montar); `pasta`: `<pasta do quadro>/<cartao>/`;
// `aoMudar(json | null)` a cada mudança (quem chama espera a pessoa parar de digitar para gravar);
// `aoEnviarImagem(arquivo)` → { erro, caminho }.
export default function EditorDaDescricao({ conteudo, pasta, somenteLeitura = false, aoMudar, aoEnviarImagem }) {
  const [assinar] = useState(() => criarAssinador(urlsAssinadas))
  const [link, setLink] = useState(null) // { endereco, erro } enquanto a barra de link está aberta
  const [enviando, setEnviando] = useState(false)
  const entrada = useRef(null)
  const barraDoLink = useRef(null)
  const chamadas = useRef({ aoMudar, aoEnviarImagem })
  useEffect(() => {
    chamadas.current = { aoMudar, aoEnviarImagem }
  })
  const enviarImagens = useRef(async () => {})

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          isAllowedUri: (url) => linkPermitido(url),
          shouldAutoLink: (url) => linkPermitido(url) || (!/^[a-z][a-z0-9+.-]*:/i.test(url) && linkPermitido(`https://${url}`)),
        },
      }),
      ImagemDoCartao.configure({ pasta, assinar }),
      Placeholder.configure({ placeholder: 'Escreva a descrição do cartão…' }),
    ],
    content: conteudo ?? '',
    editable: !somenteLeitura,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Descrição do cartão',
        class: 'descricao-do-cartao texto-de-campo px-4 py-3 outline-none',
      },
      transformPastedHTML: (html) => {
        const limpo = limparHtmlColado(html, pasta)
        if (limpo.imagensDeFora) toast.warning(IMAGEM_DE_FORA)
        return limpo.html
      },
      // Print colado (só o arquivo, sem HTML): sobe para o balde. Com HTML (Word manda junto uma figura do trecho), vale
      // o texto.
      handlePaste: (_view, evento) => {
        const dados = evento.clipboardData
        if (!dados || dados.getData('text/html')) return false
        const imagens = Array.from(dados.files ?? []).filter(ehImagem)
        if (!imagens.length) return false
        evento.preventDefault()
        enviarImagens.current(imagens)
        return true
      },
      handleDrop: (_view, evento, _trecho, movido) => {
        if (movido) return false
        const imagens = Array.from(evento.dataTransfer?.files ?? []).filter(ehImagem)
        if (!imagens.length) return false
        evento.preventDefault()
        enviarImagens.current(imagens)
        return true
      },
    },
    onUpdate: ({ editor: e }) => chamadas.current.aoMudar?.(e.isEmpty ? null : limparDescricao(e.getJSON(), pasta)),
  }, [])

  useEffect(() => {
    enviarImagens.current = async (arquivos) => {
      setEnviando(true)
      for (const arquivo of arquivos) {
        const resposta = await chamadas.current.aoEnviarImagem(arquivo)
        if (!editor || editor.isDestroyed) return
        if (resposta?.erro) toast.error(resposta.erro)
        else if (resposta?.caminho) editor.chain().focus().setImage({ src: resposta.caminho }).run()
      }
      setEnviando(false)
    }
  }, [editor])

  // Quem perde a permissão no meio (ou abre só para ler) não edita mais; sem gravar nada por causa disso.
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable === somenteLeitura) editor.setEditable(!somenteLeitura, false)
  }, [editor, somenteLeitura])

  const ativo = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      negrito: e.isActive('bold'), italico: e.isActive('italic'), sublinhado: e.isActive('underline'), tachado: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      lista: e.isActive('bulletList'), numerada: e.isActive('orderedList'), citacao: e.isActive('blockquote'),
      codigo: e.isActive('code'), blocoDeCodigo: e.isActive('codeBlock'), link: e.isActive('link'),
      desfazer: e.can().undo(), refazer: e.can().redo(), vazio: e.isEmpty,
    } : {}),
  }) ?? {}

  const fecharLink = () => setLink(null)
  useEscNoCampo(barraDoLink, Boolean(link), fecharLink)

  function abrirLink() {
    setLink({ endereco: editor?.getAttributes('link').href ?? '', erro: null })
  }

  function aplicarLink() {
    const resposta = normalizarLink(link.endereco)
    if (resposta.erro) return setLink((l) => ({ ...l, erro: resposta.erro }))
    const cadeia = editor.chain().focus()
    if (!resposta.href) cadeia.extendMarkRange('link').unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive('link')) {
      // Sem trecho escolhido: entra o próprio endereço, já com o link.
      cadeia.insertContent([{ type: 'text', text: resposta.href, marks: [{ type: 'link', attrs: { href: resposta.href } }] }, { type: 'text', text: ' ' }]).run()
    } else cadeia.extendMarkRange('link').setLink({ href: resposta.href }).run()
    fecharLink()
  }

  function escolherImagem(e) {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (arquivos.length) enviarImagens.current(arquivos)
  }

  const c = () => editor?.chain().focus()

  return (
    <div className="rounded-xl border bg-card transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
      {!somenteLeitura && (
        <div role="toolbar" aria-label="Formatação da descrição" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
          <Ferramenta nome="Negrito" ativo={ativo.negrito} aoClicar={() => c()?.toggleBold().run()}><Bold /></Ferramenta>
          <Ferramenta nome="Itálico" ativo={ativo.italico} aoClicar={() => c()?.toggleItalic().run()}><Italic /></Ferramenta>
          <Ferramenta nome="Sublinhado" ativo={ativo.sublinhado} aoClicar={() => c()?.toggleUnderline().run()}><Underline /></Ferramenta>
          <Ferramenta nome="Tachado" ativo={ativo.tachado} aoClicar={() => c()?.toggleStrike().run()}><Strikethrough /></Ferramenta>
          <Separador />
          <Ferramenta nome="Título 1" ativo={ativo.h1} aoClicar={() => c()?.toggleHeading({ level: 1 }).run()}><Heading1 /></Ferramenta>
          <Ferramenta nome="Título 2" ativo={ativo.h2} aoClicar={() => c()?.toggleHeading({ level: 2 }).run()}><Heading2 /></Ferramenta>
          <Ferramenta nome="Título 3" ativo={ativo.h3} aoClicar={() => c()?.toggleHeading({ level: 3 }).run()}><Heading3 /></Ferramenta>
          <Separador />
          <Ferramenta nome="Lista" ativo={ativo.lista} aoClicar={() => c()?.toggleBulletList().run()}><List /></Ferramenta>
          <Ferramenta nome="Lista numerada" ativo={ativo.numerada} aoClicar={() => c()?.toggleOrderedList().run()}><ListOrdered /></Ferramenta>
          <Ferramenta nome="Citação" ativo={ativo.citacao} aoClicar={() => c()?.toggleBlockquote().run()}><Quote /></Ferramenta>
          <Separador />
          <Ferramenta nome="Código" ativo={ativo.codigo} aoClicar={() => c()?.toggleCode().run()}><Code /></Ferramenta>
          <Ferramenta nome="Bloco de código" ativo={ativo.blocoDeCodigo} aoClicar={() => c()?.toggleCodeBlock().run()}><SquareCode /></Ferramenta>
          <Ferramenta nome="Link" ativo={ativo.link || Boolean(link)} aoClicar={abrirLink}><Link2 /></Ferramenta>
          {ativo.link && (
            <Ferramenta nome="Tirar link" aoClicar={() => c()?.extendMarkRange('link').unsetLink().run()}><Unlink /></Ferramenta>
          )}
          <Ferramenta nome="Inserir imagem" desabilitado={enviando} aoClicar={() => entrada.current?.click()}><ImagePlus /></Ferramenta>
          <input ref={entrada} type="file" accept={ACEITAS} multiple hidden aria-label="Escolher imagem" onChange={escolherImagem} />
          <span className="ml-auto flex items-center gap-0.5">
            <Ferramenta nome="Desfazer" desabilitado={!ativo.desfazer} aoClicar={() => c()?.undo().run()}><Undo2 /></Ferramenta>
            <Ferramenta nome="Refazer" desabilitado={!ativo.refazer} aoClicar={() => c()?.redo().run()}><Redo2 /></Ferramenta>
          </span>
        </div>
      )}

      {link && (
        <div ref={barraDoLink} className="grid gap-1.5 border-b bg-primary/5 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <Input autoFocus aria-label="Endereço do link" placeholder="https://… ou e-mail" value={link.endereco}
              aria-invalid={Boolean(link.erro) || undefined} className="h-8 min-w-40 flex-1"
              onChange={(e) => setLink({ endereco: e.target.value, erro: null })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  aplicarLink()
                }
              }} />
            <Button type="button" size="sm" onClick={aplicarLink}><Check /> Aplicar</Button>
            <Button type="button" variant="outline" size="sm" onClick={fecharLink}><X /> Cancelar</Button>
          </div>
          {link.erro && <p role="alert" className="text-rotulo text-destructive">{link.erro}</p>}
        </div>
      )}

      <div className="max-h-[28rem] overflow-y-auto">
        <EditorContent editor={editor} hidden={Boolean(somenteLeitura && ativo.vazio)} />
        {somenteLeitura && ativo.vazio && <p className="px-4 py-3 text-corpo text-muted-foreground">Sem descrição.</p>}
      </div>

      {!somenteLeitura && (
        <p aria-live="polite" className="border-t px-3 py-1.5 text-legenda text-muted-foreground">
          {enviando ? 'Enviando imagem…' : 'Cole do Word ou da web: a formatação vem junto; imagem de outro endereço, não.'}
        </p>
      )}
    </div>
  )
}
