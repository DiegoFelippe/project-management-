import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, RotateCcw, SquareKanban, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { GraficoCarregando } from '@/components/comum/Carregando'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  adicionarResponsavel, apagarCartao, arquivarCartao, buscarCartao, editarCartao, enviarImagemDaDescricao, moverCartao,
  tirarResponsavel,
} from '@/data/quadro'
import { FUSO } from '@/lib/mes'
import AnexosDoCartao from './AnexosDoCartao'
import ChecklistDoCartao from './ChecklistDoCartao'
import ComentariosDoCartao from './ComentariosDoCartao'
import EditorDaDescricao from './EditorDaDescricao'
import LateralDoCartao from './LateralDoCartao'
import EstadoDaGravacao from './EstadoDaGravacao'
import NaoSalvo from './NaoSalvo'
import { useArquivosSoltos } from './useArquivosSoltos'
import { useEscNoCampo } from './useEscNoCampo'
import { useGravacao } from './useGravacao'

// A descrição grava quando a pessoa para de digitar por este tempo (como no Mochi).
export const ESPERA_DA_DESCRICAO = 900
// Fechar espera as gravações em andamento até este tempo; depois fecha assim mesmo (elas terminam por trás e o tempo real
// traz o resultado ao quadro): a janela nunca fica presa num pedido que não volta.
export const ESPERA_AO_FECHAR = 8000
const ateTerminar = (promessa, ms) => Promise.race([promessa, new Promise((pronto) => setTimeout(pronto, ms))])
// O banco guarda até 200 mil bytes de descrição (o JSON do editor).
const MAXIMO_DA_DESCRICAO = 200000
const DESCRICAO_GRANDE = 'A descrição ficou grande demais para guardar. Tire um trecho (ou mande o texto longo como anexo).'
const SUMIU = 'Este cartão não está mais no quadro (ou você não o vê mais).'
const SEM_TITULO = 'Dê um título ao cartão.'
const DIA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const BOTAO_PERIGO = 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive'

// "A fazer · criado em 10/11/2026 às 10:00 por Ana Lima" (a hora de São Paulo).
function cabecalho(cartao) {
  const instante = new Date(cartao.criado_em)
  const quem = cartao.criado_por?.nome ? ` por ${cartao.criado_por.nome}` : ''
  return `${cartao.coluna?.nome ?? ''} · criado em ${DIA.format(instante)} às ${HORA.format(instante)}${quem}`
}

const quantos = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

function oQueSome(contagem) {
  const fim = 'Não dá para desfazer; para só tirar do quadro, use Arquivar.'
  if (!contagem) return `O cartão some de vez: o checklist, os comentários e os anexos somem junto. ${fim}`
  return `O cartão some de vez: o checklist (${quantos(contagem.checklist, 'item', 'itens')}), os comentários (${contagem.comentarios}) `
    + `e os anexos (${contagem.anexos}) somem junto. ${fim}`
}

// Janela do cartão (como no Mochi): à esquerda título, descrição e checklist; à direita Coluna, Prazo, Prioridade e
// Responsáveis; embaixo Comentários e Anexos. No celular, uma coluna só (a lateral desce). Grava campo a campo, sem botão
// Salvar ("Salvando… / Salvo / Erro ao salvar"; a descrição 900 ms depois que a pessoa para): é a exceção registrada ao
// rodapé Cancelar + Salvar do JanelaFormulario. As gravações do cartão vão em fila (a resposta velha nunca passa por cima
// da nova). Recusa do banco: o motivo aparece e o cartão é relido — sumiu (ou a pessoa não o vê mais): avisa, fecha e o
// quadro é relido; perdeu a permissão: vira só leitura e o quadro é relido. Quem só lê (central, dono, cliente arquivado,
// quem não atende o cliente) lê tudo, sem campos. `aoFechar(colunasMexidas)`: o quadro relê essas colunas (mesmo sem o
// tempo real); `aoQuadroMudou()`: o quadro relê tudo.
//
// Nada que a pessoa escreveu some calado: o título digitado que não gravou fica no campo (o cabeçalho só mostra o que o
// banco aceitou), a descrição que não gravou volta a esperar, e a mudança de outro campo que falhou fica guardada para
// refazer. Fechar tenta gravar de novo o que falta e, se ainda faltar algo, pergunta (NaoSalvo): continuar editando,
// tentar de novo ou fechar sem salvar.
export default function JanelaDoCartao({ cartaoId, quadro, cliente, perfil, aoFechar, aoQuadroMudou }) {
  const [cartao, setCartao] = useState(undefined) // undefined = carregando
  const [erro, setErro] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [confirmar, setConfirmar] = useState(null) // 'arquivar' | 'apagar'
  const [contagem, setContagem] = useState(null)
  const [fechando, setFechando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [naoSalvo, setNaoSalvo] = useState(null) // campos que não gravaram, ao fechar
  const [tentando, setTentando] = useState(false)
  const { estados, gravar } = useGravacao()
  const mexidas = useRef(new Set())
  const fila = useRef(Promise.resolve())
  const descricaoPendente = useRef(null)
  const relogio = useRef(null)
  const saindo = useRef(false)
  const campoTitulo = useRef(null)
  // O título: o texto do campo, o último que o banco aceitou e o último mandado (gravando ou gravado).
  const tituloDoCampo = useRef('')
  const tituloGravado = useRef('')
  const tituloEnviado = useRef('')
  // Mudanças de outros campos que o banco não gravou: chave → { campo, refazer }.
  const aRefazer = useRef(new Map())
  const mexeAgora = useRef(false) // o que o banco disse por último (pode_mexer), para as funções que rodam depois de esperar
  const atual = useRef({})
  useEffect(() => {
    atual.current = { cartao, aoFechar, aoQuadroMudou }
  })

  const sair = useCallback((colunas) => {
    saindo.current = true
    atual.current.aoFechar([...colunas])
  }, [])

  const sumiu = useCallback(() => {
    // O cartão não existe mais: nada do que esperava tem onde gravar (nem ao sair).
    clearTimeout(relogio.current)
    descricaoPendente.current = null
    aRefazer.current.clear()
    toast.warning(SUMIU)
    atual.current.aoQuadroMudou()
    sair([])
  }, [sair])

  useArquivosSoltos()

  const mudarTitulo = useCallback((texto) => {
    tituloDoCampo.current = texto
    setTitulo(texto)
  }, [])

  useEffect(() => {
    let ativo = true
    buscarCartao(cartaoId)
      .then((lido) => {
        if (!ativo) return
        if (!lido) return sumiu()
        setCartao(lido)
        mexeAgora.current = Boolean(lido.pode_mexer)
        tituloGravado.current = lido.titulo
        tituloEnviado.current = lido.titulo
        mudarTitulo(lido.titulo)
      })
      .catch(() => ativo && setErro('Não foi possível abrir o cartão.'))
    return () => {
      ativo = false
    }
  }, [cartaoId, tentativa, sumiu, mudarTitulo])

  function tentarDeNovo() {
    setErro(null)
    setTentativa((n) => n + 1)
  }

  // O banco recusou algo: relê o cartão para saber o que vale. Sumiu: fecha. Senão os campos de escolha voltam ao que está
  // gravado (o título digitado que não gravou fica no campo) e, sem permissão, a janela vira só leitura (o que não gravou
  // não tem mais como gravar). O quadro é relido.
  const conferir = useCallback(async (motivo) => {
    let lido
    try {
      lido = await buscarCartao(cartaoId)
    } catch {
      if (motivo) toast.error(motivo)
      return
    }
    if (!lido) return sumiu()
    if (motivo) toast.error(motivo)
    setCartao(lido)
    mexeAgora.current = Boolean(lido.pode_mexer)
    const digitado = tituloDoCampo.current.trim()
    const naoGravado = Boolean(digitado) && digitado !== tituloGravado.current
    tituloGravado.current = lido.titulo
    if (!naoGravado || !lido.pode_mexer) {
      tituloEnviado.current = lido.titulo
      mudarTitulo(lido.titulo)
    }
    if (!lido.pode_mexer) {
      descricaoPendente.current = null
      aRefazer.current.clear()
    }
    atual.current.aoQuadroMudou()
  }, [cartaoId, sumiu, mudarTitulo])

  // As gravações do cartão em fila: uma de cada vez, na ordem.
  function enfileirar(fazer) {
    const vez = fila.current.then(fazer, fazer)
    fila.current = vez.catch(() => {})
    return vez
  }

  // Grava um campo. Recusado: `aoFalhar()` (o que não gravou volta a esperar) ou `refazer` fica guardado (chave) para
  // tentar de novo, e o cartão é relido. Gravado: `aoGravar()`, e as colunas entram nas que o quadro relê ao fechar.
  async function salvar(campo, fazer, { colunas = [atual.current.cartao?.coluna_id], chave = campo, refazer, aoFalhar, aoGravar } = {}) {
    const resposta = await gravar(campo, () => enfileirar(fazer))
    if (resposta.erro) {
      if (refazer) aRefazer.current.set(chave, { campo, refazer })
      aoFalhar?.()
      await conferir(resposta.erro)
      return resposta
    }
    aRefazer.current.delete(chave)
    aoGravar?.()
    for (const id of colunas) if (id) mexidas.current.add(id)
    return resposta
  }

  // O título vai ao banco ao sair do campo (ou ao fechar). O cabeçalho só muda quando o banco aceita; se não aceitar, o
  // texto fica no campo para tentar de novo.
  function gravarTitulo() {
    if (!mexeAgora.current) return undefined
    const limpo = tituloDoCampo.current.trim()
    if (!limpo) {
      mudarTitulo(tituloGravado.current)
      toast.error(SEM_TITULO)
      return undefined
    }
    if (limpo === tituloEnviado.current) return undefined
    tituloEnviado.current = limpo
    mudarTitulo(limpo)
    return salvar('titulo', () => editarCartao(cartaoId, { titulo: limpo }), {
      aoFalhar: () => {
        if (tituloEnviado.current === limpo) tituloEnviado.current = tituloGravado.current
      },
      aoGravar: () => {
        tituloGravado.current = limpo
        setCartao((x) => ({ ...x, titulo: limpo }))
      },
    })
  }

  useEscNoCampo(campoTitulo, Boolean(cartao) && titulo !== cartao.titulo, () => mudarTitulo(tituloGravado.current))

  // A descrição que esperava a pessoa parar de digitar (nada a fazer se não há nenhuma). Se não gravar, volta a esperar
  // (a menos que já haja uma mais nova): Fechar tenta de novo.
  function gravarDescricao() {
    clearTimeout(relogio.current)
    const pendente = descricaoPendente.current
    descricaoPendente.current = null
    if (!pendente) return undefined
    const devolver = () => {
      if (!descricaoPendente.current) descricaoPendente.current = pendente
    }
    if (new TextEncoder().encode(JSON.stringify(pendente.json)).length > MAXIMO_DA_DESCRICAO) {
      toast.error(DESCRICAO_GRANDE)
      devolver()
      return gravar('descricao', async () => ({ erro: DESCRICAO_GRANDE }))
    }
    return salvar('descricao', () => editarCartao(cartaoId, { descricao: pendente.json }), { aoFalhar: devolver })
  }
  const gravarDescricaoDepois = useRef(gravarDescricao)
  useEffect(() => {
    gravarDescricaoDepois.current = gravarDescricao
  })

  function mudarDescricao(json) {
    descricaoPendente.current = { json }
    clearTimeout(relogio.current)
    relogio.current = setTimeout(() => gravarDescricaoDepois.current(), ESPERA_DA_DESCRICAO)
  }

  // A janela saiu (o quadro trocou de aba, por exemplo) com a descrição esperando: grava assim mesmo.
  useEffect(() => () => {
    if (descricaoPendente.current) gravarDescricaoDepois.current()
  }, [])

  // Põe o cartão na coluna (no fim). Também é o "refazer" de quando o banco não gravou.
  function moverPara(origem, colunaId) {
    const coluna = quadro.colunas.find((x) => x.id === colunaId)
    setCartao((x) => ({ ...x, coluna_id: colunaId, coluna: { id: colunaId, nome: coluna?.nome ?? '', concluidos: Boolean(coluna?.concluidos) } }))
    return salvar('coluna', () => moverCartao({ cartaoId, colunaId }), { colunas: [origem, colunaId], refazer: () => moverPara(origem, colunaId) })
  }

  function mudarColuna(colunaId) {
    const c = atual.current.cartao
    if (!colunaId || colunaId === c.coluna_id) return undefined
    return moverPara(c.coluna_id, colunaId)
  }

  function mudarPrazo(prazo) {
    setCartao((x) => ({ ...x, prazo: prazo || null }))
    return salvar('prazo', () => editarCartao(cartaoId, { prazo }), { refazer: () => mudarPrazo(prazo) })
  }

  function mudarPrioridade(prioridade) {
    setCartao((x) => ({ ...x, prioridade: prioridade || null }))
    return salvar('prioridade', () => editarCartao(cartaoId, { prioridade }), { refazer: () => mudarPrioridade(prioridade) })
  }

  function porResponsavel(pessoa) {
    const { id, nome, foto, cor } = pessoa
    setCartao((x) => (x.responsaveis.some((p) => p.id === id) ? x
      : { ...x, responsaveis: [...x.responsaveis, { id, nome, foto, cor }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
    return salvar('responsaveis', () => adicionarResponsavel(cartaoId, id), { chave: `responsaveis:${id}`, refazer: () => porResponsavel(pessoa) })
  }

  function incluirResponsavel(pessoa) {
    if (atual.current.cartao.responsaveis.some((p) => p.id === pessoa.id)) return undefined
    return porResponsavel(pessoa)
  }

  function tirarDoCartao(pessoa) {
    setCartao((x) => ({ ...x, responsaveis: x.responsaveis.filter((p) => p.id !== pessoa.id) }))
    return salvar('responsaveis', () => tirarResponsavel(cartaoId, pessoa.id), {
      chave: `responsaveis:${pessoa.id}`, refazer: () => tirarDoCartao(pessoa),
    })
  }

  // O que ainda não gravou (para quem mexe): o título digitado, a descrição que voltou a esperar e as mudanças guardadas.
  function naoGravados() {
    if (!mexeAgora.current) return []
    const campos = []
    const digitado = tituloDoCampo.current.trim()
    if (digitado && digitado !== tituloGravado.current) campos.push('titulo')
    if (descricaoPendente.current) campos.push('descricao')
    for (const { campo } of aRefazer.current.values()) if (!campos.includes(campo)) campos.push(campo)
    return campos
  }

  // Grava o título e a descrição pendentes (e, com `refazer`, as mudanças guardadas) e espera a fila, até
  // ESPERA_AO_FECHAR.
  function gravarOQueFalta({ refazer = false } = {}) {
    return ateTerminar((async () => {
      await gravarTitulo()
      await gravarDescricao()
      if (refazer) for (const item of [...aRefazer.current.values()]) await item.refazer()
      await enfileirar(() => null)
    })(), ESPERA_AO_FECHAR)
  }

  // Fechar (X, Esc ou Fechar): o título digitado e a descrição que esperava gravam antes (a que falhou tenta de novo), a
  // fila termina, e o quadro relê as colunas mexidas. Se algo ainda não gravou, pergunta o que fazer.
  async function fechar() {
    if (saindo.current || fechando) return
    setFechando(true)
    await gravarOQueFalta()
    if (saindo.current) return
    setFechando(false)
    const faltam = naoGravados()
    if (faltam.length) return setNaoSalvo(faltam)
    sair(mexidas.current)
  }

  async function tentarDeNovoAoFechar() {
    setTentando(true)
    await gravarOQueFalta({ refazer: true })
    setTentando(false)
    if (saindo.current) return
    const faltam = naoGravados()
    if (faltam.length) return setNaoSalvo(faltam)
    setNaoSalvo(null)
    sair(mexidas.current)
  }

  function fecharSemSalvar() {
    clearTimeout(relogio.current)
    descricaoPendente.current = null
    aRefazer.current.clear()
    setNaoSalvo(null)
    sair(mexidas.current)
  }

  async function arquivar() {
    await gravarTitulo()
    await gravarDescricao()
    const resposta = await enfileirar(() => arquivarCartao(cartaoId))
    if (resposta.erro) {
      conferir(null)
      return resposta
    }
    toast.success('Cartão arquivado.')
    mexidas.current.add(atual.current.cartao.coluna_id)
    sair(mexidas.current)
    return resposta
  }

  function abrirApagar() {
    setConfirmar('apagar')
    setContagem(null)
    // As contagens de agora (checklist, comentários e anexos podem ter mudado desde que a janela abriu).
    buscarCartao(cartaoId)
      .then((lido) => lido && setContagem({ checklist: lido.checklist.length, comentarios: lido.comentarios, anexos: lido.anexos }))
      .catch(() => {})
  }

  async function apagar() {
    clearTimeout(relogio.current)
    descricaoPendente.current = null
    const resposta = await enfileirar(() => apagarCartao(cartaoId))
    if (resposta.erro) {
      conferir(null)
      return resposta
    }
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success('Cartão apagado.')
    mexidas.current.add(atual.current.cartao.coluna_id)
    sair(mexidas.current)
    return resposta
  }

  const recusado = (motivo) => conferir(motivo)
  const mexeu = () => {
    const coluna = atual.current.cartao?.coluna_id
    if (coluna) mexidas.current.add(coluna)
  }

  if (!cartao) {
    return (
      <JanelaFormulario aberto aoFechar={() => sair([])} titulo="Cartão" icone={SquareKanban} largura="7xl">
        {erro ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-corpo text-destructive">{erro}</p>
            <Button type="button" variant="outline" onClick={tentarDeNovo}><RotateCcw /> Tentar de novo</Button>
          </div>
        ) : <GraficoCarregando texto="Abrindo o cartão…" className="py-12" />}
      </JanelaFormulario>
    )
  }

  const podeMexer = Boolean(cartao.pode_mexer)
  const somenteLeitura = podeMexer ? null : cliente.arquivado ? 'Cliente arquivado: o cartão é só para ler.' : 'Você vê este cartão só para ler.'

  return (
    <JanelaFormulario aberto aoFechar={fechar} icone={SquareKanban} largura="7xl" enviando={fechando}
      titulo={<span className="break-words">{cartao.titulo}</span>} descricao={cabecalho(cartao)}
      acaoEsquerda={podeMexer && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={fechando} onClick={() => setConfirmar('arquivar')}><Archive /> Arquivar</Button>
          {cartao.pode_apagar && (
            <Button type="button" variant="outline" disabled={fechando} className={BOTAO_PERIGO} onClick={abrirApagar}><Trash2 /> Apagar</Button>
          )}
        </div>
      )}
      rodape={<Button type="button" disabled={fechando} onClick={fechar}>{fechando ? 'Salvando…' : 'Fechar'}</Button>}>
      {somenteLeitura && <Aviso tipo="info">{somenteLeitura}</Aviso>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          {podeMexer && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cartao-titulo">Título</Label>
                <EstadoDaGravacao estado={estados.titulo} />
              </div>
              <Input ref={campoTitulo} id="cartao-titulo" className="h-10 font-semibold" maxLength={200} value={titulo}
                onChange={(e) => mudarTitulo(e.target.value)}
                onBlur={() => !saindo.current && !fechando && gravarTitulo()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }} />
            </div>
          )}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="form-label mb-0">Descrição</span>
              <EstadoDaGravacao estado={estados.descricao} />
            </div>
            <EditorDaDescricao conteudo={cartao.descricao} pasta={`${cliente.id}/${cartao.id}/`} somenteLeitura={!podeMexer}
              aoMudar={mudarDescricao} aoEnviarImagem={(arquivo) => enviarImagemDaDescricao({ clienteId: cliente.id, cartaoId: cartao.id }, arquivo)} />
          </div>
          <ChecklistDoCartao cartaoId={cartao.id} itensIniciais={cartao.checklist} podeMexer={podeMexer} aoMexer={mexeu} aoRecusar={recusado} />
        </div>
        <aside aria-label="Detalhes do cartão" className="min-w-0 space-y-4 lg:border-l lg:pl-6">
          <LateralDoCartao cartao={cartao} quadro={quadro} podeMexer={podeMexer} estados={estados}
            aoMudarColuna={mudarColuna} aoMudarPrazo={mudarPrazo} aoMudarPrioridade={mudarPrioridade}
            aoIncluirResponsavel={incluirResponsavel} aoTirarResponsavel={tirarDoCartao} />
        </aside>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t pt-6 xl:grid-cols-2">
        <ComentariosDoCartao cartaoId={cartao.id} perfil={perfil} podeMexer={podeMexer} podeGerir={Boolean(quadro.pode_gerir)}
          totalInicial={cartao.comentarios ?? 0} aoMexer={mexeu} aoRecusar={recusado} />
        <AnexosDoCartao clienteId={cliente.id} cartaoId={cartao.id} podeMexer={podeMexer} aoMexer={mexeu} aoRecusar={recusado} />
      </div>

      {naoSalvo && (
        <NaoSalvo campos={naoSalvo} tentando={tentando} aoContinuar={() => setNaoSalvo(null)} aoTentar={tentarDeNovoAoFechar}
          aoDescartar={fecharSemSalvar} />
      )}
      {confirmar === 'arquivar' && (
        <ConfirmarAcao aberto perigo={false} aoFechar={() => setConfirmar(null)} titulo={`Arquivar o cartão ${cartao.titulo}?`}
          descricao="Ele sai do quadro e fica em Arquivados, com checklist, comentários e anexos. Dá para restaurar quando quiser."
          rotuloConfirmar="Arquivar cartão" aoConfirmar={arquivar} />
      )}
      {confirmar === 'apagar' && (
        <ConfirmarAcao aberto aoFechar={() => setConfirmar(null)} titulo={`Apagar o cartão ${cartao.titulo}?`}
          descricao={oQueSome(contagem)} rotuloConfirmar="Apagar cartão" aoConfirmar={apagar} />
      )}
    </JanelaFormulario>
  )
}
