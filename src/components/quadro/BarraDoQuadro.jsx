import { useCallback } from 'react'
import { Archive, Plus } from 'lucide-react'
import Seletor from '@/components/campos/Seletor'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from '@/components/comum/BarraDeFiltros'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { pessoasDoQuadro } from '@/data/quadro'
import { OPCOES_DE_PRAZO, OPCOES_DE_PRIORIDADE } from './cores'
import { FILTROS_VAZIOS, temFiltro } from './useQuadro'

const SEM_RESPONSAVEL = { valor: 'sem', rotulo: 'Sem responsável' }

function Filtro({ id, rotulo, children }) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="shrink-0 text-muted-foreground">{rotulo}</Label>
      <div className="w-40">{children}</div>
    </div>
  )
}

// Barra do quadro (BarraDeFiltros, como a do Mochi): Consultoria (só a central e o dono, e só quando o cliente teve mais
// de um quadro), busca no título e na descrição, Prioridade, Responsável (com "Sem responsável"; as pessoas vêm do banco),
// Prazo e Limpar; no fim, Arquivados e Novo cartão (quem mexe). Tudo filtra no banco. Quando o quadro aberto é de uma
// consultoria que atendeu antes (não a de hoje), o selo "Atendeu antes" aparece, com o nome dela quando não há seletor.
export default function BarraDoQuadro({ quadroId, quadros, escolhido, aoEscolher, filtros, aoFiltrar, podeMexer, aoArquivados, aoNovoCartao }) {
  const buscarPessoas = useCallback(async (termo) => {
    const { itens, total } = await pessoasDoQuadro({ quadroId, termo })
    const pessoas = itens.map((p) => ({ valor: p.id, rotulo: p.nome, avatar: p }))
    // "Sem responsável" abre a lista (só sem busca); o total sobe junto para o rodapé continuar certo.
    return termo ? { itens: pessoas, total } : { itens: [SEM_RESPONSAVEL, ...pessoas], total: total + 1 }
  }, [quadroId])
  const mudar = (campos) => aoFiltrar({ ...filtros, ...campos })
  const aberto = quadros?.find((q) => q.id === escolhido)
  const responsavel = filtros.responsavel === 'sem' ? [SEM_RESPONSAVEL]
    : filtros.responsavel ? [{ valor: filtros.responsavel, rotulo: filtros.nomeDoResponsavel ?? 'Responsável escolhido' }] : []

  return (
    <BarraDeFiltros className="gap-x-3 gap-y-2">
      {quadros?.length > 1 && (
        <Filtro id="filtro-quadro" rotulo="Consultoria">
          <Seletor id="filtro-quadro" tamanho="sm" valor={escolhido} aoMudar={aoEscolher}
            opcoes={quadros.map((q) => ({ valor: q.id, rotulo: q.consultoria.nome, detalhe: q.atual ? 'Atende hoje' : 'Atendeu antes' }))} />
        </Filtro>
      )}
      {aberto && !aberto.atual && (
        <Badge variant="notice">{quadros.length > 1 ? 'Atendeu antes' : `Atendeu antes · ${aberto.consultoria.nome}`}</Badge>
      )}
      <CampoBusca rotulo="Buscar cartões" placeholder="Buscar cartão" valor={filtros.busca} aoMudar={(busca) => mudar({ busca })} />
      <Filtro id="filtro-prioridade" rotulo="Prioridade">
        <Seletor id="filtro-prioridade" tamanho="sm" rotuloTodos="Todas" opcoes={OPCOES_DE_PRIORIDADE} valor={filtros.prioridade}
          aoMudar={(prioridade) => mudar({ prioridade })} />
      </Filtro>
      <Filtro id="filtro-responsavel" rotulo="Responsável">
        <Seletor id="filtro-responsavel" tamanho="sm" rotuloTodos="Todos" buscar={buscarPessoas} opcoes={responsavel} valor={filtros.responsavel}
          aoMudar={(valor, opcao) => mudar({ responsavel: valor, nomeDoResponsavel: opcao?.rotulo ?? null })} />
      </Filtro>
      <Filtro id="filtro-prazo" rotulo="Prazo">
        <Seletor id="filtro-prazo" tamanho="sm" rotuloTodos="Todos" opcoes={OPCOES_DE_PRAZO} valor={filtros.prazo}
          aoMudar={(prazo) => mudar({ prazo })} />
      </Filtro>
      {temFiltro(filtros) && <Button type="button" variant="link" size="sm" onClick={() => aoFiltrar(FILTROS_VAZIOS)}>Limpar filtros</Button>}
      <AcaoPrincipal>
        <Button type="button" variant="outline" onClick={aoArquivados}><Archive /> Arquivados</Button>
        {podeMexer && <Button type="button" onClick={aoNovoCartao}><Plus /> Novo cartão</Button>}
      </AcaoPrincipal>
    </BarraDeFiltros>
  )
}
