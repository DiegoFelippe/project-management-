import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoData from '@/components/campos/CampoData'
import CampoHora from '@/components/campos/CampoHora'
import TarefasMarcadas from '@/components/checkins/TarefasMarcadas'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Textarea } from '@/components/ui/textarea'
import { tarefasDoCheckin } from '@/data/checkins'
import { somarDias } from '@/lib/calendario'
import { CHECKIN_DE_MAIS_DE_24H } from '@/lib/erros'
import { formatarDuracao, horasEntre } from '@/lib/horas'
import { cn } from '@/lib/utils'

const MAXIMO_DE_HORAS = 24
const dois = (n) => String(n).padStart(2, '0')
// Data e hora no horário local do navegador (o da equipe), nos formatos dos campos nativos.
const dataLocal = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
const horaLocal = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`

// Fim para fechar um check-in aberto: agora ou, se o check-out ficou esquecido, início + 24 h (o máximo).
const fimSugerido = (inicio) => new Date(Math.min(Date.now(), inicio.getTime() + MAXIMO_DE_HORAS * 3_600_000))

// Valores dos campos ao abrir. Check-in aberto (check-out ou Editar) já vem com o fim sugerido. Lançar horas começa em
// hoje (usabilidade, U8), com o fim no mesmo dia.
function camposIniciais(checkin) {
  const inicio = checkin?.inicio ? new Date(checkin.inicio) : null
  const fim = checkin?.fim ? new Date(checkin.fim) : inicio ? fimSugerido(inicio) : null
  const hoje = dataLocal(new Date())
  return {
    data: inicio ? dataLocal(inicio) : hoje,
    inicio: inicio ? horaLocal(inicio) : '',
    dataFim: fim ? dataLocal(fim) : hoje,
    fim: fim ? horaLocal(fim) : '',
  }
}

// Atalhos da data do Lançar horas, como o "Hoje / Amanhã" do evento: horas esquecidas quase sempre são de hoje ou de ontem.
function atalhosDaData() {
  const agora = new Date()
  return [
    { rotulo: 'Hoje', dia: dataLocal(agora) },
    { rotulo: 'Ontem', dia: dataLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1)) },
  ]
}

// Os erros do check-in, todos de uma vez, cada um no seu campo (usabilidade, U2). As contas entre o início e o fim só
// valem com os dois horários; o erro delas vai para o Fim.
function errosDoCheckin({ checkout, data, inicio, diaDoFim, comDataDoFim, fim, de, ate, descricao }) {
  const erros = {}
  if (!checkout && !data) erros.data = 'Informe a data.'
  if (!checkout && !inicio) erros.inicio = 'Informe o início.'
  if (comDataDoFim && !diaDoFim) erros.dataFim = 'Informe a data do fim.'
  if (!fim) erros.fim = checkout ? 'Informe a hora do fim.' : 'Informe o fim.'
  if (Object.keys(erros).length === 0) {
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) erros.fim = 'Informe a data, o início e o fim.'
    else if (ate <= de) erros.fim = 'O fim precisa ser depois do início.'
    else if (ate > new Date()) erros.fim = 'O horário não pode estar no futuro.'
    else if (horasEntre(de, ate) > MAXIMO_DE_HORAS) erros.fim = CHECKIN_DE_MAIS_DE_24H
  }
  // O banco pede pelo menos 2 caracteres no que foi feito de um check-in fechado.
  if (descricao.trim().length < 2) erros.descricao = 'Conte o que foi feito.'
  return erros
}

const TEXTOS = {
  checkout: { titulo: 'Fazer check-out em', botao: 'Fazer check-out', descricao: 'Confira o fim e conte o que foi feito neste atendimento.' },
  lancar: { titulo: 'Lançar horas em', botao: 'Lançar horas', descricao: 'Registre um atendimento que já aconteceu.' },
  editar: { titulo: 'Editar check-in em', botao: 'Salvar', descricao: 'Corrija o horário ou o que foi feito.' },
}

const TITULO_DAS_TAREFAS = 'Tarefas marcadas nesta sessão'

// "Tarefas concluídas: A; B. Não se aplica: C (motivo); D (motivo)." — o começo do "O que foi feito" no check-out (cada
// parte só quando tem tarefa). O "O que foi feito" vai até 2.000 letras: se os motivos inteiros passarem de 1.500 (sobra
// espaço para a pessoa completar), cada um entra cortado em 100 letras; o motivo inteiro fica na tarefa e no Histórico.
const LIMITE_DO_TEXTO = 1500
const MOTIVO_CURTO = 100
const cortarMotivo = (motivo) => (motivo.length > MOTIVO_CURTO ? `${motivo.slice(0, MOTIVO_CURTO - 1).trimEnd()}…` : motivo)
function textoDasTarefas(tarefas, cortar = false) {
  const feitas = tarefas.filter((t) => t.estado !== 'nao_se_aplica')
  const naoSeAplica = tarefas.filter((t) => t.estado === 'nao_se_aplica')
  const partes = []
  if (feitas.length) partes.push(`Tarefas concluídas: ${feitas.map((t) => t.titulo).join('; ')}.`)
  if (naoSeAplica.length) {
    // Sem o ponto final do motivo, para não ficar "(motivo.)."
    const motivo = (t) => {
      const texto = (t.motivo ?? '').trim().replace(/\.+$/, '')
      return cortar ? cortarMotivo(texto) : texto
    }
    partes.push(`Não se aplica: ${naoSeAplica.map((t) => `${t.titulo} (${motivo(t)})`).join('; ')}.`)
  }
  const texto = partes.join(' ')
  return !cortar && texto.length > LIMITE_DO_TEXTO ? textoDasTarefas(tarefas, true) : texto
}
const COMECOS_DO_TEXTO = ['Tarefas concluídas:', 'Não se aplica:']

// Janela do check-in. modo: "checkout" (fim e o que foi feito), "lancar" (período passado) ou "editar"
// (inclusive o check-in aberto, que fecha com o fim informado).
// No check-out e no Editar, lê as tarefas do check-list marcadas no check-in (tarefasDoCheckin) e mostra "Tarefas
// marcadas nesta sessão" (só para ler); no check-out com "O que foi feito" vazio, ele já vem com "Tarefas concluídas: A;
// B." e "Não se aplica: C (motivo)." (o que a pessoa já digitou nunca é apagado). Lançar horas não tem tarefas.
// aoSalvar recebe { descricao } e, em ISO, só os horários que valem gravar: no check-out e no check-in
// aberto o fim; nos outros, o início e o fim que a pessoa mudou (sem mexer, ficam os guardados, com os
// segundos). Devolve { erro }.
// Lançar horas (U8): a data começa em hoje, com os atalhos "Hoje / Ontem", e a duração aparece ao lado do Fim. Os erros
// ficam embaixo de cada campo, todos de uma vez, e fechar com algo digitado pergunta antes (U2 e U4; o texto que vem
// pronto das tarefas não conta como digitado).
export default function JanelaCheckin({ aberto, modo, nomeDoCliente, checkin, aoFechar, aoSalvar }) {
  const [iniciais] = useState(() => camposIniciais(checkin))
  const [atalhos] = useState(atalhosDaData)
  const [data, setData] = useState(iniciais.data)
  const [inicio, setInicio] = useState(iniciais.inicio)
  const [dataFim, setDataFim] = useState(iniciais.dataFim)
  const [fim, setFim] = useState(iniciais.fim)
  const [descricao, setDescricao] = useState(checkin?.descricao ?? '')
  // O "O que foi feito" como abriu (ou como veio pronto das tarefas, no check-out): o que muda dali é da pessoa.
  const [descricaoDeBase, setDescricaoDeBase] = useState(checkin?.descricao ?? '')
  const checkout = modo === 'checkout'
  const lancar = modo === 'lancar'
  const fechando = Boolean(checkin?.inicio && !checkin?.fim)
  // Data do fim: sempre no check-out; nos outros, quando o check-in atravessa a meia-noite.
  const comDataDoFim = checkout || iniciais.dataFim !== iniciais.data
  // Lançar horas sem Data do fim (revisão do lote F): um fim antes do início é do dia seguinte, como num ponto (Ontem
  // 23:00 → 01:00 = 2 h). Mostrar a Data do fim aqui obrigaria a acertar duas datas a cada "Ontem", e quase todo
  // atendimento acaba no mesmo dia; a Duração ao lado do Fim diz que passou da meia-noite.
  const viraODia = lancar && Boolean(data && inicio && fim) && fim < inicio
  const diaDoFim = comDataDoFim ? dataFim : viraODia ? somarDias(data, 1) : data
  const mudouInicio = data !== iniciais.data || inicio !== iniciais.inicio
  const mudouFim = diaDoFim !== iniciais.dataFim || fim !== iniciais.fim
  // O que vai ao banco: o início e o fim que a pessoa mudou (sem mexer, ficam os guardados, com os segundos).
  const de = mudouInicio ? new Date(`${data}T${inicio}`) : new Date(checkin?.inicio)
  const ate = mudouFim ? new Date(`${diaDoFim}T${fim}`) : checkin?.fim ? new Date(checkin.fim) : fimSugerido(de)
  // Depois do primeiro Salvar, os erros acompanham a tela (corrigiu, a marca some).
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => errosDoCheckin({ checkout, data, inicio, diaDoFim, comDataDoFim, fim, de, ate, descricao }),
  })
  const textos = TEXTOS[modo]
  const [tarefas, setTarefas] = useState({ itens: [] })
  const idDoCheckin = modo === 'lancar' ? null : checkin?.id

  useEffect(() => {
    if (!idDoCheckin) return undefined
    let ativo = true
    Promise.resolve()
      .then(() => tarefasDoCheckin(idDoCheckin))
      .then((lista) => {
        if (!ativo) return
        const itens = lista ?? []
        setTarefas({ itens })
        if (checkout && itens.length) {
          setDescricao((atual) => {
            if (atual.trim()) return atual
            const texto = textoDasTarefas(itens)
            setDescricaoDeBase(texto)
            return texto
          })
        }
      })
      .catch(() => ativo && setTarefas({ itens: [], erro: true }))
    return () => {
      ativo = false
    }
  }, [idDoCheckin, checkout])

  const alterado = mudouInicio || mudouFim || descricao !== descricaoDeBase
  // A duração calculada, ao lado do Fim (U8): só com os dois horários e o fim depois do início.
  const duracao = (() => {
    if (!data || !inicio || !diaDoFim || !fim) return null
    const ms = new Date(`${diaDoFim}T${fim}`) - new Date(`${data}T${inicio}`)
    return ms > 0 ? formatarDuracao(ms) : null
  })()

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir()) return

    const dados = { descricao: descricao.trim() }
    if (mudouInicio) dados.inicio = de.toISOString()
    if (mudouFim || fechando) dados.fim = ate.toISOString()
    await enviar(() => aoSalvar(dados))
  }

  const campoDataDoFim = (
    <Campo id="checkin-data-fim" rotulo="Data do fim" erro={erros.dataFim}>
      <CampoData id="checkin-data-fim" valor={dataFim} aoMudar={setDataFim} obrigatorio />
    </Campo>
  )
  const campoFim = (
    <Campo id="checkin-fim" rotulo="Fim" erro={erros.fim} dica={duracao && !checkout ? <span className="tabular-nums">Duração: {duracao}{viraODia && ', termina no dia seguinte'}</span> : undefined}>
      <CampoHora id="checkin-fim" valor={fim} aoMudar={setFim} obrigatorio />
    </Campo>
  )

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`${textos.titulo} ${nomeDoCliente}`} icone={Clock} largura="lg" enviando={enviando}
      descricao={modo === 'editar' && fechando ? 'Informe o fim e o que foi feito para fechar o check-in.' : textos.descricao}
      tentativa={tentativa} alterado={alterado} form="form-checkin" rotuloEnviar={textos.botao}>
      <form id="form-checkin" noValidate onSubmit={salvar} className="space-y-5">
        {lancar && (
          // No toque, 44 px e 8 px entre os atalhos (auditoria, G5), como os do evento.
          <div role="group" aria-label="Atalhos da data" className="flex flex-wrap gap-1 pointer-coarse:gap-2">
            {atalhos.map((a) => (
              <button key={a.rotulo} type="button" aria-pressed={data === a.dia} onClick={() => setData(a.dia)}
                className={cn('botao-animado rounded-md px-2 py-1 text-legenda font-medium transition-[background-color,color,translate,scale] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] pointer-coarse:min-h-11 pointer-coarse:px-3',
                  data === a.dia ? 'bg-primary-cheio text-primary-foreground' : 'bg-primary/10 text-primary-texto hover:bg-primary/15')}>
                {a.rotulo}
              </button>
            ))}
          </div>
        )}
        {checkout ? (
          <div className="grid grid-cols-2 items-start gap-3">
            {campoDataDoFim}
            {campoFim}
          </div>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
            <Campo id="checkin-data" rotulo="Data" erro={erros.data} className="col-span-2 sm:col-span-1">
              <CampoData id="checkin-data" valor={data} aoMudar={setData} obrigatorio />
            </Campo>
            <Campo id="checkin-inicio" rotulo="Início" erro={erros.inicio}>
              <CampoHora id="checkin-inicio" valor={inicio} aoMudar={setInicio} obrigatorio />
            </Campo>
            {campoFim}
            {comDataDoFim && <div className="col-span-2 sm:col-span-3">{campoDataDoFim}</div>}
          </div>
        )}
        {tarefas.itens.length > 0 && (
          <div className="grid gap-2">
            <p className="text-foreground/80 text-rotulo font-medium">{TITULO_DAS_TAREFAS}</p>
            <TarefasMarcadas tarefas={tarefas.itens} rotulo={TITULO_DAS_TAREFAS} />
          </div>
        )}
        {tarefas.erro && <p className="text-muted-foreground text-legenda">Não foi possível carregar as tarefas marcadas nesta sessão.</p>}
        <Campo id="checkin-descricao" rotulo="O que foi feito" erro={erros.descricao}
          dica={checkout && COMECOS_DO_TEXTO.some((comeco) => descricao.startsWith(comeco)) ? 'Já vem com as tarefas marcadas; complete com o que mais foi feito.' : undefined}>
          <Textarea id="checkin-descricao" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
