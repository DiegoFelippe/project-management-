import { useState } from 'react'
import { Clock } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoData from '@/components/campos/CampoData'
import CampoHora from '@/components/campos/CampoHora'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CHECKIN_DE_MAIS_DE_24H } from '@/lib/erros'
import { horasEntre } from '@/lib/horas'

const MAXIMO_DE_HORAS = 24
const dois = (n) => String(n).padStart(2, '0')
// Data e hora no horário local do navegador (o da equipe), nos formatos dos campos nativos.
const dataLocal = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
const horaLocal = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`

// Fim para fechar um check-in aberto: agora ou, se o check-out ficou esquecido, início + 24 h (o máximo).
const fimSugerido = (inicio) => new Date(Math.min(Date.now(), inicio.getTime() + MAXIMO_DE_HORAS * 3_600_000))

// Valores dos campos ao abrir. Check-in aberto (check-out ou Editar) já vem com o fim sugerido.
function camposIniciais(checkin) {
  const inicio = checkin?.inicio ? new Date(checkin.inicio) : null
  const fim = checkin?.fim ? new Date(checkin.fim) : inicio ? fimSugerido(inicio) : null
  return {
    data: inicio ? dataLocal(inicio) : '',
    inicio: inicio ? horaLocal(inicio) : '',
    dataFim: fim ? dataLocal(fim) : '',
    fim: fim ? horaLocal(fim) : '',
  }
}

const TEXTOS = {
  checkout: { titulo: 'Fazer check-out em', botao: 'Fazer check-out', descricao: 'Confira o fim e conte o que foi feito neste atendimento.' },
  lancar: { titulo: 'Lançar horas em', botao: 'Lançar horas', descricao: 'Registre um atendimento que já aconteceu.' },
  editar: { titulo: 'Editar check-in em', botao: 'Salvar', descricao: 'Corrija o horário ou o que foi feito.' },
}

// Janela do check-in. modo: "checkout" (fim e o que foi feito), "lancar" (período passado) ou "editar"
// (inclusive o check-in aberto, que fecha com o fim informado).
// aoSalvar recebe { descricao } e, em ISO, só os horários que valem gravar: no check-out e no check-in
// aberto o fim; nos outros, o início e o fim que a pessoa mudou (sem mexer, ficam os guardados, com os
// segundos). Devolve { erro }.
export default function JanelaCheckin({ aberto, modo, nomeDoCliente, checkin, aoFechar, aoSalvar }) {
  const [iniciais] = useState(() => camposIniciais(checkin))
  const [data, setData] = useState(iniciais.data)
  const [inicio, setInicio] = useState(iniciais.inicio)
  const [dataFim, setDataFim] = useState(iniciais.dataFim)
  const [fim, setFim] = useState(iniciais.fim)
  const [descricao, setDescricao] = useState(checkin?.descricao ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const checkout = modo === 'checkout'
  const fechando = Boolean(checkin?.inicio && !checkin?.fim)
  // Data do fim: sempre no check-out; nos outros, quando o check-in atravessa a meia-noite.
  const comDataDoFim = checkout || iniciais.dataFim !== iniciais.data
  const textos = TEXTOS[modo]

  async function salvar(evento) {
    evento.preventDefault()
    const diaDoFim = comDataDoFim ? dataFim : data
    if (!fim || !diaDoFim || (!checkout && (!data || !inicio))) {
      return setErro(checkout ? 'Informe a data e a hora do fim.' : 'Informe a data, o início e o fim.')
    }
    const mudouInicio = data !== iniciais.data || inicio !== iniciais.inicio
    const mudouFim = diaDoFim !== iniciais.dataFim || fim !== iniciais.fim
    const de = mudouInicio ? new Date(`${data}T${inicio}`) : new Date(checkin.inicio)
    const ate = mudouFim ? new Date(`${diaDoFim}T${fim}`) : checkin?.fim ? new Date(checkin.fim) : fimSugerido(de)
    if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return setErro('Informe a data, o início e o fim.')
    if (ate <= de) return setErro('O fim precisa ser depois do início.')
    if (ate > new Date()) return setErro('O horário não pode estar no futuro.')
    if (horasEntre(de, ate) > MAXIMO_DE_HORAS) return setErro(CHECKIN_DE_MAIS_DE_24H)
    // O banco pede pelo menos 2 caracteres no que foi feito de um check-in fechado.
    if (descricao.trim().length < 2) return setErro('Conte o que foi feito.')

    const dados = { descricao: descricao.trim() }
    if (mudouInicio) dados.inicio = de.toISOString()
    if (mudouFim || fechando) dados.fim = ate.toISOString()
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  const campoDataDoFim = (
    <div className="grid gap-2">
      <Label htmlFor="checkin-data-fim">Data do fim</Label>
      <CampoData id="checkin-data-fim" valor={dataFim} aoMudar={setDataFim} obrigatorio />
    </div>
  )
  const campoFim = (
    <div className="grid gap-2">
      <Label htmlFor="checkin-fim">Fim</Label>
      <CampoHora id="checkin-fim" valor={fim} aoMudar={setFim} obrigatorio />
    </div>
  )

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`${textos.titulo} ${nomeDoCliente}`} icone={Clock} largura="lg" enviando={enviando}
      descricao={modo === 'editar' && fechando ? 'Informe o fim e o que foi feito para fechar o check-in.' : textos.descricao}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-checkin" disabled={enviando}>{enviando ? 'Salvando…' : textos.botao}</Button>
        </>
      )}>
      <form id="form-checkin" noValidate onSubmit={salvar} className="space-y-5">
        {checkout ? (
          <div className="grid grid-cols-2 gap-3">
            {campoDataDoFim}
            {campoFim}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 grid gap-2 sm:col-span-1">
              <Label htmlFor="checkin-data">Data</Label>
              <CampoData id="checkin-data" valor={data} aoMudar={setData} obrigatorio />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="checkin-inicio">Início</Label>
              <CampoHora id="checkin-inicio" valor={inicio} aoMudar={setInicio} obrigatorio />
            </div>
            {campoFim}
            {comDataDoFim && <div className="col-span-3">{campoDataDoFim}</div>}
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="checkin-descricao">O que foi feito</Label>
          <textarea id="checkin-descricao" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)}
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none hover:border-primary/40 focus-visible:ring-4" />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
