import { useCallback, useState } from 'react'
import { ListChecks, TriangleAlert } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoData from '@/components/campos/CampoData'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario, { CartaoDaSecao } from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { aplicarModelo, modelosParaAplicar } from '@/data/checklists'
import { somarDias } from '@/lib/calendario'
import { formatarDia, hoje } from '@/lib/mes'
import { plural } from '@/lib/nomes'

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
// prévia diz quantas tarefas e quando vence a última. Com `checklist` (o ativo: { modelo_id, tarefas, feitas }) é a
// troca: o aviso diz que o check-list atual é trocado e começa do zero. Grava com aplicarModelo; deu certo, chama
// `aoAplicar({ id, modelo, inicio })` e fecha.
export default function JanelaAplicarModelo({ cliente, checklist = null, aoFechar, aoAplicar }) {
  const [modelo, setModelo] = useState(null)
  const [inicio, setInicio] = useState(() => hoje())
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const trocando = Boolean(checklist)
  const atualId = checklist?.modelo_id

  const buscar = useCallback(async (termo) => {
    const { itens, total } = await modelosParaAplicar({ clienteId: cliente.id, busca: termo })
    return { itens: itens.map((m) => ({ valor: m.id, rotulo: m.nome, detalhe: detalheDoModelo(m, atualId), modelo: m })), total }
  }, [cliente.id, atualId])

  async function enviar(e) {
    e.preventDefault()
    if (!modelo) return setErro('Escolha um modelo.')
    if (!inicio) return setErro('Escolha o início dos prazos.')
    setErro(null)
    setEnviando(true)
    const resposta = await aplicarModelo({ clienteId: cliente.id, modeloId: modelo.id, inicio })
    setEnviando(false)
    if (resposta.erro) return setErro(resposta.erro)
    aoAplicar({ id: resposta.id, modelo, inicio })
    aoFechar()
  }

  const previa = modelo && inicio
    ? `${plural(modelo.tarefas, 'tarefa', 'tarefas')} em ${plural(modelo.etapas, 'etapa', 'etapas')} · a última vence em ${formatarDia(somarDias(inicio, modelo.maior_prazo))} (dia ${modelo.maior_prazo})`
    : modelo ? 'Escolha o início dos prazos para ver a prévia.' : 'Escolha um modelo para ver a prévia.'
  const quemSegue = cliente.consultor?.nome ?? 'O consultor do cliente'
  const rotulo = trocando ? 'Trocar modelo' : 'Aplicar modelo'

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} icone={ListChecks} largura="lg" enviando={enviando}
      titulo={trocando ? `Trocar o modelo de ${cliente.nome}` : `Aplicar modelo em ${cliente.nome}`}
      descricao={`${quemSegue} vai seguir as tarefas como check-list. Aparecem os modelos que a consultoria do cliente pode usar.`}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-aplicar-modelo" disabled={enviando}>
            {enviando ? 'Aplicando…' : <><ListChecks /> {rotulo}</>}
          </Button>
        </>
      )}>
      <form id="form-aplicar-modelo" noValidate onSubmit={enviar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="aplicar-modelo">Modelo</Label>
          <Seletor id="aplicar-modelo" valor={modelo?.id ?? ''} aoMudar={(_valor, opcao) => setModelo(opcao.modelo)} buscar={buscar}
            opcoes={modelo ? [{ valor: modelo.id, rotulo: modelo.nome, detalhe: detalheDoModelo(modelo, atualId) }] : []}
            placeholder="Escolha um modelo" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="aplicar-inicio">Início dos prazos</Label>
            <CampoData id="aplicar-inicio" valor={inicio} aoMudar={setInicio} obrigatorio />
            <p className="text-muted-foreground text-legenda">O prazo de cada tarefa conta em dias corridos a partir desta data.</p>
          </div>
          <CartaoDaSecao className="p-3">
            <p className="section-label">Prévia</p>
            <p className="text-corpo tabular-nums">{previa}</p>
          </CartaoDaSecao>
        </div>
        {trocando && (
          <p className="bg-notice-soft flex items-start gap-2 rounded-xl px-3 py-2 text-rotulo">
            <TriangleAlert className="text-notice mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              O check-list atual ({checklist.feitas} de {checklist.tarefas} feitas) é trocado pelo do modelo novo, começando do
              zero. O que já foi feito continua nos check-ins e no Histórico.
            </span>
          </p>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
