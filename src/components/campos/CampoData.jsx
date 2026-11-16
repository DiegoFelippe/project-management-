import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  addDays, addMonths, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday,
  isValid, parseISO, setMonth, setYear, startOfMonth, startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import CampoHora from './CampoHora'
import Flutuante, { BotaoCampo } from './Flutuante'

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const LARGURA = 296
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)

function ler(valor, comHora) {
  if (!valor) return null
  const d = parseISO(comHora && valor.length > 10 ? valor : `${valor.slice(0, 10)}T00:00:00`)
  return isValid(d) ? d : null
}

const celula = (marcada, fora, hoje, dentro = true) => cn(
  'rounded-lg tabular-nums disabled:cursor-not-allowed',
  marcada ? 'bg-primary text-primary-foreground font-semibold'
    : fora ? 'text-muted-foreground/40'
      : cn(dentro ? 'text-foreground' : 'text-muted-foreground/60', 'hover:bg-primary/10', hoje && 'text-primary ring-primary/60 font-semibold ring-1 ring-inset'),
)

// Calendário do padrão Hub no lugar do <input type="date">. O valor é texto "yyyy-MM-dd" (com `comHora`,
// "yyyy-MM-ddTHH:mm"), vazio quando não há data; `aoMudar` recebe o texto. `min`/`max` em "yyyy-MM-dd".
// `atalhos`: [{ rotulo, valor }] além do "Hoje". Data opcional por padrão (Limpar volta a ''); `obrigatorio` tira o Limpar.
export default function CampoData({ id, rotulo, valor, aoMudar, min, max, comHora = false, atalhos = [], obrigatorio = false, desabilitado = false, placeholder = 'Escolher data' }) {
  const escolhida = ler(valor, comHora)
  const minimo = ler(min, false)
  const maximo = ler(max, false)
  const [aberto, setAberto] = useState(false)
  const [visao, setVisao] = useState(() => escolhida ?? new Date())
  const [foco, setFoco] = useState(null)
  const [modo, setModo] = useState('dias') // dias | meses | anos
  const [hoje] = useState(() => new Date())
  const gatilho = useRef(null)
  const grade = useRef(null)

  const dias = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(visao)), end: endOfWeek(endOfMonth(visao)) }), [visao])
  const chave = (d) => format(d, 'yyyy-MM-dd')
  const fora = (d) => (minimo && chave(d) < chave(minimo)) || (maximo && chave(d) > chave(maximo))
  const emitir = (v) => aoMudar(v)

  useEffect(() => {
    if (aberto && foco) grade.current?.querySelector(`[data-dia="${chave(foco)}"]`)?.focus()
  }, [foco, aberto])

  function alternar() {
    if (desabilitado) return
    if (!aberto) { const base = escolhida ?? new Date(); setVisao(base); setFoco(base); setModo('dias') }
    setAberto((a) => !a)
  }

  function escolher(d) {
    if (fora(d)) return
    if (comHora) emitir(`${chave(d)}T${escolhida ? format(escolhida, 'HH:mm') : '09:00'}`)
    else { emitir(chave(d)); setAberto(false); gatilho.current?.focus() }
  }

  function setas(e) {
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!passo || !foco) return
    e.preventDefault()
    const novo = addDays(foco, passo)
    setFoco(novo)
    if (!isSameMonth(novo, visao)) setVisao(novo)
  }

  const inicioAnos = visao.getFullYear() - (visao.getFullYear() % 12)
  const mover = (dir) => setVisao((v) => (modo === 'dias' ? addMonths(v, dir) : addYears(v, dir * (modo === 'meses' ? 1 : 12))))
  const nomeSeta = (dir) => (modo === 'dias' ? (dir < 0 ? 'Mês anterior' : 'Próximo mês') : modo === 'meses' ? (dir < 0 ? 'Ano anterior' : 'Próximo ano') : (dir < 0 ? 'Anos anteriores' : 'Próximos anos'))
  const botaoTitulo = 'hover:bg-accent rounded-lg px-2 py-1 text-[13.5px] font-semibold tabular-nums'
  const limpar = !obrigatorio && escolhida && !desabilitado

  return (
    <>
      <button ref={gatilho} id={id} type="button" disabled={desabilitado} onClick={alternar} aria-label={rotulo} aria-haspopup="dialog" aria-expanded={aberto}
        className={cn('input botao-animado flex cursor-pointer items-center gap-2 text-left', aberto && 'border-primary/60 ring-primary/15 ring-2')}>
        <CalendarDays className={cn('size-3.5 shrink-0', escolhida ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
        <span className={cn('min-w-0 flex-1 truncate', !escolhida && 'text-muted-foreground')}>
          {escolhida ? format(escolhida, comHora ? "d 'de' MMM 'de' yyyy', ' HH:mm" : "d 'de' MMM 'de' yyyy", { locale: ptBR }) : placeholder}
        </span>
        {limpar && (
          <span role="button" tabIndex={0} aria-label="Limpar data" onClick={(e) => { e.stopPropagation(); emitir('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); emitir('') } }}
            className="text-muted-foreground hover:text-foreground rounded p-0.5">
            <X className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {aberto && (
        <Flutuante ancora={gatilho} aoFechar={() => setAberto(false)} largura={LARGURA} altura={comHora ? 420 : 370} rotulo="Escolher data" className="p-3">
          <div className="mb-2 flex items-center gap-1">
            <BotaoCampo onClick={() => mover(-1)} aria-label={nomeSeta(-1)} className="text-muted-foreground hover:bg-accent grid size-8 place-items-center rounded-lg"><ChevronLeft className="size-4" aria-hidden="true" /></BotaoCampo>
            <div className="flex flex-1 items-center justify-center gap-1">
              {modo === 'dias' && <BotaoCampo onClick={() => setModo('meses')} title="Escolher mês" className={botaoTitulo}>{maiuscula(format(visao, 'MMMM', { locale: ptBR }))}</BotaoCampo>}
              {modo === 'anos'
                ? <span className="px-2 py-1 text-[13.5px] font-semibold tabular-nums">{inicioAnos} a {inicioAnos + 11}</span>
                : <BotaoCampo onClick={() => setModo('anos')} title="Escolher ano" className={botaoTitulo}>{format(visao, 'yyyy')}</BotaoCampo>}
            </div>
            <BotaoCampo onClick={() => mover(1)} aria-label={nomeSeta(1)} className="text-muted-foreground hover:bg-accent grid size-8 place-items-center rounded-lg"><ChevronRight className="size-4" aria-hidden="true" /></BotaoCampo>
          </div>

          {modo === 'meses' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {Array.from({ length: 12 }, (_, i) => {
                const d = setMonth(visao, i)
                const off = (minimo && format(d, 'yyyy-MM') < format(minimo, 'yyyy-MM')) || (maximo && format(d, 'yyyy-MM') > format(maximo, 'yyyy-MM'))
                return (
                  <BotaoCampo key={i} disabled={off} onClick={() => { setVisao(d); setFoco(d); setModo('dias') }}
                    className={cn('h-11 text-[12.5px] font-medium', celula(escolhida && isSameMonth(escolhida, d), off, isSameMonth(hoje, d)))}>
                    {maiuscula(format(d, 'MMM', { locale: ptBR }).replace('.', ''))}
                  </BotaoCampo>
                )
              })}
            </div>
          )}

          {modo === 'anos' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {Array.from({ length: 12 }, (_, i) => {
                const ano = inicioAnos + i
                const off = (minimo && ano < minimo.getFullYear()) || (maximo && ano > maximo.getFullYear())
                return (
                  <BotaoCampo key={ano} disabled={off} onClick={() => { setVisao((v) => setYear(v, ano)); setModo('meses') }}
                    className={cn('h-11 text-[12.5px] font-medium', celula(escolhida?.getFullYear() === ano, off, hoje.getFullYear() === ano))}>
                    {ano}
                  </BotaoCampo>
                )
              })}
            </div>
          )}

          {modo === 'dias' && (
            <>
              <div className="mb-1 grid grid-cols-7">
                {SEMANA.map((s, i) => <span key={i} className="text-muted-foreground py-1 text-center text-[10.5px] font-semibold">{s}</span>)}
              </div>
              <div ref={grade} onKeyDown={setas} className="grid grid-cols-7 gap-0.5">
                {dias.map((d) => (
                  <BotaoCampo key={chave(d)} data-dia={chave(d)} disabled={fora(d)} tabIndex={foco && isSameDay(d, foco) ? 0 : -1}
                    onClick={() => escolher(d)} aria-pressed={!!escolhida && isSameDay(d, escolhida)} aria-label={format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    className={cn('h-9 text-[12.5px]', celula(escolhida && isSameDay(d, escolhida), fora(d), isToday(d), isSameMonth(d, visao)))}>
                    {format(d, 'd')}
                  </BotaoCampo>
                ))}
              </div>
            </>
          )}

          {comHora && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <span className="text-foreground/80 text-[12px] font-medium">Horário</span>
              <div className="ml-auto w-[120px]">
                <CampoHora id={id && `${id}-hora`} rotulo="Horário" valor={escolhida ? format(escolhida, 'HH:mm') : ''} desabilitado={!escolhida} obrigatorio compacto
                  aoMudar={(h) => escolhida && h && emitir(`${chave(escolhida)}T${h}`)} />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t pt-3">
            {limpar ? <BotaoCampo onClick={() => { emitir(''); setAberto(false) }} className="text-muted-foreground hover:text-destructive rounded text-[12px] font-medium">Limpar</BotaoCampo> : <span />}
            <div className="flex flex-wrap items-center gap-1.5">
              {atalhos.map((a) => (
                <BotaoCampo key={a.rotulo} disabled={fora(ler(a.valor, false) ?? hoje)} onClick={() => { emitir(a.valor); if (!comHora) setAberto(false) }}
                  className="bg-muted text-foreground hover:bg-accent rounded-lg px-2.5 py-1 text-[12px] font-medium disabled:opacity-40">{a.rotulo}</BotaoCampo>
              ))}
              {!fora(hoje) && (
                <BotaoCampo onClick={() => { setVisao(hoje); setFoco(hoje); escolher(hoje) }} className="bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-2.5 py-1 text-[12px] font-semibold">Hoje</BotaoCampo>
              )}
              {comHora && <BotaoCampo onClick={() => setAberto(false)} className="bg-primary text-primary-foreground rounded-lg px-2.5 py-1 text-[12px] font-semibold">Pronto</BotaoCampo>}
            </div>
          </div>
        </Flutuante>
      )}
    </>
  )
}
