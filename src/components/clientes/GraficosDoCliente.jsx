import { useId, useState } from 'react'
import BarrasHorizontais from '@/components/graficos/BarrasHorizontais'
import CartaoDeGrafico from '@/components/graficos/CartaoDeGrafico'
import { COR_OUTROS, SITUACOES, corDaPaleta, corDaSerie, corDe } from '@/components/graficos/cores'
import FaixaDeGrupos from '@/components/graficos/FaixaDeGrupos'
import GraficoDeColunas from '@/components/graficos/GraficoDeColunas'
import GraficoDeLinha from '@/components/graficos/GraficoDeLinha'
import MapaDeCalor from '@/components/graficos/MapaDeCalor'
import Rosca from '@/components/graficos/Rosca'
import { minutosFeitos } from '@/components/checkins/tempo'
import { useLeituraDoBloco } from '@/components/inicio/useLeituraDoBloco'
import { CORES_DAS_COLUNAS, corDaColuna } from '@/components/quadro/cores'
import { checkinsPorSemana, horasPorConsultor, horasPorDia, horasPorMes } from '@/data/clientes'
import { quadroPorId } from '@/data/quadro'
import { DIAS_DA_SEMANA, diaDaSemana, somarDias } from '@/lib/calendario'
import {
  fraseDasEtapas, fraseDasSemanasDoCliente, fraseDoMesDoCliente, fraseDoPeriodoDoCliente, fraseDoQuadro, fraseDoTempo, fraseDosConsultores,
  fraseDosDiasComCheckin, fraseDosSeisMeses,
} from '@/lib/frasesDosGraficos'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { formatarDia, hoje as hojeEmSP, mesAtual, rotuloCurto, rotuloDoMes } from '@/lib/mes'
import { TIPOS_DE_PERIODO, descreverPeriodo } from '@/lib/periodo'
import { cn } from '@/lib/utils'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const plural = (n, um, varios) => `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const semana = (dia) => DIAS_DA_SEMANA[diaDaSemana(dia)].toLowerCase()
const primeiroDoMes = (dia) => `${dia.slice(0, 7)}-01`
const segundaDe = (dia) => somarDias(dia, -((diaDaSemana(dia) + 6) % 7))
const MESES_NO_MINIMO = 6
const MESES_NO_MAXIMO = 24 // o que horas_do_cliente_por_mes aceita
// Horas por mês: os meses anteriores em lima, o de hoje no azul da série, o que passou da previsão em vermelho.
const LIMA = corDaPaleta('indigo')
const CIANO = corDe('calor-ciano')
const FORA_DO_PERIODO = `color-mix(in srgb, ${LIMA} 42%, var(--card))`
const NUMERO_EM_CIMA_ATE = 6 // com mais colunas, só o "▲" cabe em cima do mês que passou (a 360 px)
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const CONSULTORES_NA_ROSCA = 8 // mais que isso: os 8 maiores e "Outros"

const ALTURA_DO_BURNUP = 240
const ALTURA_DOS_MESES = 160
const ALTURA_DAS_SEMANAS = 190
const COM_NUMERO_EM_CIMA = 8 // até 8 colunas de semana, o número fica em cima de cada uma
// Grade de 12 colunas, como o Início: a partir de 1280 px, 8+4 e 6+6; de 1024 a 1279, o de 8 e o de 4 ocupam a linha e
// os de 6 ficam lado a lado; abaixo de 1024, uma coluna.
const LARGURA = { 8: 'lg:col-span-12 xl:col-span-8', 4: 'lg:col-span-12 xl:col-span-4', 6: 'lg:col-span-6' }

// O nome do período nos títulos: "Novembro de 2026", "Últimos 30 dias", "Este ano" ou "01/09/2026 a 19/11/2026".
const NOME_DO_ATALHO = Object.fromEntries(TIPOS_DE_PERIODO.map((t) => [t.valor, t.rotulo]))
const nomeDoPeriodo = (p) => (p.tipo === 'mes' ? rotuloDoMes(p.mes)
  : p.tipo === 'personalizado' ? descreverPeriodo(p.de, p.ate) : NOME_DO_ATALHO[p.tipo])
// "neste mês", "no ano" ou "no período" (frases de vazio); "no mês"… (o meio da rosca).
const nesse = (p) => (p.tipo === 'mes' ? 'neste mês' : p.tipo === 'ano' ? 'no ano' : 'no período')
const no = (p) => (p.tipo === 'mes' ? 'no mês' : p.tipo === 'ano' ? 'no ano' : 'no período')
// Período novo = gráfico novo (desenha de novo); a releitura do mesmo período (versao) não.
const chaveDo = (p) => `${p.tipo}|${p.de}|${p.ate}`

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
// O quadro pelo id que hoje_do_cliente mandou: quadro_por_id só lê (quadro_do_cliente criaria o quadro de quem mexe).
const lerQuadro = ({ id }) => quadroPorId(id)

// O estado do cartão a partir da leitura do bloco.
const estadoDe = (leitura, vazio) => (leitura.erro ? 'erro' : !leitura.dados ? 'carregando' : vazio ? 'vazio' : 'pronto')
// Vazio ou com erro, o cartão fica da altura dele (sem esticar até o vizinho da linha: uma frase num cartão alto).
const naoEstica = (estado) => (estado === 'vazio' || estado === 'erro' ? 'self-start' : undefined)

function legendaDoBurnup(dados, periodo, acima) {
  const doMes = periodo.tipo === 'mes'
  const atual = doMes && periodo.mes === mesAtual()
  return [
    { forma: 'linha', cor: 'serie', texto: 'Realizado acumulado' },
    ...(atual && dados?.projecao != null ? [{ forma: 'tracejado', cor: acima ? 'acima' : 'serie', texto: 'Projeção' }] : []),
    ...(!dados || dados.previsao ? [{ forma: 'linha', cor: 'ref', texto: !doMes ? 'Previsão do período (proporcional)' : atual ? 'Previsão' : 'Previsão atual' }] : []),
  ]
}

// Horas × previsão (burn-up). No Mês (horas_do_cliente_por_dia): o realizado acumulado dia a dia, com área clara; no mês
// atual, a projeção do banco tracejada até o fim (vermelha quando passa da previsão); a previsão como linha de referência.
// Num período (horas_do_cliente_por_dia_no_periodo): o acumulado até hoje no máximo contra a previsão proporcional aos
// dias, do banco (sem projeção).
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
  const acima = comProjecao && previsao > 0 && projecao > previsao
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
    if (projetado) return { titulo, linhas: [{ valor: `≈ ${formatarHoras(projetado[i])}`, rotulo: 'projeção', cor: acima ? 'acima' : 'serie', tracejado: true }, ...(previsao ? [{ valor: formatarHoras(previsao), rotulo: 'previsão', cor: 'ref' }] : [])] }
    return { titulo, linhas: [{ valor: '—', rotulo: 'ainda não chegou' }] }
  })
  // A tabela tem os mesmos números da dica: no Mês, todos os dias (até 31); num período (até 2 anos), só os dias com horas.
  const linhas = (doMes ? dias : dias.filter((d) => d.horas))
    .map((d) => [doMes ? diaMes(d.dia) : formatarDia(d.dia), formatarHoras(d.horas), formatarHoras(d.acumulado)])

  return (
    <CartaoDeGrafico titulo={titulo} leitura={doMes ? fraseDoMesDoCliente(dados) : fraseDoPeriodoDoCliente(dados, periodo)}
      legenda={legendaDoBurnup(dados, periodo, acima)} altura={ALTURA_DO_BURNUP} atualizando={leitura.atualizando}
      tabela={{ rotulo: `Horas por dia · ${nomeDoPeriodo(periodo)}`, colunas: ['Dia', 'No dia', 'Acumulado'], linhas }}>
      <GraficoDeLinha key={chaveDo(periodo)} altura={ALTURA_DO_BURNUP} unidade="h" rotulos={acumulado.map((_, i) => diaMes(diaDe(i)))}
        rotuloAria={`Horas acumuladas · ${nomeDoPeriodo(periodo)}: ${formatarHoras(realizado)}${previsao ? ` de ${formatarHoras(previsao)}` : ''}`}
        series={[{ nome: 'acumulado', area: true, pontos: acumulado }, ...(projetado ? [{ nome: 'projeção', tracejada: true, pontos: projetado, cor: acima ? 'acima' : undefined }] : [])]}
        dicas={dicas}
        referenciaHorizontal={previsao > 0 ? { valor: previsao, rotulo: `Previsão ${formatarHoras(previsao)}` } : null}
        marcas={[
          { serie: 0, i: ultimo, lado: projetado ? 'esquerda' : 'acima', texto: formatarHoras(realizado) },
          ...(projetado ? [{ serie: 1, i: n - 1, texto: `≈ ${formatarHoras(projecao)}` }] : []),
        ]} />
    </CartaoDeGrafico>
  )
}

// As partes da rosca de consultores: a ordem do banco (mais horas primeiro) pela paleta; quem a pessoa não vê é "Outro
// consultor" (2, 3… se houver mais de um: o nome é a chave do arco); mais de 8, os 8 maiores e "Outros" em grafite.
function partesDosConsultores(lista) {
  const vistos = new Map()
  const partes = lista.map((c, i) => {
    const nome = c.nome ?? 'Outro consultor'
    const vez = (vistos.get(nome) ?? 0) + 1
    vistos.set(nome, vez)
    // Nome repetido (dois consultores iguais, ou vários que a pessoa não vê) ganha número: o nome é a chave do arco.
    return { nome: vez > 1 ? `${nome} ${vez}` : nome, valor: c.horas, cor: corDaSerie(i) }
  })
  if (partes.length <= CONSULTORES_NA_ROSCA) return partes
  const resto = partes.slice(CONSULTORES_NA_ROSCA).reduce((soma, p) => soma + p.valor, 0)
  return [...partes.slice(0, CONSULTORES_NA_ROSCA), { nome: 'Outros', valor: resto, cor: COR_OUTROS }]
}

// Horas por consultor no período: rosca com o total no meio.
function HorasPorConsultor({ leitura, periodo: periodoDoFiltro, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const titulo = `Horas por consultor · ${nomeDoPeriodo(periodo)}`
  const lista = leitura.dados?.dados
  // Check-in aberto conta como consultor com 0 h: sem nenhuma hora, o cartão fica vazio, como o burn-up.
  const estado = estadoDe(leitura, lista && !lista.some((c) => c.horas > 0))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={160} className={naoEstica(estado)} vazio={`Sem horas ${nesse(periodo)}.`}
      erro="Não foi possível carregar o gráfico de horas por consultor." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const partes = partesDosConsultores(lista)
  const total = partes.reduce((soma, p) => soma + p.valor, 0)
  return (
    <CartaoDeGrafico titulo={titulo} leitura={fraseDosConsultores(lista, periodo)} atualizando={leitura.atualizando}
      tabela={{ rotulo: titulo, colunas: ['Consultor', 'Horas', 'Das horas'], linhas: partes.map((p) => [p.nome, formatarHoras(p.valor), formatarOcupacao(p.valor / total)]) }}>
      <Rosca key={chaveDo(periodo)} rotulo={titulo} partes={partes} formatar={formatarHoras} centro={{ valor: formatarHoras(total), rotulo: no(periodo) }} />
    </CartaoDeGrafico>
  )
}

// Horas por mês (horas_do_cliente_por_mes com p_ate e p_meses): no Mês, os 6 meses até ele, com ele em azul; num período,
// os meses que ele cobre (no mínimo 6, até 24), o de hoje em azul e os de fora esmaecidos (em lima). A linha é a
// previsão atual. O mês do período que passou dela fica vermelho, com "▲" e o número em cima; os outros, em lima.
function HorasPorMes({ leitura, periodo: periodoDoFiltro, previsao, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const doMes = periodo.tipo === 'mes'
  const titulo = doMes ? `Últimos 6 meses · até ${rotuloCurto(periodo.mes)}` : `Horas por mês · ${nomeDoPeriodo(periodo)}`
  const meses = leitura.dados?.dados
  const de = primeiroDoMes(periodo.de)
  const ate = primeiroDoMes(periodo.ate)
  const atual = mesAtual()
  const emAzul = doMes ? periodo.mes : atual
  // No Mês, os 5 de antes são o contexto do escolhido (nada esmaece); num período, o que fica de fora esmaece.
  const fora = (m) => !doMes && (m.mes < de || m.mes > ate)
  const passou = (m) => !fora(m) && previsao > 0 && m.realizado > previsao
  const cor = (m) => (passou(m) ? 'acima' : m.mes === emAzul ? 'serie' : LIMA)
  const legenda = [
    { forma: 'quadrado', cor: LIMA, texto: 'Meses anteriores' },
    ...(meses?.some((m) => cor(m) === 'serie') ? [{ forma: 'quadrado', cor: 'serie', texto: emAzul === atual ? 'Este mês (até hoje)' : 'Mês escolhido' }] : []),
    ...(meses?.some(passou) ? [{ forma: 'quadrado', cor: 'acima', texto: 'Passou da previsão' }] : []),
    ...(meses?.some(fora) ? [{ forma: 'quadrado', cor: FORA_DO_PERIODO, texto: 'Fora do período' }] : []),
    ...(previsao ? [{ forma: 'linha', cor: 'ref', texto: `Previsão atual (${formatarHoras(previsao)})` }] : []),
  ]
  const estado = estadoDe(leitura, meses?.every((m) => !m.realizado))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} estado={estado} altura={ALTURA_DOS_MESES} legenda={legenda}
      vazio={`Sem horas nos últimos ${meses?.length ?? MESES_NO_MINIMO} meses.`}
      erro="Não foi possível carregar o gráfico de horas por mês." aoTentarDeNovo={aoTentarDeNovo} />
  }
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
          chave: m.mes, rotulo: rotuloCurto(m.mes), valor: m.realizado, esmaecido: fora(m), cor: cor(m) === 'serie' ? undefined : cor(m),
          rotuloNaColuna: passou(m) ? (meses.length <= NUMERO_EM_CIMA_ATE ? `▲ ${NUMERO.format(m.realizado)}` : '▲') : undefined,
          aria: `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}${ateHoje(m)}${passou(m) ? ' (passou da previsão)' : ''}`,
          dica: {
            titulo: `${rotuloDoMes(m.mes)}${ateHoje(m)}`,
            linhas: [{ valor: formatarHoras(m.realizado), rotulo: 'realizado', cor: cor(m) },
              ...(previsao ? [{ valor: daPrevisao(m), rotulo: passou(m) ? 'da previsão atual: passou' : 'da previsão atual' }] : [])],
          },
        }))} />
    </CartaoDeGrafico>
  )
}

// Dias com check-in: calendário de calor (semanas × dias, segunda a domingo) do período, uma cor só (ciano), mais forte
// com mais horas no dia. Os dias vêm da leitura do burn-up (a mesma chamada); o dia fora do período e o que ainda não
// chegou ficam em branco. São horas (um check-in de 1 minuto arredonda para 0 h e não pinta o dia), como no burn-up.
function DiasDoPeriodo({ leitura, periodo: periodoDoFiltro, aoTentarDeNovo }) {
  const periodo = leitura.dados?.periodo ?? periodoDoFiltro
  const titulo = `Dias com check-in · ${nomeDoPeriodo(periodo)}`
  const subtitulo = 'Horas em cada dia; quanto mais forte, mais horas'
  const dias = leitura.dados?.dados?.dias
  const estado = estadoDe(leitura, dias && !dias.some((d) => d.horas > 0))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={estado} altura={200} className={naoEstica(estado)}
      vazio={`Sem horas ${nesse(periodo)}.`} erro="Não foi possível carregar os dias com check-in." aoTentarDeNovo={aoTentarDeNovo} />
  }
  const horas = new Map(dias.map((d) => [d.dia, d.horas]))
  const segundas = []
  for (let s = segundaDe(periodo.de); s <= periodo.ate; s = somarDias(s, 7)) segundas.push(s)
  const diaDe = (i, j) => somarDias(segundas[j], i)
  const valores = DIAS.map((_, i) => segundas.map((__, j) => horas.get(diaDe(i, j)) ?? null))
  const data = (dia) => (periodo.tipo === 'mes' ? diaMes(dia) : formatarDia(dia))
  const dicaDe = (i, j) => {
    const dia = diaDe(i, j)
    const v = valores[i][j]
    const texto = v == null ? (dia > hojeEmSP() ? 'ainda não chegou' : 'fora do período') : v ? formatarHoras(v) : 'sem check-in'
    return { titulo: `${DIAS[i]}, ${data(dia)}`, linhas: [{ valor: texto, ...(v ? { cor: CIANO } : {}) }] }
  }

  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={fraseDosDiasComCheckin(dias, periodo)} atualizando={leitura.atualizando}
      tabela={{ rotulo: `Dias com check-in · ${nomeDoPeriodo(periodo)}`, colunas: ['Dia', 'Horas'], linhas: dias.filter((d) => d.horas > 0).map((d) => [`${semana(d.dia)}, ${formatarDia(d.dia)}`, formatarHoras(d.horas)]) }}>
      <MapaDeCalor key={chaveDo(periodo)} rotulo={titulo} linhas={DIAS} colunas={segundas.map(diaMes)} valores={valores} cor="calor-ciano" dicaDe={dicaDe} />
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

// O estado de um bloco de hoje (check-list, tempo, quadro), que vem da leitura da faixa Hoje (a página lê, uma vez).
const estadoDeHoje = (hoje, vazio) => (hoje?.erro ? 'erro' : hoje?.dados === undefined ? 'carregando' : vazio ? 'vazio' : 'pronto')
const ERRO_DE_HOJE = 'Não foi possível carregar a situação de hoje.'
const SEM_MODELO = 'Nenhum modelo de check-list aplicado.'

// Check-list por etapa (as etapas de hoje_do_cliente: situação de hoje, não segue o período): uma barra empilhada por
// etapa com as seis situações (feitas, não se aplicam, em andamento, pausadas, a fazer no prazo, atrasadas: as partes
// somam as tarefas) e "N de M" resolvidas (feitas + não se aplica, como no resto do app).
function Etapas({ hoje, aoTentarDeNovo }) {
  const titulo = 'Check-list por etapa'
  const checklist = hoje?.dados?.checklist
  const etapas = (checklist?.etapas ?? []).map((e) => {
    const conhecidas = e.feitas + (e.nao_se_aplica ?? 0) + (e.andamento ?? 0) + (e.pausadas ?? 0) + e.atrasadas
    return { ...e, a_fazer: Math.max(0, e.tarefas - conhecidas), resolvidas: e.feitas + (e.nao_se_aplica ?? 0) }
  })
  const estado = estadoDeHoje(hoje, !etapas.some((e) => e.tarefas > 0))
  const subtitulo = `Situação de hoje${checklist ? ` · ${checklist.modelo_nome}` : ''}`
  const legenda = SITUACOES.map((s) => ({ forma: 'quadrado', cor: s.cor, texto: s.nome, icone: s.icone }))
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={estado} altura={120} legenda={legenda} className={naoEstica(estado)}
      vazio={checklist ? 'O check-list ainda não tem tarefas.' : SEM_MODELO} erro={ERRO_DE_HOJE} aoTentarDeNovo={aoTentarDeNovo} />
  }
  const nDeM = (e) => `${INTEIRO.format(e.resolvidas)} de ${INTEIRO.format(e.tarefas)}`
  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={fraseDasEtapas(etapas)} legenda={legenda} atualizando={hoje.atualizando}
      tabela={{
        rotulo: `${titulo} · hoje`,
        colunas: ['Etapa', ...SITUACOES.map((s) => s.nome), 'Resolvidas'],
        linhas: etapas.map((e) => [e.nome, ...SITUACOES.map((s) => INTEIRO.format(e[s.chave] ?? 0)), nDeM(e)]),
      }}>
      <BarrasHorizontais rotulo="Etapas do check-list"
        itens={etapas.map((e) => ({
          chave: e.id, nome: e.nome, valor: e.tarefas, valorTexto: nDeM(e),
          icone: e.atrasadas ? 'atrasada' : undefined,
          partes: SITUACOES.map((s) => ({ tom: s.cor, valor: e[s.chave] ?? 0 })),
          aria: `${e.nome}: ${nDeM(e)} resolvidas${e.atrasadas ? `, ${plural(e.atrasadas, 'atrasada', 'atrasadas')}` : ''}`,
          dica: {
            titulo: e.nome,
            linhas: [
              { valor: nDeM(e), rotulo: 'resolvidas' },
              ...SITUACOES.filter((s) => e[s.chave] > 0).map((s) => ({ valor: INTEIRO.format(e[s.chave]), rotulo: s.nome.toLowerCase(), cor: s.cor })),
            ],
          },
        }))} />
    </CartaoDeGrafico>
  )
}

// Onde foi o tempo: as 5 tarefas do check-list com mais tempo marcado (Iniciar/Pausar; mais_tempo de hoje_do_cliente).
function OndeFoiOTempo({ hoje, aoTentarDeNovo }) {
  const titulo = 'Onde foi o tempo'
  const subtitulo = 'Situação de hoje · as tarefas com mais tempo marcado (Iniciar/Pausar)'
  const checklist = hoje?.dados?.checklist
  const tarefas = checklist?.mais_tempo ?? []
  const estado = estadoDeHoje(hoje, !tarefas.length)
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={estado} altura={150} className={naoEstica(estado)}
      vazio={checklist ? 'Nenhuma tarefa com tempo marcado.' : SEM_MODELO} erro={ERRO_DE_HOJE} aoTentarDeNovo={aoTentarDeNovo} />
  }
  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={fraseDoTempo(tarefas)} atualizando={hoje.atualizando}
      tabela={{ rotulo: 'Tarefas com mais tempo marcado', colunas: ['Tarefa', 'Tempo'], linhas: tarefas.map((t) => [t.titulo, minutosFeitos(t.segundos)]) }}>
      <BarrasHorizontais rotulo={titulo}
        itens={tarefas.map((t, i) => ({
          // "menos de 1 min" não cabe na coluna do valor; por extenso fica na dica e no leitor de tela.
          chave: i, nome: t.titulo, valor: t.segundos, valorTexto: t.segundos < 60 ? '< 1 min' : minutosFeitos(t.segundos),
          aria: `${t.titulo}: ${minutosFeitos(t.segundos)}`,
          dica: { titulo: t.titulo, linhas: [{ valor: minutosFeitos(t.segundos), rotulo: 'marcado', cor: 'serie' }] },
        }))} />
    </CartaoDeGrafico>
  )
}

// Quadro do cliente: uma faixa com os cartões (não arquivados) de cada coluna, na cor da coluna (a escolhida ou a
// automática, pela paleta de 19/11). O quadro vem de quadro_por_id, pelo id que hoje_do_cliente mandou (sem id: o
// cliente não tem quadro, ou a pessoa não o vê); os atrasados, de hoje_do_cliente.
function ColunasDoQuadro({ hoje, versao, aoTentarDeNovoHoje }) {
  const titulo = 'Quadro do cliente'
  const [tentativa, setTentativa] = useState(0)
  const quadroDeHoje = hoje?.dados?.quadro
  const leitura = useLeituraDoBloco(lerQuadro, quadroDeHoje?.id ? { id: quadroDeHoje.id, versao, tentativa } : null)
  const colunas = leitura.dados?.colunas ?? []
  const total = colunas.reduce((soma, c) => soma + c.cartoes, 0)
  const subtitulo = `Situação de hoje${leitura.dados ? ` · ${plural(total, 'cartão', 'cartões')} por coluna` : ''}`
  // Sem quadro: hoje_do_cliente não mandou o id, ou quadro_por_id devolveu nulo (a pessoa não o vê).
  const semQuadro = (hoje?.dados !== undefined && !quadroDeHoje?.id) || leitura.dados === null
  const estado = hoje?.erro ? 'erro' : semQuadro ? 'vazio' : estadoDe(leitura, !total)
  if (estado !== 'pronto') {
    return <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} estado={estado} altura={60} className={naoEstica(estado)}
      vazio={semQuadro ? 'Este cliente ainda não tem quadro.' : 'Nenhum cartão no quadro.'}
      erro={hoje?.erro ? ERRO_DE_HOJE : 'Não foi possível carregar o quadro.'}
      aoTentarDeNovo={hoje?.erro ? aoTentarDeNovoHoje : () => setTentativa((t) => t + 1)} />
  }
  return (
    <CartaoDeGrafico titulo={titulo} subtitulo={subtitulo} leitura={fraseDoQuadro(colunas, quadroDeHoje.atrasados)} atualizando={leitura.atualizando || hoje.atualizando}
      tabela={{ rotulo: 'Cartões por coluna', colunas: ['Coluna', 'Cartões'], linhas: colunas.map((c) => [c.nome, INTEIRO.format(c.cartoes)]) }}>
      <FaixaDeGrupos rotulo="Cartões por coluna"
        grupos={colunas.map((c, i) => ({ nome: c.nome, n: c.cartoes, cor: corDaPaleta(CORES_DAS_COLUNAS[corDaColuna(c, i)].paleta) }))} />
    </CartaoDeGrafico>
  )
}

// Os gráficos da aba Geral (pedido do Diego, 19/11: gráficos variados, na ordem do protótipo aprovado), no período do
// filtro de cima da aba (Mês, Últimos 30 e 90 dias, Este ano e Personalizado, como o Início; `periodo` é o de lerPeriodo,
// já válido). Os do período: horas × previsão, horas por consultor, horas por mês, dias com check-in e check-ins por
// semana. Os de hoje (check-list por etapa, onde foi o tempo e o quadro) vêm de `hoje`, a leitura de hoje_do_cliente que
// a página faz para a faixa Hoje ({ dados, erro, atualizando }); `aoRelerHoje` relê essa leitura. `versao` (check-in ou
// check-out feito na página) relê tudo sem desenhar de novo; "Tentar de novo" relê só o gráfico que falhou.
export default function GraficosDoCliente({ cliente, periodo, versao = 0, hoje, aoRelerHoje }) {
  const [tentativas, setTentativas] = useState({ dia: 0, consultores: 0, meses: 0, semanas: 0 })
  const tentarDeNovo = (bloco) => () => setTentativas((t) => ({ ...t, [bloco]: t[bloco] + 1 }))
  const idDoTitulo = useId()
  const com = (bloco) => ({ id: cliente.id, periodo, versao, tentativa: tentativas[bloco] })
  const porDia = useLeituraDoBloco(lerPorDia, com('dia'))
  const consultores = useLeituraDoBloco(lerConsultores, com('consultores'))
  const meses = useLeituraDoBloco(lerMeses, com('meses'))
  const semanas = useLeituraDoBloco(lerSemanas, com('semanas'))

  // Os blocos na grade (largura de 12), na ordem do protótipo; cada um carrega e falha sozinho.
  const bloco = (largura, chave, conteudo) => <div key={chave} data-bloco={chave} className={cn('grid min-w-0', LARGURA[largura])}>{conteudo}</div>
  return (
    <section aria-labelledby={idDoTitulo} className="grid gap-3">
      <h2 id={idDoTitulo} className="section-label">No período</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 max-sm:gap-3 lg:grid-cols-12">
        {bloco(8, 'horas', <HorasNoPeriodo leitura={porDia} periodo={periodo} aoTentarDeNovo={tentarDeNovo('dia')} />)}
        {bloco(4, 'consultores', <HorasPorConsultor leitura={consultores} periodo={periodo} aoTentarDeNovo={tentarDeNovo('consultores')} />)}
        {bloco(6, 'meses', <HorasPorMes leitura={meses} periodo={periodo} previsao={Number(cliente.horas_mes) || 0} aoTentarDeNovo={tentarDeNovo('meses')} />)}
        {bloco(6, 'dias', <DiasDoPeriodo leitura={porDia} periodo={periodo} aoTentarDeNovo={tentarDeNovo('dia')} />)}
        {bloco(6, 'etapas', <Etapas hoje={hoje} aoTentarDeNovo={aoRelerHoje} />)}
        {bloco(6, 'tempo', <OndeFoiOTempo hoje={hoje} aoTentarDeNovo={aoRelerHoje} />)}
        {bloco(6, 'semanas', <SemanasDoPeriodo leitura={semanas} periodo={periodo} aoTentarDeNovo={tentarDeNovo('semanas')} />)}
        {bloco(6, 'quadro', <ColunasDoQuadro hoje={hoje} versao={versao} aoTentarDeNovoHoje={aoRelerHoje} />)}
      </div>
    </section>
  )
}
