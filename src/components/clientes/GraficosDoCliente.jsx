import { useEffect, useState } from 'react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import { checkinsPorSemana, horasPorConsultor, horasPorMes } from '@/data/clientes'
import { formatarHoras } from '@/lib/horas'
import { mesAtual, rotuloCurto, rotuloDoMes } from '@/lib/mes'

// Gráficos da aba Geral, em SVG próprio (cores do tema, sem animação): horas por mês com a previsão atual,
// horas por consultor e check-ins por semana. Os dois últimos seguem o mês escolhido. O banco soma só o que
// cada pessoa enxerga.
const COLUNA = 60 // largura de cada mês no viewBox; os textos em HTML usam o mesmo grid de colunas
const ALTURA = 100
const rotuloDaSemana = (semana) => `sem. de ${semana.slice(8, 10)}/${semana.slice(5, 7)}`
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const cortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto)

function Cartao({ titulo, subtitulo, children }) {
  return (
    <section aria-label={titulo} className="card p-4">
      <h2 className="text-subtitulo font-semibold text-muted-foreground">{titulo}</h2>
      {subtitulo && <p className="mb-2 text-rotulo text-muted-foreground">{subtitulo}</p>}
      <div className={subtitulo ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Estado({ erro, vazio, carregando, texto }) {
  if (erro) return <p role="alert" className="text-corpo text-destructive">{erro}</p>
  if (carregando) return <GraficoCarregando texto="Carregando…" className="py-6" />
  return <p className="py-6 text-corpo text-muted-foreground">{texto ?? vazio}</p>
}

// Barras verticais por mês e, se houver, a linha tracejada da previsão.
// Os textos dos gráficos são HTML (text-legenda), não <text> do SVG: o SVG estica com a largura do cartão e o texto
// dele junto; assim os rótulos ficam do mesmo tamanho em qualquer tela. O SVG guarda só as barras e a linha.
function GraficoDeMeses({ meses, previsao }) {
  const maximo = Math.max(1, previsao ?? 0, ...meses.map((m) => m.realizado))
  const alturaDe = (v) => (ALTURA * v) / maximo
  const largura = COLUNA * meses.length
  const colunas = { gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }
  const descricao = meses.map((m) => `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}`).join('; ')
  const rotulo = `Horas por mês, últimos ${meses.length} meses. ${descricao}.${previsao ? ` Previsão: ${formatarHoras(previsao)}.` : ''}`
  const yPrevisao = ALTURA - alturaDe(previsao ?? 0)
  return (
    <div role="img" aria-label={rotulo}>
      {previsao > 0 && <p className="mb-1 text-right text-legenda text-muted-foreground">{`Previsão: ${formatarHoras(previsao)}`}</p>}
      <ul className="grid text-center text-legenda tabular-nums" style={colunas}>
        {meses.map((m) => <li key={m.mes}>{formatarHoras(m.realizado)}</li>)}
      </ul>
      <svg aria-hidden="true" viewBox={`0 0 ${largura} ${ALTURA}`} preserveAspectRatio="none" className="mt-1 h-32 w-full">
        <line x1="0" x2={largura} y1={ALTURA} y2={ALTURA} stroke="var(--input)" vectorEffect="non-scaling-stroke" />
        {previsao > 0 && (
          <line data-previsao="" x1="0" x2={largura} y1={yPrevisao} y2={yPrevisao} stroke="var(--muted-foreground)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        )}
        {meses.map((m, i) => m.realizado > 0 && (
          <rect key={m.mes} x={i * COLUNA + 12} y={ALTURA - alturaDe(m.realizado)} width={COLUNA - 24} height={alturaDe(m.realizado)} rx="4"
            fill="var(--primary)" fillOpacity={i === meses.length - 1 ? 1 : 0.6} />
        ))}
      </svg>
      <ul className="mt-1 grid text-center text-legenda text-muted-foreground" style={colunas}>
        {meses.map((m) => <li key={m.mes}>{rotuloCurto(m.mes)}</li>)}
      </ul>
    </div>
  )
}

// Uma linha por item: rótulo à esquerda, número à direita (HTML) e a barra embaixo.
function GraficoDeBarras({ itens, rotuloGeral }) {
  const maximo = Math.max(...itens.map((i) => i.valor), 1)
  return (
    <ul role="img" aria-label={`${rotuloGeral}. ${itens.map((i) => `${i.rotulo}: ${i.detalhe.replace(' · ', ', ')}`).join('; ')}.`} className="grid gap-2.5">
      {itens.map((item) => (
        <li key={item.chave}>
          <div className="flex items-baseline justify-between gap-3 text-legenda">
            <span className="min-w-0 truncate">{cortar(item.rotulo, 24)}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{item.detalhe}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-input/50">
            {item.valor > 0 && <div className="h-full min-w-2 rounded-full bg-primary" style={{ width: `${(item.valor * 100) / maximo}%` }} />}
          </div>
        </li>
      ))}
    </ul>
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
    <section aria-label="Gráficos" className="mb-6 grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <NavegacaoDoMes mes={mes} aoMudar={setMes} maximo={atual} />
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
