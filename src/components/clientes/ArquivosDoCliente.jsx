import { ArrowLeft, Download, Folder, FolderOpen, FolderPlus, Pencil, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Celula, CelulaAcoes, Linha, ListaVazia, Tabela } from '@/components/comum/Tabela'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  apagarArquivo, apagarPasta, criarPasta, enviarArquivo, linkParaBaixar, listarArquivos, listarPastas, renomearPasta,
} from '@/data/arquivos'
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

// Renomear e apagar a pasta: a central, quem criou e a administração da consultoria da pasta (como o arquivo).
function podeMudarPasta(perfil, pasta) {
  if (veTudo(perfil) || pasta.criada_por === perfil.id) return true
  return (perfil.papel === 'admin' || perfil.papel === 'gestor') && !!pasta.consultoria_id && pasta.consultoria_id === perfil.consultoria_id
}

const quantosArquivos = (n) => (n === 1 ? 'O 1 arquivo dela some de vez.' : `Os ${n} arquivos dela somem de vez.`)

// Nova pasta e Renomear: a mesma janela; com `pasta`, vem preenchida com o nome dela.
function FormularioDePasta({ pasta, aoFechar, aoSalvar }) {
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const novo = !pasta

  async function enviar(evento) {
    evento.preventDefault()
    if (!nome.trim()) return setErro('Dê um nome à pasta.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(nome.trim())
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={novo ? 'Nova pasta' : 'Renomear pasta'} icone={novo ? FolderPlus : Pencil}
      descricao={novo ? 'Agrupa arquivos deste cliente.' : 'O nome é único entre as pastas do cliente.'} enviando={enviando}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-pasta" disabled={enviando}>
            {enviando ? (novo ? 'Criando…' : 'Salvando…') : (novo ? 'Criar pasta' : 'Salvar')}
          </Button>
        </>
      )}>
      <form id="form-pasta" noValidate onSubmit={enviar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="nome-da-pasta">Nome da pasta</Label>
          <Input id="nome-da-pasta" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}

// Aba Arquivos do cliente: pastas e arquivos soltos (tabelas paginadas no banco), baixar, apagar e, dentro de
// uma pasta, só os arquivos dela.
export default function ArquivosDoCliente({ cliente, perfil }) {
  const [pasta, setPasta] = useState(null) // pasta aberta ({ id, nome }) ou null: a raiz
  const [paginaPastas, setPaginaPastas] = useState(1)
  const [pastas, setPastas] = useState(null)
  const [erroPastas, setErroPastas] = useState(null)
  const [formulario, setFormulario] = useState(null) // 'nova' | pasta que está sendo renomeada
  const [apagandoPasta, setApagandoPasta] = useState(null)
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

  const pastaId = pasta?.id ?? null

  useEffect(() => {
    if (pastaId) return undefined
    let ativo = true
    listarPastas(cliente.id, { pagina: paginaPastas })
      .then((r) => {
        if (!ativo) return
        if (r.foraDaFaixa && paginaPastas > 1) return setPaginaPastas(1)
        setPastas(r)
        setErroPastas(null)
      })
      .catch(() => ativo && setErroPastas('Não foi possível carregar as pastas.'))
    return () => {
      ativo = false
    }
  }, [cliente.id, pastaId, paginaPastas, versao])

  useEffect(() => {
    let ativo = true
    listarArquivos(cliente.id, { pastaId, pagina })
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
  }, [cliente.id, pastaId, pagina, versao])

  async function enviar(lista) {
    if (enviando || lista.length === 0) return
    const falhas = []
    for (const arquivo of lista) {
      if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
        falhas.push(`${arquivo.name}: ${ARQUIVO_GRANDE_DEMAIS}`)
        continue
      }
      setEnviando(arquivo.name)
      const { erro: falha } = await enviarArquivo(cliente.id, arquivo, { pastaId })
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

  function abrirPasta(p) {
    setPasta({ id: p.id, nome: p.nome })
    setResultado(null)
    setPagina(1)
    setProblemas([])
  }

  function voltar() {
    setPasta(null)
    setResultado(null)
    setPagina(1)
    setProblemas([])
  }

  async function salvarPasta(nome) {
    const resposta = formulario === 'nova' ? await criarPasta(cliente.id, nome) : await renomearPasta(formulario.id, nome)
    if (resposta.erro) return resposta
    toast.success(formulario === 'nova' ? `Pasta ${nome} criada.` : 'Pasta renomeada.')
    if (formulario === 'nova') setPaginaPastas(1)
    recarregar()
    return resposta
  }

  async function apagarAPasta(p) {
    const resposta = await apagarPasta(p)
    if (resposta.erro) return resposta
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(`Pasta ${p.nome} apagada.`)
    recarregar()
    return resposta
  }

  const itens = resultado?.itens ?? null
  const semPastas = !pasta && pastas?.total === 0
  return (
    <section aria-labelledby="titulo-arquivos" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {pasta && (
          <Button type="button" variant="outline" onClick={voltar}><ArrowLeft /> Voltar</Button>
        )}
        <h2 id="titulo-arquivos" className="text-janela mr-auto font-bold">{pasta ? pasta.nome : 'Arquivos'}</h2>
        {pode && !pasta && (
          <Button type="button" variant="outline" onClick={() => setFormulario('nova')}><FolderPlus /> Nova pasta</Button>
        )}
      </div>
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
      {erroPastas && !pasta && <p role="alert" className="text-corpo text-destructive">{erroPastas}</p>}
      {!pasta && pastas?.itens.length > 0 && (
        <Tabela rotulo="Pastas" colunas={['Nome', 'Arquivos', 'Criada em']} larguraMinima={560}
          paginacao={{ pagina: paginaPastas, total: pastas.total, aoMudar: setPaginaPastas }}>
          {pastas.itens.map((p) => (
            <Linha key={p.id}>
              <Celula className="font-medium break-all"><span className="inline-flex items-center gap-2"><Folder className="size-4 shrink-0 text-primary" aria-hidden="true" />{p.nome}</span></Celula>
              <Celula className="tabular-nums text-muted-foreground">{p.arquivos}</Celula>
              <Celula className="tabular-nums text-muted-foreground">{QUANDO.format(new Date(p.criada_em))}</Celula>
              <CelulaAcoes>
                <Button variant="ghost" size="sm" onClick={() => abrirPasta(p)}><FolderOpen /> Abrir</Button>
                {podeMudarPasta(perfil, p) && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setFormulario(p)}><Pencil /> Renomear</Button>
                    <Button variant="ghost" size="sm" onClick={() => setApagandoPasta(p)} className={BOTAO_PERIGO}><Trash2 /> Apagar</Button>
                  </>
                )}
              </CelulaAcoes>
            </Linha>
          ))}
        </Tabela>
      )}
      {itens?.length === 0 && pasta && <ListaVazia>Nenhum arquivo nesta pasta.</ListaVazia>}
      {itens?.length === 0 && !pasta && semPastas && <ListaVazia>Nenhum arquivo enviado ainda.</ListaVazia>}
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
      {formulario && (
        <FormularioDePasta pasta={formulario === 'nova' ? null : formulario} aoFechar={() => setFormulario(null)} aoSalvar={salvarPasta} />
      )}
      {apagandoPasta?.bloqueados > 0 && (
        <Dialog open onOpenChange={(abrir) => !abrir && setApagandoPasta(null)}>
          <DialogContent role="alertdialog" className="sm:max-w-md">
            <DialogHeader className="text-left">
              <DialogTitle className="text-janela">Não dá para apagar a pasta {apagandoPasta.nome}</DialogTitle>
              <DialogDescription className="text-rotulo">
                {apagandoPasta.bloqueados === 1
                  ? 'Esta pasta tem 1 arquivo que só quem enviou (ou a gestão/central) pode apagar. Apague-o antes ou peça a quem pode.'
                  : `Esta pasta tem ${apagandoPasta.bloqueados} arquivos que só quem enviou (ou a gestão/central) pode apagar. Apague-os antes ou peça a quem pode.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApagandoPasta(null)}>Entendi</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {apagandoPasta && !(apagandoPasta.bloqueados > 0) && (
        <ConfirmarAcao aberto aoFechar={() => setApagandoPasta(null)} titulo={`Apagar a pasta ${apagandoPasta.nome}?`}
          descricao={apagandoPasta.arquivos > 0 ? quantosArquivos(apagandoPasta.arquivos) : 'A pasta está vazia; só ela some.'}
          rotuloConfirmar="Apagar pasta" aoConfirmar={() => apagarAPasta(apagandoPasta)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o arquivo ${apagando.nome}?`}
          descricao="O arquivo some de vez." rotuloConfirmar="Apagar arquivo" aoConfirmar={() => apagar(apagando)} />
      )}
    </section>
  )
}
