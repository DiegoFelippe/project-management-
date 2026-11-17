import { useCallback, useEffect, useRef, useState } from 'react'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { ListaVazia } from '@/components/comum/Tabela'
import { Button } from '@/components/ui/button'
import { apagarColuna, criarColuna, editarColuna } from '@/data/quadro'
import { hoje as hojeEmSP } from '@/lib/mes'
import { useAtraso } from '@/lib/useAtraso'
import { veTudo } from '@/lib/papeis'
import AbrirCartao from './AbrirCartao'
import { useAlturaDoQuadro } from './alturaDoQuadro'
import ApagarColuna from './ApagarColuna'
import BarraDoQuadro from './BarraDoQuadro'
import Coluna from './Coluna'
import IndicadoresDoQuadro from './IndicadoresDoQuadro'
import JanelaArquivados from './JanelaArquivados'
import JanelaNovoCartao from './JanelaNovoCartao'
import NovaColuna from './NovaColuna'
import { travarRolagem } from './travaDaRolagem'
import { FILTROS_VAZIOS, temFiltro, useQuadro } from './useQuadro'

// Aba Quadro do cliente (Kanban do Mochi; desenho em docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md): barra
// de filtros → 4 números → colunas lado a lado (300 px; o quadro rola de lado dentro da área dele e, no celular, uma
// coluna por vez). O quadro ocupa o resto da tela e cada coluna rola sozinha (decisão do Diego, 17/11, como no Trello):
// arrastar perto da borda rola a coluna, e no meio do arrasto a página não rola (travaDaRolagem.js). Quem mexe
// (consultor do cliente, administrador e gestor da consultoria, com o cliente ativo) cria e arrasta cartões e colunas;
// apagar coluna é da gestão; a central e o dono só leem (e escolhem o quadro de uma consultoria anterior). O banco decide (pode_mexer, pode_gerir); a tela só esconde o que a pessoa não pode. Clicar num cartão (ou
// criar um pelo "Novo cartão") abre a janela do cartão; ao fechar, o quadro relê as colunas que ela mexeu (mesmo sem o
// tempo real, no plano B).
export default function QuadroDoCliente({ cliente, perfil }) {
  const central = veTudo(perfil)
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const buscaAtrasada = useAtraso(filtros.busca, 300)
  const [janela, setJanela] = useState(null) // { tipo: 'novo', colunaId } | { tipo: 'arquivados' } | { tipo: 'apagar', colunaId }
  const [cartaoAberto, setCartaoAberto] = useState(null)
  const {
    quadros, quadro, erro, semAcesso, colunas, indicadores,
    escolher, lerTudo, relerQuadro, lerColuna, lerNumeros, mudarQuadro, verMais, comecarArrasto, soltar,
  } = useQuadro({ clienteId: cliente.id, central, filtros: { ...filtros, busca: buscaAtrasada } })
  const abrirCartao = useCallback((id) => setCartaoAberto(id), [])
  const faixa = useRef(null)
  const altura = useAlturaDoQuadro(faixa, Boolean(quadro) && !erro && !semAcesso)
  const destravar = useRef(null)
  const soltarRolagem = useCallback(() => {
    destravar.current?.()
    destravar.current = null
  }, [])
  useEffect(() => soltarRolagem, [soltarRolagem])

  if (semAcesso) return <ListaVazia>Você não tem mais acesso a este quadro.</ListaVazia>
  if (erro) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-corpo text-destructive">{erro}</p>
        <Button type="button" variant="outline" onClick={lerTudo}><RotateCcw /> Tentar de novo</Button>
      </div>
    )
  }
  if (quadro === undefined) return <GraficoCarregando texto="Carregando o quadro…" className="py-12" />
  if (quadro === null) {
    return <ListaVazia>{central ? 'Nenhuma consultoria abriu o quadro deste cliente ainda.' : 'Este cliente não tem quadro.'}</ListaVazia>
  }

  const podeMexer = quadro.pode_mexer
  const filtrando = temFiltro(filtros)
  const hoje = hojeEmSP()
  // Quantos cartões passam pelos filtros: a soma das contagens do banco de cada coluna filtrada (os números do topo
  // seguem só o responsável). Enquanto alguma coluna não chegou, a frase fica sem o número.
  const totais = quadro.colunas.map((c) => colunas[c.id]?.total)
  const comFiltro = totais.every((t) => typeof t === 'number') ? totais.reduce((soma, t) => soma + t, 0) : null

  // Mudança numa coluna: mostra na hora; se o banco recusar, avisa e relê o quadro.
  async function mudarColuna(coluna, campos) {
    const antes = quadro
    mudarQuadro({ ...quadro, colunas: quadro.colunas.map((c) => (c.id === coluna.id ? { ...c, ...campos } : c)) })
    const resposta = await editarColuna(coluna.id, campos)
    if (resposta.erro) {
      mudarQuadro(antes)
      toast.error(resposta.erro)
      lerTudo()
    } else if ('concluidos' in campos) {
      // Atrasados e "vencem em 7 dias" não contam a coluna de concluídos.
      lerNumeros(quadro.id)
    }
  }

  async function criarNovaColuna(nome) {
    const resposta = await criarColuna({ quadroId: quadro.id, nome })
    if (resposta.erro) {
      toast.error(resposta.erro)
      lerTudo()
    } else {
      relerQuadro()
    }
    return resposta
  }

  async function apagarAColuna(coluna, opcoes) {
    const resposta = await apagarColuna(coluna.id, opcoes)
    // Recusado (sem permissão, coluna que já saiu): a janela mostra o motivo e o quadro é relido.
    if (resposta.erro) {
      lerTudo()
      return resposta
    }
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(`Coluna ${coluna.nome} apagada.`)
    lerTudo()
    return resposta
  }

  function aoCriarCartao(id, colunaId, aviso) {
    if (aviso) toast.warning(`O cartão foi criado, mas: ${aviso}`)
    else toast.success('Cartão criado.')
    lerColuna(quadro.id, colunaId)
    lerNumeros(quadro.id)
    abrirCartao(id)
  }

  // A janela do cartão fechou: relê as colunas que ela mexeu (o cartão, a coluna nova dele) e os números.
  function fecharCartao(colunasMexidas = []) {
    setCartaoAberto(null)
    const ids = colunasMexidas.filter((id) => quadro.colunas.some((c) => c.id === id))
    for (const id of ids) lerColuna(quadro.id, id)
    if (ids.length) lerNumeros(quadro.id)
  }

  function abrirApagar(coluna) {
    // As contagens da confirmação vêm do quadro: relê para dizer quantos somem com os números de agora.
    relerQuadro()
    setJanela({ tipo: 'apagar', colunaId: coluna.id })
  }

  // Leitor de tela: o que acontece no arrasto pelo teclado, em português (a biblioteca fala inglês por padrão).
  const lugar = (destino) => (destino.droppableId === 'colunas'
    ? `posição ${destino.index + 1} do quadro`
    : `posição ${destino.index + 1} da coluna ${quadro.colunas.find((c) => c.id === destino.droppableId)?.nome ?? ''}`)
  function aoLevantar(inicio, aviso) {
    aviso.announce(`${inicio.type === 'coluna' ? 'Coluna levantada' : 'Cartão levantado'}. Use as setas para mover, espaço para soltar e Esc para cancelar.`)
    soltarRolagem()
    destravar.current = travarRolagem({ faixa: faixa.current, coluna: inicio.type === 'coluna' })
    comecarArrasto()
  }
  function aoMover(atual, aviso) {
    aviso.announce(atual.destination ? `Na ${lugar(atual.destination)}.` : 'Fora das colunas.')
  }
  function aoSoltar(fim, aviso) {
    aviso.announce(fim.destination ? `Solto na ${lugar(fim.destination)}.` : 'Arrasto cancelado; voltou para o lugar.')
    soltarRolagem()
    soltar(fim)
  }

  const somenteLeitura = cliente.arquivado ? 'Cliente arquivado: o quadro é só para ler.' : !podeMexer ? 'Você vê este quadro só para ler.' : null
  const apagando = janela?.tipo === 'apagar' && quadro.colunas.find((c) => c.id === janela.colunaId)

  return (
    <section aria-label="Quadro" className="grid grid-cols-1">
      <BarraDoQuadro quadroId={quadro.id} quadros={central ? quadros : null} escolhido={quadro.id} aoEscolher={escolher}
        filtros={filtros} aoFiltrar={setFiltros} podeMexer={podeMexer}
        aoArquivados={() => setJanela({ tipo: 'arquivados' })} aoNovoCartao={() => setJanela({ tipo: 'novo', colunaId: null })} />
      <IndicadoresDoQuadro indicadores={indicadores} />
      {(filtrando || somenteLeitura) && (
        <div className="mb-3 grid gap-1 text-rotulo text-muted-foreground">
          {somenteLeitura && <p>{somenteLeitura}</p>}
          {filtrando && (
            <p role="status">
              {comFiltro != null ? `${comFiltro.toLocaleString('pt-BR')} ${comFiltro === 1 ? 'cartão' : 'cartões'} com esses filtros. ` : ''}
              {podeMexer && 'Com filtro ligado não dá para arrastar cartões; limpe os filtros para reorganizar.'}
            </p>
          )}
        </div>
      )}

      <DragDropContext onDragStart={aoLevantar} onDragUpdate={aoMover} onDragEnd={aoSoltar}
        dragHandleUsageInstructions="Para arrastar, aperte espaço. Use as setas para mover, espaço de novo para soltar e Esc para cancelar.">
        <Droppable droppableId="colunas" type="coluna" direction="horizontal" isDropDisabled={!podeMexer}>
          {(provided) => (
            // relative: o texto só para leitor de tela (position: absolute) fica preso aqui; sem isso, ele sai pelo
            // <main> e, a 360 px, a página inteira rola para o lado. A altura é a do resto da tela (alturaDoQuadro.js):
            // as colunas vão até ela e a lista de cartões de cada uma rola por dentro.
            <div ref={faixa} role="region" aria-label="Colunas do quadro" style={altura ? { height: altura } : undefined}
              className="relative flex items-start gap-4 overflow-x-auto overflow-y-hidden pb-4">
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex h-full items-start gap-4">
                {quadro.colunas.map((coluna, i) => (
                  <Draggable key={coluna.id} draggableId={coluna.id} index={i} isDragDisabled={!podeMexer}>
                    {(arrasto) => (
                      <div ref={arrasto.innerRef} {...arrasto.draggableProps} className="flex max-h-full shrink-0 flex-col">
                        <Coluna coluna={coluna} posicao={i} estado={colunas[coluna.id]} hoje={hoje} filtrando={filtrando}
                          podeMexer={podeMexer} podeApagar={quadro.pode_gerir && quadro.colunas.length > 1}
                          arrastarCartoes={podeMexer && !filtrando} alca={arrasto.dragHandleProps}
                          aoRenomear={(nome) => mudarColuna(coluna, { nome })}
                          aoMudarCor={(cor) => mudarColuna(coluna, { cor })}
                          aoMudarConcluidos={(concluidos) => mudarColuna(coluna, { concluidos })}
                          aoApagar={() => abrirApagar(coluna)} aoVerMais={() => verMais(coluna.id)}
                          aoNovoCartao={() => setJanela({ tipo: 'novo', colunaId: coluna.id })} aoAbrirCartao={abrirCartao} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
              {podeMexer && <NovaColuna aoCriar={criarNovaColuna} />}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {janela?.tipo === 'novo' && (
        <JanelaNovoCartao quadro={quadro} colunaId={janela.colunaId} aoFechar={() => setJanela(null)} aoCriado={aoCriarCartao}
          aoRecusado={lerTudo} />
      )}
      {janela?.tipo === 'arquivados' && (
        <JanelaArquivados quadro={quadro} perfil={perfil} aoFechar={() => setJanela(null)} aoMudar={lerTudo} />
      )}
      {apagando && (
        <ApagarColuna coluna={apagando} colunas={quadro.colunas} aoFechar={() => setJanela(null)}
          aoApagar={(opcoes) => apagarAColuna(apagando, opcoes)} />
      )}
      {cartaoAberto && (
        <AbrirCartao key={cartaoAberto} cartaoId={cartaoAberto} quadro={quadro} cliente={cliente} perfil={perfil}
          aoFechar={fecharCartao} aoQuadroMudou={lerTudo} />
      )}
    </section>
  )
}
