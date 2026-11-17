import { Download, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import { apagarArquivo, enviarArquivo, linkParaBaixar, listarArquivos } from '@/data/arquivos'
import { ARQUIVO_GRANDE_DEMAIS } from '@/lib/erros'
import { TAMANHO_MAXIMO_ARQUIVO } from '@/lib/arquivos'
import { FUSO } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import { cn } from '@/lib/utils'

const QUANDO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' })
const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const BOTAO_PERIGO = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
const LIMITE_EM_MB = TAMANHO_MAXIMO_ARQUIVO / 1048576

function formatarTamanho(bytes) {
  if (bytes >= 1048576) return `${DECIMAL.format(bytes / 1048576)} MB`
  if (bytes >= 1024) return `${DECIMAL.format(bytes / 1024)} KB`
  return `${bytes} B`
}

// Quem manda arquivo, como private.posso_enviar_arquivo (o banco confere): a central, mesmo com o cliente
// arquivado; e, com o cliente ativo na consultoria dela, a administração e o consultor dele.
function podeEnviar(perfil, cliente) {
  if (veTudo(perfil)) return true
  if (cliente.arquivado) return false
  if (!cliente.consultoria_id || perfil.consultoria_id !== cliente.consultoria_id) return false
  return perfil.papel === 'admin' || perfil.papel === 'gestor' || perfil.id === cliente.consultor_id
}

// Quem apaga: a central, quem enviou e a administração da consultoria do arquivo.
function podeApagar(perfil, arquivo) {
  if (veTudo(perfil) || arquivo.enviado_por === perfil.id) return true
  return (perfil.papel === 'admin' || perfil.papel === 'gestor') && !!arquivo.consultoria_id && arquivo.consultoria_id === perfil.consultoria_id
}

// Aba Arquivos do cliente: área de soltar, tabela paginada no banco, baixar e apagar.
export default function ArquivosDoCliente({ cliente, perfil }) {
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(null) // nome do arquivo em envio
  const [problemas, setProblemas] = useState([])
  const [arrastando, setArrastando] = useState(false)
  const [apagando, setApagando] = useState(null)
  const entrada = useRef(null)
  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  const pode = podeEnviar(perfil, cliente)

  useEffect(() => {
    let ativo = true
    listarArquivos(cliente.id, { pagina })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && pagina > 1) return setPagina(1)
        setResultado(r)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os arquivos.'))
    return () => {
      ativo = false
    }
  }, [cliente.id, pagina, versao])

  async function enviar(lista) {
    if (enviando || lista.length === 0) return
    const falhas = []
    for (const arquivo of lista) {
      if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
        falhas.push(`${arquivo.name}: ${ARQUIVO_GRANDE_DEMAIS}`)
        continue
      }
      setEnviando(arquivo.name)
      const { erro: falha } = await enviarArquivo(cliente.id, arquivo)
      if (falha) falhas.push(`${arquivo.name}: ${falha}`)
      else toast.success(`${arquivo.name} enviado.`)
    }
    setEnviando(null)
    setProblemas(falhas)
    setPagina(1)
    recarregar()
  }

  function aoEscolher(e) {
    const lista = Array.from(e.target.files ?? [])
    e.target.value = ''
    enviar(lista)
  }

  function aoSoltar(e) {
    e.preventDefault()
    setArrastando(false)
    if (!enviando) enviar(Array.from(e.dataTransfer?.files ?? []))
  }

  // Depois do await, o Safari bloqueia window.open (já não conta como clique). O link vem como download
  // (Content-Disposition: attachment): um <a download> clicado aqui baixa sem sair da página.
  async function baixar(arquivo) {
    const { url, erro: falha } = await linkParaBaixar(arquivo)
    if (falha) return toast.error(falha)
    const link = document.createElement('a')
    link.href = url
    link.download = arquivo.nome
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  }

  async function apagar(arquivo) {
    const resposta = await apagarArquivo(arquivo)
    if (resposta.erro) return resposta
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(`${arquivo.nome} apagado.`)
    recarregar()
    return resposta
  }

  const itens = resultado?.itens ?? null
  return (
    <section aria-labelledby="titulo-arquivos" className="grid gap-3">
      <h2 id="titulo-arquivos" className="text-janela font-bold">Arquivos</h2>
      {pode && (
        <div data-testid="area-de-soltar" aria-busy={!!enviando}
          onDragOver={(e) => { e.preventDefault(); if (!enviando) setArrastando(true) }}
          onDragLeave={() => setArrastando(false)} onDrop={aoSoltar}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-card/60 p-6 text-center text-corpo text-muted-foreground transition-colors',
            arrastando && 'border-primary bg-primary/5', enviando && 'opacity-60',
          )}>
          <Upload className="size-5" aria-hidden="true" />
          {enviando ? (
            <p role="status">Enviando {enviando}…</p>
          ) : (
            <p>Solte os arquivos aqui ou escolha no computador. Até {LIMITE_EM_MB} MB cada.</p>
          )}
          <input ref={entrada} type="file" multiple hidden data-testid="entrada-de-arquivo" onChange={aoEscolher} />
          <Button type="button" variant="outline" disabled={!!enviando} onClick={() => entrada.current?.click()}>
            Escolher arquivo
          </Button>
        </div>
      )}
      {problemas.length > 0 && (
        <ul role="alert" className="grid gap-1 text-corpo text-destructive">
          {problemas.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}
        </ul>
      )}
      {erro && <p role="alert" className="text-corpo text-destructive">{erro}</p>}
      {!erro && itens === null && <GraficoCarregando texto="Carregando os arquivos…" className="py-8" />}
      {itens?.length === 0 && <ListaVazia>Nenhum arquivo enviado ainda.</ListaVazia>}
      {itens?.length > 0 && (
        <Tabela rotulo="Arquivos" colunas={['Nome', 'Tamanho', 'Enviado por', 'Quando']} larguraMinima={640}
          paginacao={{ pagina, total: resultado.total, aoMudar: setPagina }}>
          {itens.map((a) => (
            <Linha key={a.id}>
              <Celula className="font-medium break-all">{a.nome}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{formatarTamanho(a.tamanho)}</Celula>
              <Celula className="text-muted-foreground">{a.autor ?? '—'}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(a.enviado_em))}</Celula>
              <CelulaAcoes>
                <Button variant="ghost" size="sm" onClick={() => baixar(a)}><Download /> Baixar</Button>
                {podeApagar(perfil, a) && (
                  <Button variant="ghost" size="sm" onClick={() => setApagando(a)} className={BOTAO_PERIGO}><Trash2 /> Apagar</Button>
                )}
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o arquivo ${apagando.nome}?`}
          descricao="O arquivo some de vez." rotuloConfirmar="Apagar arquivo" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
