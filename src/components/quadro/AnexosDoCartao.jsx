import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Celula, CelulaAcoes, Linha, Tabela } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import { ANEXOS_POR_PAGINA, anexosDoCartao, apagarAnexo, enviarAnexo, urlAssinada } from '@/data/quadro'
import { formatarTamanho, TAMANHO_MAXIMO_ARQUIVO } from '@/lib/arquivos'
import { FUSO } from '@/lib/mes'
import { cn } from '@/lib/utils'
import { temArquivos } from './useArquivosSoltos'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
const LIMITE_EM_MB = TAMANHO_MAXIMO_ARQUIVO / 1048576

// Anexos do cartão (como Arquivos do cliente): tabela paginada no banco (15 por página), enviar pelo botão ou arrastando
// para a área, baixar pelo link assinado (com o nome original) e apagar com confirmação (quem enviou ou a gestão:
// `pode_apagar` vem do banco). Até 25 MB, qualquer tipo. Anexo não se edita: apague e envie de novo. Quem só lê, baixa.
// Recusa do banco: o motivo aparece e `aoRecusar(erro)` avisa a janela. `aoMexer()`: o quadro relê a contagem ao fechar.
// `pasta`: a pasta do quadro no balde (pastaDoQuadro).
export default function AnexosDoCartao({ pasta, cartaoId, podeMexer, aoMexer, aoRecusar }) {
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(null) // nome do arquivo subindo
  const [problemas, setProblemas] = useState([])
  const [arrastando, setArrastando] = useState(false)
  const [apagando, setApagando] = useState(null)
  const entrada = useRef(null)
  const reler = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let ativo = true
    anexosDoCartao({ cartaoId, pagina })
      .then((r) => {
        if (!ativo) return
        // A página ficou vazia (o último anexo dela saiu): volta uma.
        if (!r.itens.length && pagina > 1) return setPagina((p) => p - 1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os anexos.'))
    return () => {
      ativo = false
    }
  }, [cartaoId, pagina, versao])

  async function enviar(arquivos) {
    if (!podeMexer || enviando || !arquivos.length) return
    const falhas = []
    let algum = false
    let recusa = null
    for (const arquivo of arquivos) {
      setEnviando(arquivo.name)
      const resposta = await enviarAnexo({ pasta, cartaoId }, arquivo)
      if (resposta.erro) {
        falhas.push(`${arquivo.name}: ${resposta.erro}`)
        recusa = resposta.erro
      } else {
        algum = true
        toast.success(`${arquivo.name} anexado.`)
      }
    }
    setEnviando(null)
    setProblemas(falhas)
    // Uma conferência de acesso por envio (não uma por arquivo recusado).
    if (recusa) aoRecusar(recusa)
    if (algum) {
      aoMexer()
      setPagina(1)
      reler()
    }
  }

  function escolher(e) {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    enviar(arquivos)
  }


  // Depois do await, o Safari bloqueia window.open: o link vem como download e um <a> clicado aqui baixa sem sair da
  // página (como em Arquivos do cliente).
  async function baixar(anexo) {
    const { url, erro: falha } = await urlAssinada(anexo.caminho, { nome: anexo.nome })
    if (falha) return toast.error(falha)
    const link = document.createElement('a')
    link.href = url
    link.download = anexo.nome
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  }

  async function apagar(anexo) {
    const resposta = await apagarAnexo(anexo)
    if (resposta.erro) {
      aoRecusar(resposta.erro)
      return resposta
    }
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(`${anexo.nome} apagado.`)
    aoMexer()
    reler()
    return resposta
  }

  const itens = resultado?.itens ?? null
  const total = resultado?.total ?? 0
  const soltavel = podeMexer && !enviando

  return (
    <section aria-label="Anexos" className="min-w-0 space-y-3"
      onDragOver={(e) => {
        // Só arquivo, e só para quem mexe (sem isso, o navegador recusa o solto e a janela de baixo o barra).
        if (!soltavel || !temArquivos(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setArrastando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setArrastando(false)
      }}
      onDrop={(e) => {
        if (!temArquivos(e)) return
        // O arquivo solto nunca abre no lugar do app, nem para quem só lê.
        e.preventDefault()
        setArrastando(false)
        if (soltavel) enviar(Array.from(e.dataTransfer.files ?? []))
      }}>
      <h3 className="section-label flex items-center gap-1.5">
        <Paperclip className="size-3.5" aria-hidden="true" /> Anexos
        {total > 0 && <span className="font-normal tabular-nums tracking-normal">{total.toLocaleString('pt-BR')}</span>}
      </h3>

      {podeMexer && (
        <div aria-busy={Boolean(enviando)}
          className={cn('flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed bg-card/60 px-4 py-3 text-corpo text-muted-foreground transition-colors',
            arrastando && 'border-primary bg-primary/5 text-foreground', enviando && 'opacity-70')}>
          <Upload className="size-4 shrink-0" aria-hidden="true" />
          <p role="status" className="min-w-0 flex-1">
            {enviando ? `Enviando ${enviando}…` : arrastando ? 'Solte para anexar.' : `Arraste arquivos para cá ou escolha. Até ${LIMITE_EM_MB} MB cada.`}
          </p>
          <input ref={entrada} type="file" multiple hidden aria-label="Escolher arquivos para anexar" onChange={escolher} />
          <Button type="button" variant="outline" size="sm" disabled={Boolean(enviando)} onClick={() => entrada.current?.click()}>
            <Paperclip /> Escolher arquivo
          </Button>
        </div>
      )}

      {problemas.length > 0 && (
        <ul role="alert" className="grid gap-1 text-corpo text-destructive">
          {problemas.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}
        </ul>
      )}
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os anexos…" className="py-4" />}
      {itens?.length === 0 && <p className="text-corpo text-muted-foreground">Nenhum anexo.</p>}
      {itens?.length > 0 && (
        <Tabela rotulo="Anexos do cartão" colunas={['Nome', 'Tamanho', 'Enviado por', 'Quando']} larguraMinima={560}
          paginacao={{ pagina, total, porPagina: ANEXOS_POR_PAGINA, aoMudar: setPagina }}>
          {itens.map((a) => (
            <Linha key={a.id}>
              <Celula className="font-medium break-all">{a.nome}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{formatarTamanho(a.tamanho)}</Celula>
              <Celula className="text-muted-foreground">{a.enviado_por?.nome ?? '—'}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(a.enviado_em))}</Celula>
              <CelulaAcoes>
                <Button type="button" variant="ghost" size="sm" aria-label={`Baixar ${a.nome}`} onClick={() => baixar(a)}><Download /> Baixar</Button>
                {podeMexer && a.pode_apagar && (
                  <Button type="button" variant="ghost" size="sm" aria-label={`Apagar ${a.nome}`} className={BOTAO_PERIGO} onClick={() => setApagando(a)}>
                    <Trash2 /> Apagar
                  </Button>
                )}
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}

      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o anexo ${apagando.nome}?`}
          descricao="O arquivo sai do cartão e some de vez." rotuloConfirmar="Apagar anexo" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
