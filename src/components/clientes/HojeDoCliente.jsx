import { useId, useRef } from 'react'
import { ArrowDown, CalendarDays, Check, ClipboardList, History, SquareKanban, RotateCcw, Timer, TriangleAlert, Video } from 'lucide-react'
import { Link } from 'react-router'
import { GraficoCarregando } from '@/components/comum/Carregando'
import { naoSeAplicaEmPalavras, progressoEmPalavras } from '@/components/checkins/situacao'
import BarraSegmentada from '@/components/graficos/BarraSegmentada'
import Dica from '@/components/graficos/Dica'
import DiasComCheckin from '@/components/graficos/DiasComCheckin'
import Medidor from '@/components/graficos/Medidor'
import { pontoDoFoco, useDica } from '@/components/graficos/useDica'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DIAS_DA_SEMANA, diaDaSemana, diaEmSP, diasEntre, horaEmSP, somarDias } from '@/lib/calendario'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'
import { formatarDia, hoje as hojeEmSP } from '@/lib/mes'
import { cn } from '@/lib/utils'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const plural = (n, um, varios) => `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const diasAte = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)
const semanaDe = (dia) => DIAS_DA_SEMANA[diaDaSemana(dia)].toLowerCase()
const comSemana = (dia) => `${semanaDe(dia)}, ${diaMes(dia)}`
// Os selos quebram a linha dentro do cartão (a 360 px o cartão tem ~134 px por dentro) em vez de passar da borda.
const SELO = 'h-auto max-w-full justify-start whitespace-normal rounded-lg text-left'
const SELO_PERIGO = `${SELO} border-transparent bg-destructive/10 text-destructive`
// O quadradinho do ícone de cada cartão, num tom da paleta (fundo suave, ícone no tom de texto; pedido do Diego, 19/11).
const TONS = {
  azul: 'bg-cor-azul-suave text-cor-azul-texto',
  turquesa: 'bg-cor-turquesa-suave text-cor-turquesa-texto',
  violeta: 'bg-cor-violeta-suave text-cor-violeta-texto',
  mostarda: 'bg-cor-mostarda-suave text-cor-mostarda-texto',
  verde: 'bg-cor-verde-suave text-cor-verde-texto',
}

// Um cartão da faixa: focável (Tab), com a dica no mouse, no toque e no foco; o leitor de tela ouve os números da dica
// como a descrição do cartão. Anima ao passar o mouse, como os cartões de números.
function Cartao({ titulo, icone: Icone, tom, dica, mostrar, esconder, className, children }) {
  const idDaDescricao = useId()
  const descricao = `${dica.titulo}: ${dica.linhas.map((l) => [l.valor, l.rotulo].filter(Boolean).join(' ')).join(' · ')}`
  return (
    <div role="group" aria-label={titulo} aria-describedby={idDaDescricao} tabIndex={0} data-alvo-da-dica=""
      className={cn('card cartao-animado flex min-w-0 flex-col gap-1.5 px-4 py-3.5 outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring max-md:px-3 max-md:py-3', className)}
      onPointerMove={(e) => mostrar(dica, e.clientX, e.clientY)} onPointerDown={(e) => !e.target.closest?.('a') && mostrar(dica, e.clientX, e.clientY)}
      onPointerLeave={(e) => e.pointerType !== 'touch' && esconder()}
      onFocus={(e) => e.target === e.currentTarget && mostrar(dica, ...pontoDoFoco(e.currentTarget))} onBlur={esconder}>
      <p className="flex items-center gap-1.5 text-rotulo font-medium text-muted-foreground">
        <span data-ladrilho="" className={cn('grid size-6 shrink-0 place-items-center rounded-md', TONS[tom])}>
          <Icone aria-hidden="true" className="icone-do-cartao size-3.5" />
        </span>
        {titulo}
      </p>
      {children}
      <span id={idDaDescricao} className="sr-only">{descricao}</span>
    </div>
  )
}

// O número grande e o detalhe ao lado (quebra embaixo quando não cabe).
function Valor({ valor, detalhe, perigo = false, mudo = false }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn('text-destaque leading-tight font-bold whitespace-nowrap tabular-nums', perigo && 'text-destructive', mudo && 'text-muted-foreground')}>{valor}</span>
      {detalhe && <span className="text-rotulo whitespace-nowrap text-muted-foreground tabular-nums">{detalhe}</span>}
    </p>
  )
}

const Rodape = ({ className, children }) => (
  <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-legenda text-muted-foreground', className)}>{children}</p>
)

// Link para outra aba da página (a mesma troca de aba das abas: sem empilhar o histórico).
const IrPara = ({ aba, children }) => (
  <Button asChild variant="link" size="sm" className="h-auto px-0 has-[>svg]:px-0">
    <Link to={{ search: `?aba=${aba}` }} replace>{children}</Link>
  </Button>
)

function Previsao({ previsao, ...dica }) {
  const { horas_mes: previsto, realizado, dia, dias_no_mes: diasNoMes, projecao, ritmo } = previsao
  const fracao = previsto > 0 ? realizado / previsto : null
  const passou = dia / diasNoMes
  const selo = ritmo === 'acima' ? <Badge variant="notice" className={SELO}><TriangleAlert aria-hidden="true" />vai passar: ≈ {formatarHoras(projecao)}</Badge>
    : ritmo === 'abaixo' ? <Badge variant="notice" className={SELO}><ArrowDown aria-hidden="true" />abaixo do ritmo: ≈ {formatarHoras(projecao)}</Badge>
      : ritmo === 'no_ritmo' ? <Badge variant="positive" className={SELO}><Check aria-hidden="true" />no ritmo</Badge>
        : projecao == null ? <span>começo do mês</span> : null
  return (
    <Cartao titulo="Previsão do mês" icone={Timer} tom="azul" {...dica} dica={{
      titulo: 'Previsão do mês (hoje)',
      linhas: [
        { valor: `${formatarHoras(realizado)} de ${formatarHoras(previsto)}`, rotulo: 'realizado', cor: 'serie' },
        { valor: formatarOcupacao(passou), rotulo: 'do mês já passou' },
        ...(projecao != null ? [{ valor: `≈ ${formatarHoras(projecao)}`, rotulo: 'no fim do mês', tracejado: true, cor: 'serie' }] : []),
      ],
    }}>
      <Valor valor={formatarOcupacao(fracao)} detalhe={`${formatarHoras(realizado)} de ${formatarHoras(previsto)}`} perigo={fracao > 1} />
      <Medidor fracao={fracao ?? 0} hoje={passou} acima={fracao > 1} />
      {selo && <Rodape>{selo}</Rodape>}
    </Cartao>
  )
}

const SELO_DO_CHECKIN = {
  em_dia: <Badge variant="positive" className={SELO}><Check aria-hidden="true" />em dia</Badge>,
  atencao: <Badge variant="notice" className={SELO}><TriangleAlert aria-hidden="true" />atenção</Badge>,
  em_risco: <Badge variant="outline" className={SELO_PERIGO}><TriangleAlert aria-hidden="true" />em risco</Badge>,
}

function UltimoCheckin({ checkin, hoje, ...dica }) {
  const { ultimo, dias_sem: diasSem, situacao } = checkin
  const com = new Set(checkin.dias_com_checkin)
  const dias = diasEntre(somarDias(hoje, -29), somarDias(hoje, 1))
    .map((dia) => ({ dia, com: com.has(dia), fimDeSemana: [0, 6].includes(diaDaSemana(dia)) }))
  const valor = diasSem == null ? '—' : diasSem === 0 ? 'hoje' : `há ${INTEIRO.format(diasSem)} d`
  return (
    <Cartao titulo="Último check-in" icone={History} tom="turquesa" {...dica} dica={{
      titulo: 'Últimos 30 dias',
      linhas: [
        { valor: plural(com.size, 'dia com check-in', 'dias com check-in'), rotulo: 'nos últimos 30 dias', cor: 'serie' },
        ...(ultimo ? [{ valor: formatarDia(ultimo), rotulo: 'último' }] : []),
      ],
    }}>
      <Valor valor={valor} detalhe={ultimo && diaMes(ultimo)} perigo={situacao === 'em_risco'} mudo={diasSem == null} />
      <DiasComCheckin dias={dias} />
      {SELO_DO_CHECKIN[situacao] && <Rodape>{SELO_DO_CHECKIN[situacao]}</Rodape>}
    </Cartao>
  )
}

function quandoE(dia, hoje) {
  const n = diasAte(hoje, dia)
  if (n <= 0) return 'hoje'
  return n === 1 ? 'amanhã' : `em ${INTEIRO.format(n)} dias`
}

function Reuniao({ reuniao, hoje, ...dica }) {
  if (!reuniao) {
    return (
      <Cartao titulo="Próxima reunião" icone={CalendarDays} tom="violeta" {...dica} dica={{ titulo: 'Próxima reunião', linhas: [{ valor: 'Nenhuma marcada' }] }}>
        <Valor valor="—" mudo />
        <Rodape>Nenhuma marcada</Rodape>
        <Rodape><IrPara aba="agenda">Marcar reunião</IrPara></Rodape>
      </Cartao>
    )
  }
  const dia = diaEmSP(reuniao.inicio)
  const hora = horaEmSP(reuniao.inicio)
  return (
    <Cartao titulo="Próxima reunião" icone={CalendarDays} tom="violeta" {...dica} dica={{
      titulo: 'Próxima reunião',
      linhas: [{ valor: `${comSemana(dia)} · ${hora}` }, { valor: reuniao.titulo }, ...(reuniao.com_meet ? [{ valor: 'Google Meet' }] : [])],
    }}>
      {/* "sáb, 21/11" no número grande não cabe no cartão do celular: lá o dia da semana desce para o lado da hora. */}
      <Valor valor={<><span className="max-sm:hidden">{semanaDe(dia)}, </span>{diaMes(dia)}</>}
        detalhe={<><span className="sm:hidden">{semanaDe(dia)} · </span>{hora}</>} />
      <p title={reuniao.titulo} className="truncate text-rotulo">{reuniao.titulo}</p>
      <Rodape>
        {reuniao.com_meet && <Badge variant="outline" className="border-transparent bg-primary/10 text-primary-texto"><Video aria-hidden="true" />Meet</Badge>}
        <span>{quandoE(dia, hoje)}</span>
      </Rodape>
    </Cartao>
  )
}

function Quadro({ quadro, ...dica }) {
  if (!quadro?.cartoes) {
    return (
      <Cartao titulo="Quadro" icone={SquareKanban} tom="mostarda" {...dica} dica={{ titulo: 'Quadro do cliente', linhas: [{ valor: 'Nenhum cartão' }] }}>
        <Valor valor="—" mudo />
        <Rodape>Nenhum cartão</Rodape>
        <Rodape><IrPara aba="quadro">Abrir quadro</IrPara></Rodape>
      </Cartao>
    )
  }
  const { cartoes, atrasados, sem_responsavel: semResponsavel } = quadro
  return (
    <Cartao titulo="Quadro" icone={SquareKanban} tom="mostarda" {...dica} dica={{
      titulo: 'Quadro do cliente',
      linhas: [
        { valor: plural(atrasados, 'atrasado', 'atrasados'), cor: 'atrasada' },
        { valor: `${INTEIRO.format(cartoes - atrasados)} no prazo`, cor: 'serie' },
        { valor: `${INTEIRO.format(semResponsavel)} sem responsável` },
      ],
    }}>
      <Valor valor={INTEIRO.format(atrasados)} detalhe={`${atrasados === 1 ? 'atrasado' : 'atrasados'} de ${INTEIRO.format(cartoes)}`} perigo={atrasados > 0} />
      {/* No prazo não é "feito": fica no azul da série (o verde é só de tarefa feita). */}
      <BarraSegmentada partes={[{ valor: atrasados, tom: 'atrasada' }, { valor: cartoes - atrasados, tom: 'serie' }]} />
      <Rodape>{semResponsavel ? `${plural(semResponsavel, 'cartão', 'cartões')} sem responsável` : 'Todos com responsável'}</Rodape>
    </Cartao>
  )
}

// Resolvida = feita ou não se aplica (as duas contam no %, como no resto do app); as que não se aplicam aparecem à parte
// no detalhe e na dica.
function Checklist({ checklist, podeAplicar, className, ...dica }) {
  if (!checklist) {
    return (
      <Cartao titulo="Check-list" icone={ClipboardList} tom="verde" className={className} {...dica} dica={{ titulo: 'Check-list', linhas: [{ valor: 'Nenhum modelo aplicado' }] }}>
        <Valor valor="—" mudo />
        <Rodape>Nenhum modelo aplicado</Rodape>
        {podeAplicar && <Rodape><IrPara aba="checkins">Aplicar modelo</IrPara></Rodape>}
      </Cartao>
    )
  }
  const { tarefas, feitas, nao_se_aplica: naoSeAplica = 0, atrasadas, proxima } = checklist
  const resolvidas = feitas + naoSeAplica
  return (
    <Cartao titulo="Check-list" icone={ClipboardList} tom="verde" className={className} {...dica} dica={{
      titulo: checklist.modelo_nome,
      linhas: [
        { valor: progressoEmPalavras(checklist), cor: 'feita' },
        { valor: plural(atrasadas, 'atrasada', 'atrasadas'), cor: 'atrasada' },
        ...(proxima ? [{ valor: diaMes(proxima.vence_em), rotulo: 'próxima tarefa' }] : []),
      ],
    }}>
      <Valor valor={formatarOcupacao(tarefas ? resolvidas / tarefas : 0)}
        detalhe={naoSeAplica ? `${INTEIRO.format(resolvidas)} de ${INTEIRO.format(tarefas)} resolvidas` : `${INTEIRO.format(feitas)} de ${INTEIRO.format(tarefas)} tarefas`} />
      {/* As cores e a ordem das etapas do check-list (feitas, não se aplicam, a fazer no prazo, atrasadas por último). */}
      <BarraSegmentada partes={[{ valor: feitas, tom: 'feita' }, { valor: naoSeAplica, tom: 'nsa' },
        { valor: tarefas - resolvidas - atrasadas, tom: 'neutro' }, { valor: atrasadas, tom: 'atrasada' }]} />
      <Rodape>
        {atrasadas
          ? <Badge variant="outline" className={SELO_PERIGO}><TriangleAlert aria-hidden="true" />{plural(atrasadas, 'atrasada', 'atrasadas')}</Badge>
          : <Badge variant="positive" className={SELO}><Check aria-hidden="true" />nada atrasado</Badge>}
        {proxima && <span className="tabular-nums">{`próxima ${diaMes(proxima.vence_em)}`}</span>}
        {naoSeAplica > 0 && <span>{naoSeAplicaEmPalavras(naoSeAplica)}</span>}
      </Rodape>
    </Cartao>
  )
}

// Faixa "Hoje" da aba Geral (design, "Faixa 'Hoje'"): 5 cartões com a situação de hoje, que não muda com o período do
// filtro (o título diz isso). `hoje` é o JSON de hoje_do_cliente (lido pela página, que passa as etapas para os gráficos); undefined =
// carregando; null = o banco não mostra (quem não vê o cliente), e a faixa não aparece. Cliente arquivado: só a linha "Arquivado em …". `podeAplicar`: a regra de quem aplica modelo (a Central e
// a gestão), para o link "Aplicar modelo".
export default function HojeDoCliente({ hoje, erro = false, atualizando = false, aoTentarDeNovo, podeAplicar = false }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const idDoTitulo = useId()
  const dia = hojeEmSP()
  const comDica = { mostrar, esconder }

  let conteudo
  if (erro) {
    conteudo = (
      <div role="alert" className="card flex flex-col items-start gap-3 p-4">
        <p className="text-corpo text-destructive">Não foi possível carregar a situação de hoje.</p>
        {aoTentarDeNovo && <Button type="button" variant="outline" size="sm" onClick={aoTentarDeNovo}><RotateCcw aria-hidden="true" /> Tentar de novo</Button>}
      </div>
    )
  } else if (hoje === null) {
    return null
  } else if (!hoje) {
    conteudo = <div className="card grid min-h-36 place-items-center"><GraficoCarregando texto="Carregando…" /></div>
  } else if (hoje.arquivado_em) {
    return <p className="card px-4 py-3 text-corpo text-muted-foreground">{`Arquivado em ${formatarDia(diaEmSP(hoje.arquivado_em))}.`}</p>
  } else {
    conteudo = (
      <div ref={contem} className={cn('grid grid-cols-2 gap-3 transition-opacity duration-200 md:grid-cols-3 xl:grid-cols-5', atualizando && 'opacity-60')}>
        <Previsao previsao={hoje.previsao} {...comDica} />
        <UltimoCheckin checkin={hoje.checkin} hoje={dia} {...comDica} />
        <Reuniao reuniao={hoje.reuniao} hoje={dia} {...comDica} />
        <Quadro quadro={hoje.quadro} {...comDica} />
        <Checklist checklist={hoje.checklist} podeAplicar={podeAplicar} className="max-md:col-span-2" {...comDica} />
        <Dica estado={dica} />
      </div>
    )
  }

  return (
    <section aria-labelledby={idDoTitulo} aria-describedby={`${idDoTitulo}-nota`} className="grid gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 id={idDoTitulo} className="section-label">Hoje</h2>
        <p id={`${idDoTitulo}-nota`} className="text-legenda text-muted-foreground">A situação de agora: não segue o período do filtro.</p>
      </div>
      {conteudo}
    </section>
  )
}
