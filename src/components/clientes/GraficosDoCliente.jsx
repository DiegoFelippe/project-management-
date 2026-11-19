import { useId, useState } from 'react'
import BarrasHorizontais from '@/components/graficos/BarrasHorizontais'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import GraficoDeColunas from '@/components/graficos/GraficoDeColunas'
import GraficoDeLinha from '@/components/graficos/GraficoDeLinha'
import { useLeituraDoBloco } from '@/components/inicio/useLeituraDoBloco'
import { checkinsPorSemana, horasPorConsultor, horasPorDia, horasPorMes } from '@/data/clientes'
import { DIAS_DA_SEMANA, diaDaSemana } from '@/lib/calendario'
import {
  fraseDasEtapas, fraseDasSemanasDoCliente, fraseDoMesDoCliente, fraseDoPeriodoDoCliente, fraseDosConsultores, fraseDosSeisMeses,
} from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { formatarDia, hoje as hojeEmSP, mesAtual, rotuloCurto, rotuloDoMes } from '@/lib/mes'
import { TIPOS_DE_PERIODO, descreverPeriodo } from '@/lib/periodo'
import { cn } from '@/lib/utils'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const plural = (n, um, varios) => `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const semana = (dia) => DIAS_DA_SEMANA[diaDaSemana(dia)].toLowerCase()
const primeiroDoMes = (dia) => `${dia.slice(0, 7)}-01`
const MESES_NO_MINIMO = 6
const MESES_NO_MAXIMO = 24 // o que horas_do_cliente_por_mes aceita
const FORA_DO_PERIODO = 'color-mix(in srgb, var(--grafico-serie) 42%, var(--card))'

const ALTURA_DO_BURNUP = 300
const ALTURA_DOS_MESES = 160
const ALTURA_DAS_SEMANAS = 190
const COM_NUMERO_EM_CIMA = 8 // até 8 colunas de semana, o número fica em cima de cada uma
// Grade de 12 colunas, como o Início: a partir de 1280 px, 8+4 e 6+6; de 1024 a 1279, o de 8 e o par de 4 ocupam a
// linha (o par lado a lado) e os de 6 ficam lado a lado; abaixo de 1024, uma coluna (o par lado a lado a partir de 768).
const LARGURA = { 8: 'lg:col-span-12 xl:col-span-8', 4: 'lg:col-span-12 xl:col-span-4', 6: 'lg:col-span-6', 12: 'lg:col-span-12' }

// O nome do período nos títulos: "Novembro de 2026", "Últimos 30 dias", "Este ano" ou "01/09/2026 a 19/11/2026".
const NOME_DO_ATALHO = Object.fromEntries(TIPOS_DE_PERIODO.map((t) => [t.valor, t.rotulo]))
const nomeDoPeriodo = (p) => (p.tipo === 'mes' ? rotuloDoMes(p.mes)
  : p.tipo === 'personalizado' ? descreverPeriodo(p.de, p.ate) : NOME_DO_ATALHO[p.tipo])
// "neste mês", "no ano" ou "no período" (frases de vazio).
const nesse = (p) => (p.tipo === 'mes' ? 'neste mês' : p.tipo === 'ano' ? 'no ano' : 'no período')

// O que vai ao banco: o mês (funções do mês) ou { de, ate } (funções do período).
const argumento = (p) => (p.tipo === 'mes' ? p.mes : { de: p.de, ate: p.ate })
// Os meses do gráfico de meses: os que o período cobre, no mínimo 6 e no máximo 24, até o mês do fim.
function mesesDoPeriodo(p) {
  const [anoDe, mesDe] = p.de.split('-').map(Number)
  const [anoAte, mesAte] = p.ate.split('-').map(Number)
  const cobertos = (anoAte - anoDe) * 12 + (mesAte - mesDe) + 1
  return Math.min(MESES_NO_MAXIMO, Math.max(MESES_NO_MINIMO, cobertos))
}

// Leituras do módulo (estáveis para o useLeitura). Cada uma devolve o período junto: enquanto o novo carrega, o gráfico
// de antes fica na tela (a 60%) com os rótulos do período dele.
const lerPorDia = ({ id, periodo }) => horasPorDia(id, argumento(periodo)).then((dados) => ({ periodo, dados }))
const lerConsultores = ({ id, periodo }) => horasPorConsultor(id, argumento(periodo)).then((dados) => ({ periodo, dados }))
const lerMeses = ({ id, periodo }) => horasPorMes(id, primeiroDoMes(periodo.ate), mesesDoPeriodo(periodo)).then((dados) => ({ periodo, dados }))
const lerSemanas = ({ id, periodo }) => checkinsPorSemana(id, argumento(periodo)).then((dados) => ({ periodo, dados }))

// O estado do cartão a partir da leitura do bloco.
const estadoDe = (leitura, vazio) => (leitura.erro ? 'erro' : !leitura.dados ? 'carregando' : vazio ? 'vazio' : 'pronto')
// Vazio ou com erro, o cartão fica da altura dele (sem esticar até o vizinho da linha: uma frase num cartão alto).
const naoEstica = (estado) => (estado === 'vazio' || estado === 'erro' ? 'self-start' : undefined)

function legendaDoBurnup(dados, periodo) {
  const doMes = periodo.tipo === 'mes'
  const atual = doMes && periodo.mes === mesAtual()
  return [
    { forma: 'linha', cor: 'serie', texto: 'Realizado acumulado' },
    ...(atual && dados?.projecao != null ? [{ forma: 'tracejado', cor: 'serie', texto: 'Projeção' }] : []),
    ...(!dados || dados.previsao ? [{ forma: 'linha', cor: 'ref', texto: !doMes ? 'Previsão do período (proporcional)' : atual ? 'Previsão' : 'Previsão atual' }] : []),
  ]
}

// Horas × previsão (burn-up). No Mês (horas_do_cliente_por_dia): o realizado acumulado dia a dia, com área clara; no mês
// atual, a projeção do banco tracejada até o fim; a previsão como linha de referência. Num período
// (horas_do_cliente_por_dia_no_periodo): o acumulado até hoje no máximo contra a previsão proporcional aos dias, do banco
// (sem projeção).
function HorasNoPeriodo({ leitura, periodo: periodoDoFiltro, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const titulo = `Horas × previsão · ${nomeDoPeriodo(periodo)}`
  const dados = leitura.dados?.dados
  const estado = estadoDe(leitura, dados && !Number(dados.realizado))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={ALTURA_DO_BURNUP} legenda={legendaDoBurnup(dados, periodo)}
      className={naoEstica(estado)} vazio={`Sem horas ${nesse(periodo)}.`} erro="Não foi possível carregar o gráfico de horas e previsão." aoTentarDeNovo={aoTentarDeNovo} />
  }

  const doMes = periodo.tipo === 'mes'
  const { dias, realizado, previsao, projecao } = dados
  const n = doMes ? dados.dias_no_mes : dias.length
  const diaDe = (i) => (doMes ? `${periodo.mes.slice(0, 8)}${String(i + 1).padStart(2, '0')}` : dias[i].dia)
  const ultimo = dias.length - 1
  const acumulado = Array.from({ length: n }, (_, i) => (i <= ultimo ? dias[i].acumulado : null))
  const comProjecao = doMes && periodo.mes === mesAtual() && projecao != null && ultimo < n - 1
  // A projeção (o número é do banco) vai em linha reta do último dia com horas até o fim do mês.
  const projetado = comProjecao
    ? acumulado.map((_, i) => (i <= ultimo ? null : realizado + ((projecao - realizado) * (i - ultimo)) / (n - 1 - ultimo)))
    : null
  const daPrevisao = (horas) => (previsao ? [{ valor: formatarOcupacao(horas / previsao), rotulo: doMes ? 'da previsão' : 'da previsão do período' }] : [])
  const dicas = acumulado.map((_, i) => {
    const dia = diaDe(i)
    const titulo = `${semana(dia)}, ${doMes ? diaMes(dia) : formatarDia(dia)}`
    if (i <= ultimo) {
      const { horas, acumulado: soma } = dias[i]
      return { titulo, linhas: [{ valor: formatarHoras(soma), rotulo: 'acumulado', cor: 'serie' }, { valor: horas ? `+${formatarHoras(horas)}` : '—', rotulo: 'no dia' }, ...daPrevisao(soma)] }
    }
    if (projetado) return { titulo, linhas: [{ valor: `≈ ${formatarHoras(projetado[i])}`, rotulo: 'projeção', cor: 'serie', tracejado: true }, ...(previsao ? [{ valor: formatarHoras(previsao), rotulo: 'previsão', cor: 'ref' }] : [])] }
    return { titulo, linhas: [{ valor: '—', rotulo: 'ainda não chegou' }] }
  })
  // A tabela tem os mesmos números da dica: no Mês, todos os dias (até 31); num período (até 2 anos), só os dias com horas.
  const linhas = (doMes ? dias : dias.filter((d) => d.horas))
    .map((d) => [doMes ? diaMes(d.dia) : formatarDia(d.dia), formatarHoras(d.horas), formatarHoras(d.acumulado)])

  return (
    <CartaoDeGrafico titulo={titulo} leitura={doMes ? fraseDoMesDoCliente(dados) : fraseDoPeriodoDoCliente(dados, periodo)}
      legenda={legendaDoBurnup(dados, periodo)} altura={ALTURA_DO_BURNUP} atualizando={leitura.atualizando}
      tabela={{ rotulo: `Horas por dia · ${nomeDoPeriodo(periodo)}`, colunas: ['Dia', 'No dia', 'Acumulado'], linhas }}>
      <GraficoDeLinha altura={ALTURA_DO_BURNUP} unidade="h" rotulos={acumulado.map((_, i) => diaMes(diaDe(i)))}
        rotuloAria={`Horas acumuladas · ${nomeDoPeriodo(periodo)}: ${formatarHoras(realizado)}${previsao ? ` de ${formatarHoras(previsao)}` : ''}`}
        series={[{ nome: 'acumulado', area: true, pontos: acumulado }, ...(projetado ? [{ nome: 'projeção', tracejada: true, pontos: projetado }] : [])]}
        dicas={dicas}
        referenciaHorizontal={previsao > 0 ? { valor: previsao, rotulo: `Previsão ${formatarHoras(previsao)}` } : null}
        marcas={[
          { serie: 0, i: ultimo, lado: projetado ? 'esquerda' : 'acima', texto: formatarHoras(realizado) },
          ...(projetado ? [{ serie: 1, i: n - 1, texto: `≈ ${formatarHoras(projecao)}` }] : []),
        ]} />
    </CartaoDeGrafico>
  )
}

// Horas por consultor no período: barras, mais horas primeiro; quem a pessoa não vê aparece como "outro consultor".
function HorasPorConsultor({ leitura, periodo: periodoDoFiltro, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const titulo = `Horas por consultor · ${nomeDoPeriodo(periodo)}`
  const lista = leitura.dados?.dados
  // Check-in aberto conta como consultor com 0 h: sem nenhuma hora, o cartão fica vazio, como o burn-up.
  const estado = estadoDe(leitura, lista && !lista.some((c) => c.horas > 0))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={72} vazio={`Sem horas ${nesse(periodo)}.`}
      erro="Não foi possível carregar o gráfico de horas por consultor." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const total = lista.reduce((soma, c) => soma + c.horas, 0)
  const nome = (c) => c.nome ?? 'outro consultor'
  const parte = (c) => formatarOcupacao(total ? c.horas / total : 0)
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDosConsultores(lista, periodo)} atualizando={leitura.atualizando}
      tabela={{ rotulo: titulo, colunas: ['Consultor', 'Horas', 'Das horas'], linhas: lista.map((c) => [nome(c), formatarHoras(c.horas), parte(c)]) }}>
      <BarrasHorizontais rotulo={titulo}
        itens={lista.map((c, i) => ({
          chave: c.consultorId ?? i, nome: nome(c), valor: c.horas, valorTexto: formatarHoras(c.horas),
          aria: `${nome(c)}: ${formatarHoras(c.horas)}`,
          dica: { titulo: nome(c), linhas: [{ valor: formatarHoras(c.horas), rotulo: 'registradas', cor: 'serie' }, { valor: parte(c), rotulo: 'das horas' }] },
        }))} />
    </CartaoDeGrafico>
  )
}

// Horas por mês (horas_do_cliente_por_mes com p_ate e p_meses): no Mês, os 6 meses até ele, com ele em destaque; num
// período, os meses que ele cobre (no mínimo 6, até 24), e os de fora esmaecidos. A linha é a previsão atual.
function HorasPorMes({ leitura, periodo: periodoDoFiltro, previsao, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const doMes = periodo.tipo === 'mes'
  const titulo = doMes ? `Últimos 6 meses · até ${rotuloCurto(periodo.mes)}` : `Horas por mês · ${nomeDoPeriodo(periodo)}`
  const meses = leitura.dados?.dados
  const de = primeiroDoMes(periodo.de)
  const ate = primeiroDoMes(periodo.ate)
  const fora = (m) => m.mes < de || m.mes > ate
  const legenda = [
    { forma: 'quadrado', cor: 'serie', texto: 'Realizado' },
    ...(meses?.some(fora) ? [{ forma: 'quadrado', cor: FORA_DO_PERIODO, texto: 'Fora do período' }] : []),
    ...(previsao ? [{ forma: 'linha', cor: 'ref', texto: `Previsão atual (${formatarHoras(previsao)})` }] : []),
  ]
  const estado = estadoDe(leitura, meses?.every((m) => !m.realizado))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={ALTURA_DOS_MESES} legenda={legenda}
      vazio={`Sem horas nos últimos ${meses?.length ?? MESES_NO_MINIMO} meses.`}
      erro="Não foi possível carregar o gráfico de horas por mês." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const atual = mesAtual()
  const ateHoje = (m) => (m.mes === atual ? ` (até ${diaMes(hojeEmSP())})` : '')
  const daPrevisao = (m) => (previsao ? formatarOcupacao(m.realizado / previsao) : '—')
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDosSeisMeses(meses, previsao)} legenda={legenda} altura={ALTURA_DOS_MESES}
      atualizando={leitura.atualizando}
      tabela={{
        rotulo: titulo,
        colunas: ['Mês', 'Realizado', '% da previsão atual'],
        linhas: meses.map((m) => [`${rotuloDoMes(m.mes)}${ateHoje(m)}${fora(m) ? ' (fora do período)' : ''}`, formatarHoras(m.realizado), daPrevisao(m)]),
      }}>
      <GraficoDeColunas altura={ALTURA_DOS_MESES} rotuloAria={titulo} referenciaHorizontal={previsao > 0 ? { valor: previsao } : null}
        itens={meses.map((m) => ({
          chave: m.mes, rotulo: rotuloCurto(m.mes), valor: m.realizado, esmaecido: fora(m),
          aria: `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}${ateHoje(m)}`,
          dica: { titulo: `${rotuloDoMes(m.mes)}${ateHoje(m)}`, linhas: [{ valor: formatarHoras(m.realizado), rotulo: 'realizado', cor: 'serie' }, ...(previsao ? [{ valor: daPrevisao(m), rotulo: 'da previsão atual' }] : [])] },
        }))} />
    </CartaoDeGrafico>
  )
}

// Check-ins por semana no período: uma coluna por semana (segunda a domingo) que toca o período; o rótulo é a
// segunda-feira, como na dica e na tabela ("Semana de"); com até 8 semanas, o número fica em cima de cada coluna.
function SemanasDoPeriodo({ leitura, periodo: periodoDoFiltro, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const titulo = `Check-ins por semana · ${nomeDoPeriodo(periodo)}`
  const semanas = leitura.dados?.dados
  const estado = estadoDe(leitura, semanas?.every((s) => !s.quantidade))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={ALTURA_DAS_SEMANAS} className={naoEstica(estado)}
      vazio={`Sem check-ins ${nesse(periodo)}.`}
      erro="Não foi possível carregar o gráfico de check-ins por semana." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const hoje = hojeEmSP()
  const comNumero = semanas.length <= COM_NUMERO_EM_CIMA
  const descricao = (s) => `${plural(s.quantidade, 'check-in', 'check-ins')}, ${formatarHoras(s.horas)}`
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDasSemanasDoCliente(semanas, periodo)} altura={ALTURA_DAS_SEMANAS} atualizando={leitura.atualizando}
      tabela={{ rotulo: titulo, colunas: ['Semana de', 'Check-ins', 'Horas'], linhas: semanas.map((s) => [formatarDia(s.semana), INTEIRO.format(s.quantidade), formatarHoras(s.horas)]) }}>
      <GraficoDeColunas altura={ALTURA_DAS_SEMANAS} unidade="" rotuloAria={titulo}
        itens={semanas.map((s) => ({
          chave: s.semana, rotulo: diaMes(s.semana), valor: s.quantidade,
          rotuloNaColuna: comNumero && s.semana <= hoje ? INTEIRO.format(s.quantidade) : undefined,
          aria: `Semana de ${diaMes(s.semana)}: ${descricao(s)}`,
          dica: { titulo: `Semana de ${formatarDia(s.semana)}`, linhas: [{ valor: plural(s.quantidade, 'check-in', 'check-ins'), cor: 'serie' }, { valor: formatarHoras(s.horas), rotulo: 'registradas' }] },
        }))} />
    </CartaoDeGrafico>
  )
}

// Andamento do check-list por etapa (as etapas de hoje_do_cliente: situação de hoje, não segue o período). Resolvida =
// feita ou não se aplica (como no resto do app); as que não se aplicam aparecem à parte na dica e na tabela.
function Etapas({ etapas }) {
  const titulo = 'Andamento do check-list por etapa · hoje'
  const algumaNaoSeAplica = etapas.some((e) => e.nao_se_aplica)
  const conta = (e) => {
    const resolvidas = e.feitas + (e.nao_se_aplica ?? 0)
    return { resolvidas, aFazer: e.tarefas - resolvidas - e.atrasadas }
  }
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDasEtapas(etapas)}
      legenda={[
        { forma: 'quadrado', cor: 'serie', texto: algumaNaoSeAplica ? 'Resolvidas' : 'Feitas' },
        { forma: 'quadrado', cor: 'acima', texto: 'Atrasadas' },
        { forma: 'quadrado', cor: 'neutro', texto: 'A fazer' },
      ]}
      tabela={{
        rotulo: titulo,
        colunas: ['Etapa', 'Feitas', ...(algumaNaoSeAplica ? ['Não se aplica'] : []), 'Atrasadas', 'A fazer'],
        linhas: etapas.map((e) => [e.nome, INTEIRO.format(e.feitas), ...(algumaNaoSeAplica ? [INTEIRO.format(e.nao_se_aplica ?? 0)] : []),
          INTEIRO.format(e.atrasadas), INTEIRO.format(conta(e).aFazer)]),
      }}>
      <BarrasHorizontais rotulo="Etapas do check-list"
        itens={etapas.map((e) => {
          const { resolvidas, aFazer } = conta(e)
          return {
            chave: e.id, nome: e.nome, valor: e.tarefas, valorTexto: `${INTEIRO.format(resolvidas)}/${INTEIRO.format(e.tarefas)}`,
            icone: e.atrasadas ? 'alerta' : undefined,
            partes: [{ tom: 'feita', valor: resolvidas }, { tom: 'atrasada', valor: e.atrasadas }, { tom: 'neutro', valor: aFazer }],
            aria: `${e.nome}: ${INTEIRO.format(resolvidas)} de ${INTEIRO.format(e.tarefas)} ${e.nao_se_aplica ? 'resolvidas' : 'feitas'}${e.atrasadas ? `, ${plural(e.atrasadas, 'atrasada', 'atrasadas')}` : ''}`,
            dica: {
              titulo: e.nome,
              linhas: [
                { valor: `${INTEIRO.format(e.feitas)} de ${INTEIRO.format(e.tarefas)}`, rotulo: 'feitas', cor: 'serie' },
                ...(e.nao_se_aplica ? [{ valor: INTEIRO.format(e.nao_se_aplica), rotulo: e.nao_se_aplica === 1 ? 'não se aplica' : 'não se aplicam' }] : []),
                { valor: INTEIRO.format(e.atrasadas), rotulo: e.atrasadas === 1 ? 'atrasada' : 'atrasadas', cor: 'acima' },
                { valor: INTEIRO.format(aFazer), rotulo: 'a fazer' },
              ],
            },
          }
        })} />
    </CartaoDeGrafico>
  )
}

// Os gráficos da aba Geral, no período do filtro de cima da aba (pedido do Diego, 19/11: Mês, Últimos 30 e 90 dias,
// Este ano e Personalizado, como o Início; `periodo` é o de lerPeriodo, já válido). Só eles seguem o período; a faixa
// "Hoje" e o andamento do check-list, não. `etapas`: as do check-list, da mesma leitura da faixa (a página passa; sem
// modelo, o gráfico não aparece). `versao` (check-in ou check-out feito na página) relê tudo; "Tentar de novo" relê só o
// gráfico que falhou.
export default function GraficosDoCliente({ cliente, periodo, versao = 0, etapas }) {
  const [tentativas, setTentativas] = useState({ dia: 0, consultores: 0, meses: 0, semanas: 0 })
  const tentarDeNovo = (bloco) => () => setTentativas((t) => ({ ...t, [bloco]: t[bloco] + 1 }))
  const idDoTitulo = useId()
  const com = (bloco) => ({ id: cliente.id, periodo, versao, tentativa: tentativas[bloco] })
  const porDia = useLeituraDoBloco(lerPorDia, com('dia'))
  const consultores = useLeituraDoBloco(lerConsultores, com('consultores'))
  const meses = useLeituraDoBloco(lerMeses, com('meses'))
  const semanas = useLeituraDoBloco(lerSemanas, com('semanas'))
  const comEtapas = etapas?.length > 0

  return (
    <section aria-labelledby={idDoTitulo} className="grid gap-3">
      <h2 id={idDoTitulo} className="section-label">No período</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 max-sm:gap-3 lg:grid-cols-12">
        <div className={cn('grid min-w-0', LARGURA[8])}>
          <HorasNoPeriodo leitura={porDia} periodo={periodo} aoTentarDeNovo={tentarDeNovo('dia')} />
        </div>
        <div className={cn('grid min-w-0 content-start gap-4 max-sm:gap-3 md:grid-cols-2 xl:grid-cols-1', LARGURA[4])}>
          <HorasPorConsultor leitura={consultores} periodo={periodo} aoTentarDeNovo={tentarDeNovo('consultores')} />
          <HorasPorMes leitura={meses} periodo={periodo} previsao={Number(cliente.horas_mes) || 0} aoTentarDeNovo={tentarDeNovo('meses')} />
        </div>
        <div className={cn('grid min-w-0', LARGURA[comEtapas ? 6 : 12])}>
          <SemanasDoPeriodo leitura={semanas} periodo={periodo} aoTentarDeNovo={tentarDeNovo('semanas')} />
        </div>
        {comEtapas && <div className={cn('grid min-w-0', LARGURA[6])}><Etapas etapas={etapas} /></div>}
      </div>
    </section>
  )
}
