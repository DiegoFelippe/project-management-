import { useEffect, useRef, useState } from 'react'
import { Droppable } from '@hello-pangea/dnd'
import { ChevronsDown, CircleCheck, Loader2, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import Chave from '@/components/campos/Chave'
import Flutuante from '@/components/campos/Flutuante'
import MenuDeAcoes from '@/components/comum/MenuDeAcoes'
import SeletorDeCor from '@/components/comum/SeletorDeCor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CARTOES_POR_PAGINA } from '@/data/quadro'
import { cn } from '@/lib/utils'
import CartaoNoQuadro from './CartaoNoQuadro'
import { CORES_DAS_COLUNAS, corDaColuna } from './cores'

const contar = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// As 10 cores das colunas no SeletorDeCor (o banco guarda o número, 0 a 9; null = a automática pela posição), no cheio
// com o check no "sobre", como o contador.
const CORES_DO_SELETOR = CORES_DAS_COLUNAS.map((c, i) => ({ valor: i, nome: c.nome, classe: c.cheio }))

// Painel da cor: as 10 cores e "Automática" (um clique grava na hora, para todos que veem o quadro; as setas só andam,
// para não gravar a cada tecla) e a chave "Coluna de concluídos" (prazo não conta como atrasado), como no Mochi. Abre
// com o foco na cor escolhida (o painel fica no fim da página: o Tab não chegaria nele).
function PainelDaCor({ ancora, coluna, automatica, aoFechar, aoMudarCor, aoMudarConcluidos }) {
  const escolher = (cor) => {
    aoFechar()
    ancora.current?.focus()
    if ((cor ?? null) !== (coluna.cor ?? null)) aoMudarCor(cor)
  }
  return (
    <Flutuante ancora={ancora} aoFechar={aoFechar} largura={248} altura={260} rotulo="Cor da coluna" className="p-3"
      aoAbrir={(painel) => painel.querySelector('[role="radio"][tabindex="0"]')?.focus()}>
      <p className="mb-2 text-rotulo font-semibold text-muted-foreground" aria-hidden="true">Cor da coluna</p>
      <SeletorDeCor rotulo="Cor da coluna" mostrarRotulo={false} cores={CORES_DO_SELETOR} valor={coluna.cor ?? null} marcarAoAndar={false}
        automatica={{ rotulo: 'Automática, pela posição', classe: CORES_DAS_COLUNAS[automatica].ponto }} aoMudar={escolher} />
      <div className="mt-3 border-t pt-3">
        <Chave ligada={coluna.concluidos} aoMudar={aoMudarConcluidos} rotulo="Coluna de concluídos" className="text-rotulo font-semibold" />
        <p className="mt-1 text-legenda text-muted-foreground">Cartões aqui não aparecem como atrasados.</p>
      </div>
    </Flutuante>
  )
}

// Nome da coluna editado no lugar: Enter ou sair do campo grava; Esc desiste.
function NomeNoLugar({ nome, aoSalvar, aoTerminar }) {
  const [valor, setValor] = useState(nome)
  const desistiu = useRef(false)
  function terminar() {
    const limpo = valor.trim()
    if (!desistiu.current && limpo && limpo !== nome) aoSalvar(limpo)
    aoTerminar()
  }
  return (
    <Input autoFocus aria-label="Nome da coluna" maxLength={60} value={valor} className="h-8 font-semibold"
      onFocus={(e) => e.target.select()} onChange={(e) => setValor(e.target.value)} onBlur={terminar}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return
        // O foco volta ao "⋯" na hora: sem o preventDefault, o Enter seguiria para ele e abriria o menu de novo.
        e.preventDefault()
        if (e.key === 'Escape') desistiu.current = true
        e.currentTarget.blur()
      }} />
  )
}

// Uma coluna do quadro (300 px): cabeçalho com o contador na cor da coluna, o nome e, para quem mexe, um "⋯" com as
// ações (Renomear, Cor — com a chave de concluídos — e Apagar coluna, só da gestão; auditoria de 17/11, M5); os cartões
// (lista onde se solta o arrasto) com o "ver mais" (50 por vez) no fim;
// e "Adicionar cartão" no pé. A coluna vai até a altura da faixa e a lista rola por dentro: ela é a área de rolagem do
// arrasto (a biblioteca rola a lista perto da borda e acompanha a rolagem). `alca`: as dragHandleProps da coluna
// (reordenar arrastando o cabeçalho); nula para quem só lê.
export default function Coluna({
  coluna, posicao, estado, hoje, podeMexer, podeApagar, arrastarCartoes, filtrando, alca,
  aoRenomear, aoMudarCor, aoMudarConcluidos, aoApagar, aoVerMais, aoNovoCartao, aoAbrirCartao,
}) {
  const [renomeando, setRenomeando] = useState(false)
  const [pintando, setPintando] = useState(false)
  const botaoDoMenu = useRef(null)
  const voltarAoMenu = useRef(false)
  // Fim do "Renomear" (Enter, Esc ou sair do campo): o campo some e o "⋯" volta; o foco vai para ele, a não ser que a
  // pessoa já tenha clicado em outro lugar que fica com o foco.
  useEffect(() => {
    if (renomeando || !voltarAoMenu.current) return
    voltarAoMenu.current = false
    if (!document.activeElement || document.activeElement === document.body) botaoDoMenu.current?.focus()
  }, [renomeando])
  const cor = corDaColuna(coluna, posicao)
  const paleta = CORES_DAS_COLUNAS[cor]
  const itens = estado?.itens
  const total = estado?.total ?? coluna.cartoes ?? 0
  const faltam = Math.max(0, total - (itens?.length ?? 0))
  const proxima = Math.min(faltam, CARTOES_POR_PAGINA)

  return (
    <section aria-label={`Coluna ${coluna.nome}`}
      className={cn('flex min-h-0 w-[300px] flex-col gap-2.5 rounded-2xl border p-2.5', paleta.corpo)}>
      <div className="flex min-h-8 shrink-0 items-center justify-between gap-1 px-1 pt-0.5">
        {renomeando ? (
          <NomeNoLugar nome={coluna.nome} aoSalvar={aoRenomear} aoTerminar={() => { voltarAoMenu.current = true; setRenomeando(false) }} />
        ) : (
          <div {...(alca ?? {})} aria-label={alca ? `Mover a coluna ${coluna.nome}` : undefined}
            className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50', alca && 'cursor-grab active:cursor-grabbing')}>
            <span title={contar(total, 'cartão', 'cartões')}
              className={cn('grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-rotulo font-bold tabular-nums', paleta.cheio)}>
              {total.toLocaleString('pt-BR')}
            </span>
            <h3 className="truncate text-corpo font-semibold text-foreground">{coluna.nome}</h3>
            {coluna.concluidos && (
              <span role="img" aria-label="Coluna de concluídos" title="Coluna de concluídos" className="-ml-1 shrink-0 text-positive">
                <CircleCheck className="size-3.5" aria-hidden="true" />
              </span>
            )}
          </div>
        )}
        {podeMexer && !renomeando && (
          <MenuDeAcoes ref={botaoDoMenu} rotulo={`Ações da coluna ${coluna.nome}`} className="shrink-0" itens={[
            { rotulo: 'Renomear', icone: Pencil, aoEscolher: () => setRenomeando(true) },
            { rotulo: 'Cor', icone: Palette, aoEscolher: () => setPintando(true) },
            ...(podeApagar ? [{ rotulo: 'Apagar coluna', icone: Trash2, aoEscolher: aoApagar, perigo: true }] : []),
          ]} />
        )}
      </div>
      {pintando && (
        <PainelDaCor ancora={botaoDoMenu} coluna={coluna} automatica={corDaColuna({ cor: null }, posicao)} aoFechar={() => setPintando(false)}
          aoMudarCor={aoMudarCor} aoMudarConcluidos={aoMudarConcluidos} />
      )}

      <Droppable droppableId={coluna.id} type="cartao" isDropDisabled={!arrastarCartoes}>
        {(provided, snapshot) => (
          // A margem negativa deixa espaço para a sombra e o anel dos cartões sem cortar na borda da rolagem.
          <div ref={provided.innerRef} {...provided.droppableProps} data-rolagem-da-coluna=""
            className={cn('-mx-1.5 flex min-h-[90px] flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-xl px-2 py-1 transition-colors [scrollbar-width:thin]',
              snapshot.isDraggingOver && 'bg-primary/5 ring-2 ring-primary/25')}>
            {!itens && !estado?.erro && [0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-card/70" />)}
            {estado?.erro && <p role="alert" className="px-1 text-rotulo text-destructive">{estado.erro}</p>}
            {itens?.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 px-3 py-6 text-center">
                <p className="text-rotulo text-muted-foreground">{filtrando ? 'Nenhum cartão com esses filtros' : 'Nenhum cartão aqui'}</p>
                {podeMexer && !filtrando && <p className="mt-0.5 text-legenda text-muted-foreground">Arraste um cartão ou crie um novo</p>}
              </div>
            )}
            {itens?.map((c, i) => (
              <CartaoNoQuadro key={c.id} cartao={c} indice={i} concluidos={coluna.concluidos} hoje={hoje}
                arrastavel={arrastarCartoes} aoAbrir={aoAbrirCartao} />
            ))}
            {provided.placeholder}
            {faltam > 0 && itens && (
              <Button type="button" variant="ghost" size="sm" className="w-full shrink-0" disabled={estado?.carregandoMais} onClick={aoVerMais}>
                {estado?.carregandoMais ? <Loader2 className="animate-spin" /> : <ChevronsDown />}
                Ver mais {contar(proxima, 'cartão', 'cartões')}
                {faltam > proxima && <span className="font-normal text-muted-foreground tabular-nums">· faltam {faltam.toLocaleString('pt-BR')}</span>}
              </Button>
            )}
          </div>
        )}
      </Droppable>

      {podeMexer && (
        <Button type="button" variant="ghost" size="sm" className="w-full shrink-0" aria-label={`Adicionar cartão em ${coluna.nome}`} onClick={aoNovoCartao}>
          <Plus /> Adicionar cartão
        </Button>
      )}
    </section>
  )
}
