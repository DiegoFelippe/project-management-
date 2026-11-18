import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Building2, Globe, ListChecks, ListOrdered, TriangleAlert, Workflow } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import Seletor from '@/components/campos/Seletor'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buscarConsultoriasAtivas } from '@/data/consultorias'
import { salvarModelo } from '@/data/modelos'
import { plural } from '@/lib/nomes'
import { veTudo } from '@/lib/papeis'
import { OPCOES_DE_TIPO } from '@/lib/tiposDeConsultoria'
import { cn } from '@/lib/utils'
import EditorDeEtapas from './EditorDeEtapas'
import { LIMITES, paraSalvar, rascunhoDe, rascunhoNovo, resumoDoRascunho, tarefasEmOrdem, validarModelo } from './modelo'
import PreviaDoFluxo from './PreviaDoFluxo'

const CAMPO_TEXTO = 'input texto-de-campo min-h-20 w-full resize-y py-2'

// Consultorias ativas (as arquivadas não recebem modelo), buscadas no banco pelo nome.
const buscarConsultoria = async (termo) => {
  const { itens, total } = await buscarConsultoriasAtivas(termo)
  return { itens: itens.map((c) => ({ valor: c.id, rotulo: c.nome })), total }
}

const OPCOES_DE_PARA = [
  { valor: 'todas', titulo: 'Todas as consultorias', dica: 'Inclusive as que entrarem depois.', icone: Globe },
  { valor: 'uma', titulo: 'Uma consultoria', dica: 'Só ela vê e aplica nos clientes dela.', icone: Building2 },
]

// "Para quem" da Central: todas ou uma (cartões de opção, como "Como a pessoa entra" na ficha).
function EscolhaDoPara({ valor, aoMudar }) {
  function teclar(evento, indice) {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[evento.key]
    if (!passo) return
    evento.preventDefault()
    const proxima = OPCOES_DE_PARA[(indice + passo + OPCOES_DE_PARA.length) % OPCOES_DE_PARA.length]
    aoMudar(proxima.valor)
    evento.currentTarget.parentElement.querySelector(`[data-para="${proxima.valor}"]`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Para quem" className="grid gap-2">
      {OPCOES_DE_PARA.map((o, i) => {
        const escolhida = valor === o.valor
        return (
          <button key={o.valor} type="button" role="radio" aria-checked={escolhida} data-para={o.valor} tabIndex={escolhida ? 0 : -1}
            onClick={() => aoMudar(o.valor)} onKeyDown={(e) => teclar(e, i)}
            className={cn('botao-animado flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
              escolhida ? 'border-primary bg-primary/5 ring-primary/15 ring-2' : 'bg-card hover:border-primary/40')}>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', escolhida ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <o.icone className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-rotulo font-semibold">{o.titulo}</span>
              <span className="text-muted-foreground block text-legenda">{o.dica}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// "Para quem" que não muda: a gestão cria só para a própria consultoria; um modelo da gestão de uma consultoria continua dela.
function ParaFixo({ nome, dica }) {
  return (
    <div role="group" aria-label="Para quem" className="bg-muted/40 flex items-start gap-3 rounded-xl border px-3 py-2.5">
      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <Building2 className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-rotulo font-semibold">{nome}</span>
        <span className="text-muted-foreground block text-legenda">{dica}</span>
      </span>
    </div>
  )
}

// Janela do modelo de check-in (Padrão Hub, larga, duas colunas): à esquerda nome, descrição, tipo, para quem, resumo e o
// aviso de quem já usa; à direita, nas abas, as etapas e tarefas ou a prévia do fluxograma. Nada vai ao banco antes de
// Salvar (uma chamada só, com o modelo inteiro) e Cancelar descarta o rascunho.
// `modelo` (modelo_completo): editar. `origem` (modelo_completo): duplicar ("Cópia de X", salva como modelo novo). Sem
// os dois: novo. `clientesUsando`: os clientes que quem edita vê usando (para o aviso). `aoSalvar({ id, nome, novo })`.
// "para": a Central escolhe (todas ou uma); editando um modelo da gestão de uma consultoria, vai o id dela (o banco
// recusa mudar); a gestão manda sempre a própria consultoria (o banco grava a dela de qualquer jeito).
export default function JanelaModelo({ modelo, origem, clientesUsando = 0, aoFechar, aoSalvar }) {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const editando = Boolean(modelo)
  const fonte = modelo ?? origem
  const paraFixo = !central
    ? { id: perfil.consultoria_id, nome: perfil.consultoria?.nome ?? 'Sua consultoria', dica: 'O gestor cria modelos só para a própria consultoria.' }
    : editando && !modelo.da_central
      ? { id: modelo.consultoria.id, nome: modelo.consultoria.nome, dica: 'Modelo da gestão desta consultoria: continua sendo dela.' }
      : null

  const [rascunho, setRascunho] = useState(() => {
    const r = fonte ? rascunhoDe(fonte, { duplicar: !editando }) : rascunhoNovo('todas')
    return paraFixo ? { ...r, para: paraFixo.id } : r
  })
  // O rascunho como abriu: fechar com mudanças pergunta antes de descartar.
  const inicial = useRef(rascunho)
  const [descartando, setDescartando] = useState(false)
  // Nome de cada consultoria já mostrada (a do modelo e as escolhidas no Seletor, que vêm do banco): o campo mostra
  // sempre o nome do "para" atual, então o nome e o que vai ser salvo não se separam.
  const [nomesDasConsultorias, setNomesDasConsultorias] = useState(
    () => (fonte?.consultoria ? { [fonte.consultoria.id]: fonte.consultoria.nome } : {}))
  const [aba, setAba] = useState('tarefas')
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroDoBanco, setErroDoBanco] = useState(null)
  const idBase = useId()
  const formulario = useRef(null)
  // Trocar de aba começa do topo (a lista de tarefas é longa; a prévia apareceria cortada).
  function trocarAba(valor) {
    setAba(valor)
    formulario.current?.closest('[data-slot="janela-corpo"]')?.scrollTo?.({ top: 0 })
  }

  // Depois do primeiro Salvar, os erros acompanham o rascunho (corrigiu, a marca some).
  const erros = useMemo(() => (tentou ? validarModelo(rascunho) : null), [tentou, rascunho])
  const resumo = resumoDoRascunho(rascunho)
  const erroNasTarefas = Boolean(erros && (erros.etapas.size || erros.tarefas.size))
  const mensagem = erros?.msg ?? erroDoBanco
  const umaConsultoria = rascunho.para !== 'todas'

  // Estável: o editor guarda as ações dele uma vez só (as tarefas memorizadas não redesenham a cada letra).
  const mudar = useCallback((f) => { setErroDoBanco(null); setRascunho(f) }, [])

  async function salvar(evento) {
    evento.preventDefault()
    if (salvando) return
    setTentou(true)
    const validacao = validarModelo(rascunho)
    if (validacao.msg) {
      // Os campos do modelo e as etapas ficam na aba "Etapas e tarefas" (no celular, a prévia esconde a coluna dos dados).
      if (aba !== 'tarefas') trocarAba('tarefas')
      // O foco vai para o primeiro campo marcado (depois de a marca aparecer).
      setTimeout(() => formulario.current?.querySelector('[aria-invalid="true"], [data-erro] input')?.focus(), 0)
      return
    }
    setErroDoBanco(null)
    setSalvando(true)
    // Ao editar, vai junto o atualizado_em lido ao abrir: se alguém salvou depois, o banco recusa (modelo_mudou).
    const dados = paraSalvar(rascunho)
    const resposta = await salvarModelo(editando ? modelo.id : null, editando ? { ...dados, atualizado_em: modelo.atualizado_em } : dados)
    setSalvando(false)
    if (resposta.erro) return setErroDoBanco(resposta.erro)
    aoSalvar({ id: resposta.id, nome: rascunho.nome.trim(), novo: !editando })
  }

  // Esc, o X e Cancelar: sem mudanças fecha; com mudanças pergunta (nada vai ao banco antes de Salvar).
  function pedirFechar() {
    if (salvando) return
    if (JSON.stringify(rascunho) === JSON.stringify(inicial.current)) return aoFechar()
    setDescartando(true)
  }

  const etapasDaPrevia = useMemo(() => rascunho.etapas.map((e) => ({ id: e.id, nome: e.nome })), [rascunho.etapas])
  const tarefasDaPrevia = useMemo(() => tarefasEmOrdem(rascunho), [rascunho])

  const descricao = origem
    ? `Cópia de "${origem.nome}". Ajuste o que precisar e salve.`
    : editando ? 'Ao salvar, o modelo atualizado fica disponível para aplicar.' : 'Ao salvar, o modelo fica disponível para aplicar nos clientes.'

  return (
    <>
      <JanelaFormulario aberto aoFechar={pedirFechar} titulo={editando ? 'Editar modelo de check-in' : 'Novo modelo de check-in'}
        descricao={descricao} icone={ListChecks} largura="7xl" alturaFixa enviando={salvando}
        abas={(
          <AbasSegmentadas rotulo="Partes do modelo" comoAbas idBase={idBase} valor={aba} aoMudar={trocarAba} abas={[
            { valor: 'tarefas', rotulo: 'Etapas e tarefas', icone: ListOrdered, erro: erroNasTarefas },
            { valor: 'previa', rotulo: 'Fluxograma (prévia)', icone: Workflow },
          ]} />
        )}
        rodape={(
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {mensagem && <p role="alert" className="text-destructive min-w-0 basis-full text-rotulo sm:mr-auto sm:basis-0 sm:flex-1">{mensagem}</p>}
            <Button type="button" variant="outline" onClick={pedirFechar} disabled={salvando}>Cancelar</Button>
            <Button type="submit" form="form-modelo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</Button>
          </div>
        )}>
        <form ref={formulario} id="form-modelo" noValidate onSubmit={salvar} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          {/* No celular as colunas empilham: na prévia, os dados do modelo saem do caminho do fluxograma. */}
          <div className={cn('min-w-0 space-y-5', aba === 'previa' && 'max-lg:hidden')}>
            <SecaoFormulario titulo="O modelo">
              <div className="grid gap-2">
                <Label htmlFor={`${idBase}-nome`}>Nome do modelo</Label>
                <Input id={`${idBase}-nome`} value={rascunho.nome} maxLength={LIMITES.nome} placeholder="Ex.: Gestão financeira"
                  aria-invalid={erros?.nome || undefined} className="h-10" onChange={(e) => mudar((r) => ({ ...r, nome: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${idBase}-descricao`}>Descrição (opcional)</Label>
                <textarea id={`${idBase}-descricao`} rows={3} maxLength={LIMITES.descricao} placeholder="Para que serve e quando aplicar"
                  className={CAMPO_TEXTO} value={rascunho.descricao} onChange={(e) => mudar((r) => ({ ...r, descricao: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${idBase}-tipo`}>Tipo de consultoria</Label>
                <Seletor id={`${idBase}-tipo`} valor={rascunho.tipo} aoMudar={(valor) => mudar((r) => ({ ...r, tipo: valor }))} opcoes={OPCOES_DE_TIPO} rotuloTodos="Nenhum" />
                <p className="text-muted-foreground text-legenda">Ao aplicar, os modelos do tipo do consultor do cliente vêm primeiro.</p>
              </div>
            </SecaoFormulario>
            <SecaoFormulario titulo="Para quem">
              {paraFixo ? <ParaFixo nome={paraFixo.nome} dica={paraFixo.dica} /> : (
                <>
                  <EscolhaDoPara valor={umaConsultoria ? 'uma' : 'todas'}
                    aoMudar={(valor) => mudar((r) => ({ ...r, para: valor === 'todas' ? 'todas' : (r.para === 'todas' ? (fonte?.consultoria?.id ?? '') : r.para) }))} />
                  {umaConsultoria && (
                    <div className="grid gap-2">
                      <Label htmlFor={`${idBase}-consultoria`}>Consultoria do modelo</Label>
                      <Seletor id={`${idBase}-consultoria`} valor={rascunho.para} buscar={buscarConsultoria} placeholder="Escolha…"
                        opcoes={rascunho.para ? [{ valor: rascunho.para, rotulo: nomesDasConsultorias[rascunho.para] ?? '' }] : []}
                        aoMudar={(valor, opcao) => {
                          setNomesDasConsultorias((nomes) => ({ ...nomes, [valor]: opcao?.rotulo ?? '' }))
                          mudar((r) => ({ ...r, para: valor }))
                        }} />
                      {erros?.para && <p className="text-destructive text-rotulo">Escolha a consultoria.</p>}
                    </div>
                  )}
                </>
              )}
            </SecaoFormulario>
            <div role="group" aria-label="Resumo" className="bg-muted/40 space-y-0.5 rounded-xl border px-3 py-2.5 text-rotulo">
              <p className="section-label mb-1">Resumo</p>
              <p className="tabular-nums">{plural(resumo.etapas, 'etapa', 'etapas')} · {plural(resumo.tarefas, 'tarefa', 'tarefas')}</p>
              <p className="tabular-nums">{plural(resumo.obrigatorias, 'obrigatória', 'obrigatórias')} · {plural(resumo.opcionais, 'opcional', 'opcionais')}</p>
              <p className="tabular-nums">Última tarefa no dia {resumo.maiorPrazo} a partir do início</p>
            </div>
            {editando && clientesUsando > 0 && (
              <p className="border-notice/30 bg-notice-soft text-notice flex items-start gap-2 rounded-xl border px-3 py-2.5 text-rotulo">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {clientesUsando === 1 ? '1 cliente que você vê usa' : `${clientesUsando.toLocaleString('pt-BR')} clientes que você vê usam`} este
                  modelo. O que você mudar vale para quem receber o modelo daqui em diante; quem já usa continua com o check-list que recebeu.
                </span>
              </p>
            )}
          </div>
          {aba === 'tarefas' ? (
            <div role="tabpanel" id={`${idBase}-painel-tarefas`} aria-labelledby={`${idBase}-aba-tarefas`} className="min-w-0">
              <EditorDeEtapas rascunho={rascunho} mudar={mudar} erros={erros} />
            </div>
          ) : (
            <div role="tabpanel" id={`${idBase}-painel-previa`} aria-labelledby={`${idBase}-aba-previa`} className="min-w-0">
              <PreviaDoFluxo etapas={etapasDaPrevia} tarefas={tarefasDaPrevia} rotulo="Prévia do fluxograma"
                dica='Como o consultor vai ver o fluxograma. As setas saem do "Depende de" de cada tarefa.' />
            </div>
          )}
        </form>
      </JanelaFormulario>
      {descartando && (
        <ConfirmarAcao aberto aoFechar={() => setDescartando(false)} titulo="Descartar as mudanças do modelo?"
          descricao="O que você mudou neste modelo se perde: nada foi salvo." rotuloConfirmar="Descartar"
          aoConfirmar={() => { aoFechar(); return { erro: null } }} />
      )}
    </>
  )
}
