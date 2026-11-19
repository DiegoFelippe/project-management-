import { useCallback, useState } from 'react'
import { ListChecks, TriangleAlert } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoData from '@/components/campos/CampoData'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario, { BotaoCancelar, CartaoDaSecao } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Button } from '@/components/ui/button'
import { aplicarModelo, modelosParaAplicar } from '@/data/checklists'
import { somarDias } from '@/lib/calendario'
import { formatarDia, hoje } from '@/lib/mes'
import { plural } from '@/lib/nomes'
import { progressoEmPalavras } from './situacao'

// A linha de baixo de cada modelo na lista: tamanho, de onde vem e se é o atual ou do tipo do consultor.
function detalheDoModelo(m, atualId) {
  const partes = [plural(m.etapas, 'etapa', 'etapas'), plural(m.tarefas, 'tarefa', 'tarefas')]
  if (m.id === atualId) partes.push('atual')
  if (m.do_tipo_do_consultor) partes.push('do tipo do consultor')
  else if (m.da_central) partes.push('da Central')
  return partes.join(' · ')
}

// Aplicar (ou trocar) o modelo de check-in no cliente — da aba Check-ins do cliente e do Andamento. O Modelo vem do banco
// por busca (os do tipo de consultoria do consultor do cliente primeiro); Início dos prazos começa hoje (São Paulo); a
// prévia diz quantas tarefas e quando vence a última. Com `checklist` (o ativo: { modelo_id, tarefas, feitas, intocado })
// é a troca: o aviso diz que o check-list atual é trocado e começa do zero (o intocado o banco apaga: usabilidade, U6).
// Grava com aplicarModelo; deu certo, chama `aoAplicar({ id, modelo, inicio })` e fecha. Os erros ficam embaixo de cada
// campo, de uma vez, e fechar com algo escolhido pergunta antes (usabilidade, U2 e U4).
export default function JanelaAplicarModelo({ cliente, checklist = null, aoFechar, aoAplicar }) {
  const [modelo, setModelo] = useState(null)
  const [inicioPadrao] = useState(() => hoje())
  const [inicio, setInicio] = useState(inicioPadrao)
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(undefined, { validar: errosDaAplicacao })
  const alterado = Boolean(modelo) || inicio !== inicioPadrao
  const trocando = Boolean(checklist)
  const atualId = checklist?.modelo_id

  const buscar = useCallback(async (termo) => {
    const { itens, total } = await modelosParaAplicar({ clienteId: cliente.id, busca: termo })
    return { itens: itens.map((m) => ({ valor: m.id, rotulo: m.nome, detalhe: detalheDoModelo(m, atualId), modelo: m })), total }
  }, [cliente.id, atualId])

  function errosDaAplicacao() {
    const achados = {}
    if (!modelo) achados.modelo = 'Escolha um modelo.'
    if (!inicio) achados.inicio = 'Escolha o início dos prazos.'
    return achados
  }

  async function aplicar(e) {
    e.preventDefault()
    if (!conferir()) return
    await enviar(async () => {
      const resposta = await aplicarModelo({ clienteId: cliente.id, modeloId: modelo.id, inicio })
      if (resposta.erro) return resposta
      aoAplicar({ id: resposta.id, modelo, inicio })
      aoFechar()
      return { erro: null }
    })
  }

  const previa = modelo && inicio
    ? `${plural(modelo.tarefas, 'tarefa', 'tarefas')} em ${plural(modelo.etapas, 'etapa', 'etapas')} · a última vence em ${formatarDia(somarDias(inicio, modelo.maior_prazo))} (dia ${modelo.maior_prazo})`
    : modelo ? 'Escolha o início dos prazos para ver a prévia.' : 'Escolha um modelo para ver a prévia.'
  const quemSegue = cliente.consultor?.nome ?? 'O consultor do cliente'
  const rotulo = trocando ? 'Trocar modelo' : 'Aplicar modelo'

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} icone={ListChecks} largura="lg" enviando={enviando} tentativa={tentativa} alterado={alterado}
      titulo={trocando ? `Trocar o modelo de ${cliente.nome}` : `Aplicar modelo em ${cliente.nome}`}
      descricao={`${quemSegue} vai seguir as tarefas como check-list. Aparecem os modelos que a consultoria do cliente pode usar.`}
      rodape={(
        <>
          <BotaoCancelar />
          <Button type="submit" form="form-aplicar-modelo" disabled={enviando}>
            {enviando ? 'Aplicando…' : <><ListChecks /> {rotulo}</>}
          </Button>
        </>
      )}>
      <form id="form-aplicar-modelo" noValidate onSubmit={aplicar} className="space-y-5">
        <Campo id="aplicar-modelo" rotulo="Modelo" erro={erros.modelo}>
          <Seletor id="aplicar-modelo" valor={modelo?.id ?? ''} aoMudar={(_valor, opcao) => setModelo(opcao.modelo)} buscar={buscar}
            opcoes={modelo ? [{ valor: modelo.id, rotulo: modelo.nome, detalhe: detalheDoModelo(modelo, atualId) }] : []}
            placeholder="Escolha um modelo" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="aplicar-inicio" rotulo="Início dos prazos" erro={erros.inicio} className="content-start"
            dica="O prazo de cada tarefa conta em dias corridos a partir desta data.">
            <CampoData id="aplicar-inicio" valor={inicio} aoMudar={setInicio} obrigatorio />
          </Campo>
          <CartaoDaSecao className="p-3">
            <p className="section-label">Prévia</p>
            <p className="text-corpo tabular-nums">{previa}</p>
          </CartaoDaSecao>
        </div>
        {trocando && (
          <p className="bg-notice-soft flex items-start gap-2 rounded-xl px-3 py-2 text-rotulo">
            <TriangleAlert className="text-notice mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {checklist.intocado
                ? 'Ninguém mexeu no check-list atual ainda: ele é apagado e o do modelo novo começa do zero.'
                : `O check-list atual (${progressoEmPalavras(checklist)}) é trocado pelo do modelo novo, começando do zero. `
                  + 'O que já foi feito continua nos check-ins e no Histórico.'}
            </span>
          </p>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
