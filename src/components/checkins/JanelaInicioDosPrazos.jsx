import { useState } from 'react'
import { CalendarCog } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoData from '@/components/campos/CampoData'
import JanelaFormulario, { CartaoDaSecao } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { mudarInicio } from '@/data/checklists'
import { somarDias } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'

// Como ficam as datas com o início escolhido: da primeira à última tarefa e a próxima pendente.
function previaDasDatas(inicio, tarefas, proxima) {
  if (!inicio) return 'Escolha uma data para ver como ficam os prazos.'
  if (!tarefas.length) return 'O check-list não tem tarefas.'
  const prazos = tarefas.map((t) => t.prazo_dias)
  const [menor, maior] = [Math.min(...prazos), Math.max(...prazos)]
  const data = (dias) => formatarDia(somarDias(inicio, dias))
  const faixa = `As tarefas vencem de ${data(menor)} (dia ${menor}) a ${data(maior)} (dia ${maior}).`
  return proxima ? `${faixa} A próxima, "${proxima.titulo}", vence em ${data(proxima.prazo_dias)}.` : faixa
}

// Início dos prazos do check-list do cliente (é o "editar" do check-list): CampoData com o início atual e a prévia das
// datas. Salvar grava com mudarInicio (o banco recalcula o vencimento de cada tarefa, sem mexer no que foi feito) e chama
// `aoSalvar(inicio)`; a mesma data só fecha. `checklist`: { id, inicio }; `tarefas`: as do check-list (prazo_dias);
// `proximaId`: a próxima tarefa (a do resumo), para a prévia.
export default function JanelaInicioDosPrazos({ checklist, tarefas, proximaId, aoFechar, aoSalvar }) {
  const [inicio, setInicio] = useState(checklist.inicio)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const proxima = tarefas.find((t) => t.id === proximaId)

  async function enviar(e) {
    e.preventDefault()
    if (!inicio) return setErro('Escolha o início dos prazos.')
    if (inicio === checklist.inicio) return aoFechar()
    setErro(null)
    setEnviando(true)
    const resposta = await mudarInicio(checklist.id, inicio)
    setEnviando(false)
    if (resposta.erro) return setErro(resposta.erro)
    aoSalvar(inicio)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Mudar o início dos prazos" icone={CalendarCog} enviando={enviando}
      descricao="Os prazos das tarefas contam em dias corridos a partir desta data."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-inicio-dos-prazos" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-inicio-dos-prazos" noValidate onSubmit={enviar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="inicio-dos-prazos">Início dos prazos</Label>
          <CampoData id="inicio-dos-prazos" valor={inicio} aoMudar={setInicio} obrigatorio />
        </div>
        <CartaoDaSecao className="p-3">
          <p className="section-label">Como ficam as datas</p>
          <p className="text-corpo">{previaDasDatas(inicio, tarefas, proxima)}</p>
          <p className="text-muted-foreground mt-1 text-legenda">O que já foi feito continua feito.</p>
        </CartaoDaSecao>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
