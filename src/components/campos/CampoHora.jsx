import { useId, useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Flutuante, { BotaoCampo } from './Flutuante'

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const LARGURA = 252

function partir(valor) {
  const m = /^(\d{2}):(\d{2})/.exec(valor || '')
  return m ? { h: m[1], m: m[2] } : null
}

// Setas para cima e para baixo andam pela coluna de horas ou minutos.
function andar(e) {
  const alvo = { ArrowDown: e.target.nextElementSibling, ArrowUp: e.target.previousElementSibling }[e.key]
  if (alvo === undefined) return
  e.preventDefault()
  alvo?.focus()
}

// Horário do padrão Hub no lugar do <input type="time">. Valor em texto "HH:mm" (vazio quando não há);
// os minutos andam de `passo` em `passo` (um minuto já escolhido fora do passo continua na lista).
// Dá para digitar ("1330"). Opcional por padrão (Limpar volta a ''); `obrigatorio` tira o Limpar.
export default function CampoHora({ id, rotulo, valor, aoMudar, passo = 5, compacto = false, obrigatorio = false, desabilitado = false, placeholder = '--:--' }) {
  const atual = partir(valor)
  const [aberto, setAberto] = useState(false)
  const [digitado, setDigitado] = useState('')
  const gatilho = useRef(null)
  const colunas = useRef(null)
  const valorId = useId()
  const base = Array.from({ length: Math.ceil(60 / passo) }, (_, i) => String(i * passo).padStart(2, '0'))
  const minutos = atual && !base.includes(atual.m) ? [...base, atual.m].sort() : base

  // Leva a hora e o minuto escolhidos para o meio das colunas ao abrir.
  const centralizar = () => colunas.current?.querySelectorAll('[aria-pressed="true"]').forEach((b) => b.scrollIntoView?.({ block: 'center' }))

  function confirmarDigitado() {
    const digitos = digitado.replace(/\D/g, '')
    if (digitos.length < 3) return
    const h = Math.min(23, Number(digitos.slice(0, -2)))
    const m = Math.min(59, Number(digitos.slice(-2)))
    aoMudar(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    setDigitado('')
  }

  const celula = (marcada) => cn('h-8 w-full rounded-lg text-rotulo tabular-nums', marcada ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground hover:bg-primary/10')
  const limpar = !obrigatorio && atual && !desabilitado

  return (
    <>
      <button ref={gatilho} id={id} type="button" disabled={desabilitado} aria-label={rotulo} aria-describedby={valorId} aria-haspopup="dialog" aria-expanded={aberto}
        onClick={() => { setDigitado(''); setAberto((a) => !a) }}
        className={cn('input texto-de-campo botao-animado flex cursor-pointer items-center text-left', compacto ? 'gap-1.5 py-1.5 text-rotulo' : 'gap-2', aberto && 'border-primary/60 ring-primary/15 ring-2')}>
        <Clock className={cn('shrink-0', compacto ? 'size-3' : 'size-3.5', atual ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
        <span id={valorId} className={cn('min-w-0 flex-1 truncate tabular-nums', !atual && 'text-muted-foreground')}>{atual ? `${atual.h}:${atual.m}` : placeholder}</span>
        {limpar && !compacto && (
          <span role="button" tabIndex={0} aria-label="Limpar horário" onClick={(e) => { e.stopPropagation(); aoMudar('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); aoMudar('') } }}
            className="text-muted-foreground hover:text-foreground rounded p-0.5">
            <X className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {aberto && (
        <Flutuante ancora={gatilho} aoFechar={() => setAberto(false)} aoAbrir={centralizar} largura={LARGURA} altura={330} rotulo="Escolher horário" className="p-3">
          <input value={digitado} onChange={(e) => setDigitado(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))} inputMode="numeric" aria-label="Digitar horário"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarDigitado() } }} onBlur={confirmarDigitado}
            placeholder={atual ? `${atual.h}:${atual.m}` : 'Digite, ex.: 1330'} className="input mb-2.5 py-1.5 texto-de-campo tabular-nums" />
          <div ref={colunas} className="grid grid-cols-2 gap-2">
            {[['Hora', HORAS, atual?.h, (h) => aoMudar(`${h}:${atual?.m ?? '00'}`)], ['Minuto', minutos, atual?.m, (m) => aoMudar(`${atual?.h ?? '08'}:${m}`)]].map(([titulo, itens, marcado, escolher]) => (
              <div key={titulo}>
                <p className="section-label mb-1 text-center">{titulo}</p>
                <div onKeyDown={andar} className="h-[168px] space-y-0.5 overflow-y-auto pr-1">
                  {itens.map((i) => <BotaoCampo key={i} aria-pressed={marcado === i} onClick={() => escolher(i)} className={celula(marcado === i)}>{i}</BotaoCampo>)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t pt-2.5">
            {limpar ? <BotaoCampo onClick={() => { aoMudar(''); setAberto(false) }} className="text-muted-foreground hover:text-destructive rounded text-rotulo font-medium">Limpar</BotaoCampo> : <span />}
            <BotaoCampo onClick={() => setAberto(false)} className="bg-primary text-primary-foreground rounded-lg px-2.5 py-1 text-rotulo font-semibold">Pronto</BotaoCampo>
          </div>
        </Flutuante>
      )}
    </>
  )
}
