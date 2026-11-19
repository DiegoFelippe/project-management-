import { useState } from 'react'
import { toast } from 'sonner'
import { avisar } from '@/components/comum/avisar'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import {
  ajustarPrevisao, apagarCliente, arquivarCliente, criarCliente, desfazerEnvio, desfazerEscolha, editarCliente,
  escolherConsultor, mandarParaConsultoria, reativarCliente,
} from '@/data/clientes'
import { limparPastaDoCliente } from '@/data/arquivos'
import { lancarHoras } from '@/data/checkins'
import { limparQuadroDoCliente } from '@/data/quadro'
import { avisarQueOCheckinMudou } from '@/lib/checkinMudou'
import FormularioCliente from './FormularioCliente'
import JanelaCheckin from './JanelaCheckin'
import JanelaConsultor from './JanelaConsultor'
import JanelaMandar from './JanelaMandar'
import JanelaPrevisao from './JanelaPrevisao'

// Estado, ações e janelas dos clientes, compartilhados pela lista e pela página do cliente.
// aoMudar() recarrega a tela depois de uma escrita; aoApagar(cliente) roda depois de apagar (a página volta à lista).
export function useAcoesDoCliente({ aoMudar, aoApagar }) {
  const recarregar = aoMudar
  const [formulario, setFormulario] = useState(null) // { cliente? }
  const [arquivando, setArquivando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const [mandando, setMandando] = useState(null)
  const [escolhendo, setEscolhendo] = useState(null)
  const [ajustando, setAjustando] = useState(null)
  const [lancando, setLancando] = useState(null)

  async function salvar(cliente, dados) {
    const resposta = cliente ? await editarCliente(cliente.id, dados) : await criarCliente(dados)
    if (!resposta.erro) {
      toast.success(cliente ? `Cliente ${dados.nome} atualizado.` : `Cliente ${dados.nome} criado.`)
      recarregar()
    }
    return resposta
  }

  async function arquivarOuReativar(cliente) {
    const resposta = cliente.arquivado ? await reativarCliente(cliente.id) : await arquivarCliente(cliente.id)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} ${cliente.arquivado ? 'reativado' : 'arquivado'}.`)
      recarregar()
    }
    return resposta
  }

  async function apagar(cliente) {
    const resposta = await apagarCliente(cliente.id)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} apagado.`)
      // O cliente já era (só sai sem arquivos nem cartões): a limpeza tira da pasta dele os objetos que ficaram sem
      // linha, nos arquivos e no quadro (anexos e imagens de cartões apagados antes). Se não limpar, só avisa (a central
      // pode tentar de novo).
      const limpeza = await limparPastaDoCliente(cliente.id).catch(() => ({ erro: true }))
      const limpezaDoQuadro = await limparQuadroDoCliente(cliente.id).catch(() => ({ erro: true }))
      if (limpeza.erro || limpezaDoQuadro.erro) {
        toast.warning('O cliente foi apagado, mas alguns arquivos não saíram do armazenamento. Avise o suporte.')
      }
      if (aoApagar) aoApagar(cliente)
      else recarregar()
    }
    return resposta
  }

  function abrir(acao, cliente) {
    if (acao === 'formulario') setFormulario({ cliente })
    else if (acao === 'arquivar') setArquivando(cliente)
    else if (acao === 'reativar') arquivarOuReativar(cliente)
    else if (acao === 'apagar') setApagando(cliente)
    else if (acao === 'mandar') setMandando(cliente)
    else if (acao === 'consultor') setEscolhendo(cliente)
    else if (acao === 'previsao') setAjustando(cliente)
    else if (acao === 'lancar') setLancando(cliente)
  }

  async function lancar(cliente, dados) {
    const resposta = await lancarHoras({ clienteId: cliente.id, ...dados })
    if (!resposta.erro) {
      toast.success(`Horas lançadas em ${cliente.nome}.`)
      recarregar()
    }
    return resposta
  }

  // "Desfazer" dos avisos de Mandar e Escolher consultor (usabilidade, U3). Só onde dá para voltar ao estado anterior:
  // enviar da central (volta à Central) e escolher o primeiro consultor (volta a aguardar). O banco volta só se o cliente
  // ainda está como a ação deixou (desfazer_envio e desfazer_escolha); se alguém mexeu nele nos 10 s do aviso (a
  // consultoria escolheu o consultor, por exemplo), recusa sem mudar nada e a tela relê. Mover e trocar ficam só com "Ver
  // cliente": mover tira o consultor e encerra o check-list e o check-in aberto; trocar fecha o check-in aberto e recomeça
  // o "consultor desde". Voltar não devolve nada disso.
  async function desfazer(escrita, aviso) {
    const { erro } = await escrita()
    if (erro) toast.error(erro)
    else toast.success(aviso)
    recarregar()
  }
  const verCliente = (cliente) => ({ rotulo: 'Ver cliente', para: `/clientes/${cliente.id}` })

  async function mandar(cliente, consultoriaId, consultoria) {
    const resposta = await mandarParaConsultoria(cliente.id, consultoriaId)
    if (!resposta.erro) {
      const voltar = { rotulo: 'Desfazer', aoClicar: () => desfazer(() => desfazerEnvio(cliente.id, consultoriaId), `Cliente ${cliente.nome} voltou para a Central.`) }
      avisar(`Cliente ${cliente.nome} ${cliente.consultoria_id ? 'movido' : 'enviado'} para ${consultoria.nome}.`,
        { acoes: cliente.consultoria_id ? [verCliente(cliente)] : [voltar, verCliente(cliente)] })
      recarregar()
    }
    return resposta
  }

  async function escolher(cliente, consultorId, pessoa) {
    const resposta = await escolherConsultor(cliente.id, consultorId)
    if (!resposta.erro) {
      const voltar = { rotulo: 'Desfazer', aoClicar: () => desfazer(() => desfazerEscolha(cliente.id, consultorId), `${cliente.nome} voltou a aguardar consultor.`) }
      avisar(`${pessoa.nome} é o consultor de ${cliente.nome}.`,
        { acoes: cliente.consultor_id ? [verCliente(cliente)] : [voltar, verCliente(cliente)] })
      // Trocar fecha o check-in aberto do consultor anterior no cliente, que pode ser o de quem trocou (o selo relê).
      if (cliente.consultor_id) avisarQueOCheckinMudou()
      recarregar()
    }
    return resposta
  }

  async function ajustar(cliente, horas) {
    const resposta = await ajustarPrevisao(cliente.id, horas)
    if (!resposta.erro) {
      toast.success(`Previsão de ${cliente.nome} ajustada.`)
      recarregar()
    }
    return resposta
  }

  const janelas = (
    <>
      {formulario && (
        <FormularioCliente key={formulario.cliente?.id ?? 'novo'} aberto cliente={formulario.cliente}
          aoFechar={() => setFormulario(null)} aoSalvar={(dados) => salvar(formulario.cliente, dados)} />
      )}
      {mandando && (
        <JanelaMandar key={mandando.id} aberto cliente={mandando} aoFechar={() => setMandando(null)}
          aoMandar={(id, item) => mandar(mandando, id, item)} />
      )}
      {escolhendo && (
        <JanelaConsultor key={escolhendo.id} aberto cliente={escolhendo} aoFechar={() => setEscolhendo(null)}
          aoEscolher={(id, item) => escolher(escolhendo, id, item)} />
      )}
      {ajustando && (
        <JanelaPrevisao key={ajustando.id} aberto cliente={ajustando} aoFechar={() => setAjustando(null)}
          aoSalvar={(horas) => ajustar(ajustando, horas)} />
      )}
      {lancando && (
        <JanelaCheckin key={lancando.id} aberto modo="lancar" nomeDoCliente={lancando.nome} aoFechar={() => setLancando(null)}
          aoSalvar={(dados) => lancar(lancando, dados)} />
      )}
      {arquivando && (
        <ConfirmarAcao aberto aoFechar={() => setArquivando(null)} titulo={`Arquivar o cliente ${arquivando.nome}?`}
          descricao="O cliente sai das listas de trabalho e o check-in aberto é encerrado. As horas registradas ficam. Dá para reativar depois."
          rotuloConfirmar="Arquivar cliente" perigo={false} aoConfirmar={() => arquivarOuReativar(arquivando)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o cliente ${apagando.nome}?`}
          descricao="O cliente some de vez. Só dá para apagar cliente sem horas, arquivos nem cartões registrados; se tiver, arquive em vez de apagar."
          rotuloConfirmar="Apagar cliente" aoConfirmar={() => apagar(apagando)} />
      )}
    </>
  )

  return { abrir, janelas }
}
