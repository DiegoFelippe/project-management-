import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { Button } from '@/components/ui/button'
import { checkinsPorSemana, horasPorConsultor, horasPorMes } from '@/data/clientes'
import { formatarHoras } from '@/lib/horas'
import { deslocarMes, mesAtual, rotuloDoMes } from '@/lib/mes'

// Gráficos da aba Geral, em SVG próprio (cores do tema, sem animação): horas por mês com a previsão atual,
// horas por consultor e check-ins por semana. Os dois últimos seguem o mês escolhido. O banco soma só o que
// cada pessoa enxerga.
const LARGURA = 340
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const rotuloCurto = (mes) => `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
const rotuloDaSemana = (semana) => `sem. de ${semana.slice(8, 10)}/${semana.slice(5, 7)}`
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const cortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto)

const TEXTO = { fill: 'var(--foreground)' }
const TEXTO_SUAVE = { fill: 'var(--muted-foreground)' }

function Cartao({ titulo, subtitulo, children }) {
  return (
    <section aria-label={titulo} className="card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
      {subtitulo && <p className="mb-2 text-xs text-muted-foreground">{subtitulo}</p>}
      <div className={subtitulo ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Estado({ erro, vazio, carregando, texto }) {
  if (erro) return <p role="alert" className="text-sm text-destructive">{erro}</p>
  if (carregando) return <GraficoCarregando texto="Carregando…" className="py-6" />
  return <p className="py-6 text-sm text-muted-foreground">{texto ?? vazio}</p>
}

// Barras verticais por mês e, se houver, a linha tracejada da previsão.
function GraficoDeMeses({ meses, previsao }) {
  const base = 150
  const topo = 24
  const maximo = Math.max(1, previsao ?? 0, ...meses.map((m) => m.realizado))
  const alturaDe = (v) => ((base - topo) * v) / maximo
  const faixa = (LARGURA - 16) / meses.length
  const largura = Math.min(32, faixa - 12)
  const descricao = meses.map((m) => `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}`).join('; ')
  const rotulo = `Horas por mês, últimos ${meses.length} meses. ${descricao}.${previsao ? ` Previsão: ${formatarHoras(previsao)}.` : ''}`
  const yPrevisao = base - alturaDe(previsao ?? 0)
  return (
    <svg role="img" aria-label={rotulo} viewBox={`0 0 ${LARGURA} 172`} className="h-auto w-full">
      <line x1="8" x2={LARGURA - 8} y1={base} y2={base} stroke="var(--input)" />
      {meses.map((m, i) => {
        const x = 8 + i * faixa + (faixa - largura) / 2
        const h = alturaDe(m.realizado)
        return (
          <g key={m.mes}>
            {m.realizado > 0 && <rect x={x} y={base - h} width={largura} height={h} rx="4" fill="var(--primary)" fillOpacity={i === meses.length - 1 ? 1 : 0.6} />}
            <text x={x + largura / 2} y={base - h - 5} textAnchor="middle" fontSize="10" style={TEXTO}>{formatarHoras(m.realizado)}</text>
            <text x={x + largura / 2} y={base + 15} textAnchor="middle" fontSize="10" style={TEXTO_SUAVE}>{rotuloCurto(m.mes)}</text>
          </g>
        )
      })}
      {previsao > 0 && (
        <g data-previsao="">
          <line x1="8" x2={LARGURA - 8} y1={yPrevisao} y2={yPrevisao} stroke="var(--muted-foreground)" strokeDasharray="5 4" />
          <text x={LARGURA - 8} y={yPrevisao - 4} textAnchor="end" fontSize="10" style={{ ...TEXTO_SUAVE, stroke: 'var(--card)', strokeWidth: 3, paintOrder: 'stroke' }}>
            {`Previsão: ${formatarHoras(previsao)}`}
          </text>
        </g>
      )}
    </svg>
  )
}

// Uma linha por item: rótulo à esquerda, número à direita e a barra embaixo.
function GraficoDeBarras({ itens, rotuloGeral }) {
  const linha = 34
  const maximo = Math.max(...itens.map((i) => i.valor), 1)
  return (
    <svg role="img" aria-label={`${rotuloGeral}. ${itens.map((i) => `${i.rotulo}: ${i.detalhe.replace(' · ', ', ')}`).join('; ')}.`}
      viewBox={`0 0 ${LARGURA} ${itens.length * linha + 4}`} className="h-auto w-full">
      {itens.map((item, i) => {
        const y = i * linha
        return (
          <g key={item.chave}>
            <text x="8" y={y + 13} fontSize="11" style={TEXTO}>{cortar(item.rotulo, 24)}</text>
            <text x={LARGURA - 8} y={y + 13} textAnchor="end" fontSize="11" style={TEXTO_SUAVE}>{item.detalhe}</text>
            <rect x="8" y={y + 19} width={LARGURA - 16} height="8" rx="4" fill="var(--input)" fillOpacity="0.5" />
            {item.valor > 0 && <rect x="8" y={y + 19} width={Math.max(8, ((LARGURA - 16) * item.valor) / maximo)} height="8" rx="4" fill="var(--primary)" />}
          </g>
        )
      })}
    </svg>
  )
}

// Carrega uma função assíncrona e entrega { dados, erro }; null enquanto carrega.
// A chave identifica o que está sendo carregado: ao mudar, o estado volta a "carregando" sem passar pelo efeito.
function useCarregado(chave, carregar, mensagemDeErro) {
  const [estado, setEstado] = useState({ chave: null, dados: null, erro: null })
  useEffect(() => {
    let ativo = true
    carregar()
      .then((dados) => ativo && setEstado({ chave, dados, erro: null }))
      .catch(() => ativo && setEstado({ chave, dados: null, erro: mensagemDeErro }))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return estado.chave === chave ? estado : { dados: null, erro: null }
}

// versao muda quando a página mudou algo (ex.: check-out na aba Geral) e os gráficos recarregam.
export default function GraficosDoCliente({ cliente, versao = 0 }) {
  const [mes, setMes] = useState(mesAtual)
  const atual = mesAtual()
  const porMes = useCarregado(`mes:${cliente.id}:${versao}`, () => horasPorMes(cliente.id), 'Não foi possível carregar o gráfico de horas por mês.')
  const porConsultor = useCarregado(`consultor:${cliente.id}:${mes}:${versao}`, () => horasPorConsultor(cliente.id, mes), 'Não foi possível carregar o gráfico de horas por consultor.')
  const porSemana = useCarregado(`semana:${cliente.id}:${mes}:${versao}`, () => checkinsPorSemana(cliente.id, mes), 'Não foi possível carregar o gráfico de check-ins por semana.')

  const semHoras = porMes.dados?.every((m) => m.realizado === 0)
  const semSemanas = porSemana.dados?.every((s) => s.quantidade === 0)

  return (
    <section aria-label="Gráficos" className="mb-6 grid gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mês dos gráficos por consultor e por semana">
        <Button type="button" variant="outline" size="sm" onClick={() => setMes(deslocarMes(mes, -1))}>
          <ChevronLeft aria-hidden="true" /> Anterior
        </Button>
        <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">{rotuloDoMes(mes)}</span>
        <Button type="button" variant="outline" size="sm" disabled={mes >= atual} onClick={() => setMes(deslocarMes(mes, 1))}>
          Próximo <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Horas por mês" subtitulo="Últimos 6 meses, com a previsão atual">
          {porMes.erro || !porMes.dados ? <Estado erro={porMes.erro} carregando />
            : semHoras ? <Estado texto="Sem horas nos últimos 6 meses." />
            : <GraficoDeMeses meses={porMes.dados} previsao={Number(cliente.horas_mes) || 0} />}
        </Cartao>
        <Cartao titulo="Horas por consultor" subtitulo={rotuloDoMes(mes)}>
          {porConsultor.erro || !porConsultor.dados ? <Estado erro={porConsultor.erro} carregando />
            : porConsultor.dados.length === 0 ? <Estado texto="Sem check-ins neste mês." />
            : <GraficoDeBarras rotuloGeral={`Horas por consultor em ${rotuloDoMes(mes)}`}
                itens={porConsultor.dados.map((c, i) => ({
                  chave: c.consultorId ?? i, rotulo: c.nome ?? 'outro consultor', valor: c.horas, detalhe: formatarHoras(c.horas),
                }))} />}
        </Cartao>
        <Cartao titulo="Check-ins por semana" subtitulo={rotuloDoMes(mes)}>
          {porSemana.erro || !porSemana.dados ? <Estado erro={porSemana.erro} carregando />
            : semSemanas ? <Estado texto="Sem check-ins neste mês." />
            : <GraficoDeBarras rotuloGeral={`Check-ins por semana em ${rotuloDoMes(mes)}`}
                itens={porSemana.dados.map((s) => ({
                  chave: s.semana, rotulo: rotuloDaSemana(s.semana), valor: s.quantidade,
                  detalhe: s.quantidade === 0 ? '0 check-ins' : `${plural(s.quantidade, 'check-in', 'check-ins')} · ${formatarHoras(s.horas)}`,
                }))} />}
        </Cartao>
      </div>
    </section>
  )
}
