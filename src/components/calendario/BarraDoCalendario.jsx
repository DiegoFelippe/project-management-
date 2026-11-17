import { useCallback, useRef, useState } from 'react'
import { ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react'
import Caixa from '@/components/campos/Caixa'
import Flutuante from '@/components/campos/Flutuante'
import Seletor from '@/components/campos/Seletor'
import BarraDeFiltros, { AcaoPrincipal } from '@/components/comum/BarraDeFiltros'
import FiltroConsultoria from '@/components/comum/FiltroConsultoria'
import FiltroConsultor from '@/components/clientes/FiltroConsultor'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { buscarClientes } from '@/data/clientes'
import { cn } from '@/lib/utils'
import { TIPOS, TUDO } from './cores'

// O "G" do Google (cores da marca no botão de conectar; verde no selo de conectado), como no Hub.
function LogoDoGoogle({ conectado }) {
  const cor = (marca) => (conectado ? 'currentColor' : marca)
  return (
    <svg viewBox="0 0 48 48" className="size-[13px] shrink-0" aria-hidden="true">
      <path fill={cor('#4285F4')} d="M45.12 24.5c0-1.72-.15-3.37-.43-4.95H24v9.36h11.85a10.14 10.14 0 0 1-4.4 6.64v5.5h7.12c4.17-3.84 6.55-9.5 6.55-16.55z" />
      <path fill={cor('#34A853')} d="M24 46c5.94 0 10.92-1.97 14.56-5.34l-7.12-5.5c-1.97 1.32-4.49 2.1-7.44 2.1-5.72 0-10.56-3.86-12.29-9.05H4.33v5.67A22 22 0 0 0 24 46z" />
      <path fill={cor('#FBBC05')} d="M11.71 28.21A13.22 13.22 0 0 1 11 24c0-1.46.25-2.88.71-4.21v-5.67H4.33A22 22 0 0 0 2 24c0 3.55.85 6.91 2.33 9.88l7.38-5.67z" />
      <path fill={cor('#EA4335')} d="M24 10.75c3.22 0 6.11 1.11 8.38 3.28l6.28-6.28C34.91 4.19 29.93 2 24 2A22 22 0 0 0 4.33 14.12l7.38 5.67C13.44 14.61 18.28 10.75 24 10.75z" />
    </svg>
  )
}

// "Mostrar: tudo" / "Mostrar: 3 de 4": caixas com a bolinha de cada tipo, numa lista que abre sobre o botão.
function MostrarTipos({ mostrar, aoMudar }) {
  const [aberto, setAberto] = useState(false)
  const botao = useRef(null)
  const escondidos = TIPOS.filter((t) => !mostrar[t.chave]).length
  return (
    <>
      <Button ref={botao} type="button" variant="outline" size="sm" aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto((a) => !a)}
        className={cn(escondidos > 0 && 'border-primary/40 bg-accent text-accent-foreground')}>
        <span className="flex -space-x-1" aria-hidden="true">
          {TIPOS.map((t) => <span key={t.chave} className={cn('size-2.5 rounded-full ring-2 ring-card', t.bolinha)} />)}
        </span>
        {escondidos === 0 ? 'Mostrar: tudo' : `Mostrar: ${TIPOS.length - escondidos} de ${TIPOS.length}`}
        <ChevronDown className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
      </Button>
      {aberto && (
        <Flutuante ancora={botao} aoFechar={() => setAberto(false)} largura={256} altura={220} rotulo="Mostrar no calendário" className="p-3">
          <p className="section-label mb-1 px-1">No calendário</p>
          <div className="grid gap-0.5">
            {TIPOS.map((t) => (
              <Caixa key={t.chave} marcado={mostrar[t.chave]} aoMudar={(marcado) => aoMudar({ ...mostrar, [t.chave]: marcado })}
                className="rounded-lg px-2 py-1.5 hover:bg-muted/60"
                rotulo={(
                  <span className="inline-flex items-center gap-2">
                    <span className={cn('size-2.5 rounded-full', t.bolinha, !mostrar[t.chave] && 'opacity-30')} aria-hidden="true" />
                    <span className={cn('text-rotulo', !mostrar[t.chave] && 'text-muted-foreground line-through')}>{t.rotulo}</span>
                  </span>
                )} />
            ))}
          </div>
          {escondidos > 0 && (
            <Button type="button" variant="link" size="sm" className="mt-1 w-full border-t pt-2" onClick={() => aoMudar(TUDO)}>Mostrar tudo</Button>
          )}
        </Flutuante>
      )}
    </>
  )
}

// Cliente: busca no banco entre os clientes que a pessoa vê (da consultoria escolhida, para a central).
function FiltroCliente({ valor, nome, consultoriaId, aoMudar }) {
  const buscar = useCallback(async (termo) => {
    const { itens, total } = await buscarClientes({ termo, consultoriaId: consultoriaId || undefined })
    return { itens: itens.map((c) => ({ valor: c.id, rotulo: c.nome })), total }
  }, [consultoriaId])
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="filtro-cliente" className="shrink-0 text-muted-foreground">Cliente</Label>
      <div className="w-48">
        <Seletor id="filtro-cliente" tamanho="sm" valor={valor} buscar={buscar} rotuloTodos="Todos"
          opcoes={valor ? [{ valor, rotulo: nome ?? 'Cliente escolhido' }] : []} aoMudar={(novo, opcao) => aoMudar(novo, opcao?.rotulo ?? null)} />
      </div>
    </div>
  )
}

// Barra do Calendário (padrão BarraDeFiltros, como a do Hub): Mostrar, consultoria (central e dono), consultor
// (gestão e central), cliente e Limpar filtros; no fim, o Google da pessoa (Conectar ou o selo) e "Novo evento".
export default function BarraDoCalendario({
  perfil, central, gestao, mostrar, aoMostrar, consultoria, aoConsultoria, consultor, aoConsultor, cliente, aoCliente, temFiltros, aoLimpar,
  google, conectando, aoConectar, aoDesconectar, aoNovo,
}) {
  return (
    <BarraDeFiltros className="gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold text-foreground/80">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Filtros
      </span>
      <MostrarTipos mostrar={mostrar} aoMudar={aoMostrar} />
      {central && <FiltroConsultoria valor={consultoria} aoMudar={aoConsultoria} />}
      {(central || gestao) && (
        <FiltroConsultor valor={consultor.valor} nome={consultor.nome} comSemConsultor={false}
          consultoriaId={central ? (consultoria || null) : perfil.consultoria_id} aoMudar={(valor, nome) => aoConsultor({ valor, nome })} />
      )}
      <FiltroCliente valor={cliente.valor} nome={cliente.nome} consultoriaId={central ? consultoria : null}
        aoMudar={(valor, nome) => aoCliente({ valor, nome })} />
      {temFiltros && <Button type="button" variant="link" size="sm" onClick={aoLimpar}>Limpar filtros</Button>}
      <AcaoPrincipal>
        {google?.conectado && !google.erro ? (
          <span title={google.email ? `Conectado como ${google.email}` : undefined}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-positive/25 bg-positive-soft px-3 text-rotulo font-medium text-positive">
            <LogoDoGoogle conectado />
            Google conectado
            <button type="button" aria-label="Desconectar o Google" title="Desconectar o Google" onClick={aoDesconectar}
              className="botao-animado ml-0.5 grid size-5 place-items-center rounded-md transition-[color,translate,scale] outline-none hover:-translate-y-px hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : (
          <Button type="button" variant="outline" onClick={aoConectar} disabled={conectando} title={google?.erro ?? undefined}
            className={cn(google?.erro && 'border-notice/40 text-notice')}>
            <LogoDoGoogle />
            {conectando ? 'Conectando…' : google?.erro ? 'Reconectar Google' : 'Conectar Google'}
          </Button>
        )}
        <Button type="button" onClick={aoNovo}><Plus /> Novo evento</Button>
      </AcaoPrincipal>
    </BarraDeFiltros>
  )
}
