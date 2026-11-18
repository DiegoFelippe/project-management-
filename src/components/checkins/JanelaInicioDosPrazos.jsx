import { useState } from 'react'
import { CalendarCog } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoData from '@/components/campos/CampoData'
import JanelaFormulario, { CartaoDaSecao } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
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
// `proximaId`: a próxima tarefa (a do resumo), para a prévia. O erro fica embaixo do campo, e fechar com a data mudada
// pergunta antes (usabilidade, U2 e U4).
export default function JanelaInicioDosPrazos({ checklist, tarefas, proximaId, aoFechar, aoSalvar }) {
  const [inicio, setInicio] = useState(checklist.inicio)
  const { erro, erros, conferir, enviando, enviar } = useEnvio()
  const proxima = tarefas.find((t) => t.id === proximaId)

  async function salvar(e) {
    e.preventDefault()
    if (!conferir(inicio ? {} : { inicio: 'Escolha o início dos prazos.' })) return
    if (inicio === checklist.inicio) return aoFechar()
    await enviar(async () => {
      const resposta = await mudarInicio(checklist.id, inicio)
      if (resposta.erro) return resposta
      aoSalvar(inicio)
      aoFechar()
      return { erro: null }
    })
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo="Mudar o início dos prazos" icone={CalendarCog} enviando={enviando}
      descricao="Os prazos das tarefas contam em dias corridos a partir desta data." erros={erros} alterado={inicio !== checklist.inicio}
      form="form-inicio-dos-prazos" rotuloEnviar="Salvar">
      <form id="form-inicio-dos-prazos" noValidate onSubmit={salvar} className="space-y-5">
        <Campo id="inicio-dos-prazos" rotulo="Início dos prazos" erro={erros.inicio}>
          <CampoData id="inicio-dos-prazos" valor={inicio} aoMudar={setInicio} obrigatorio />
        </Campo>
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
