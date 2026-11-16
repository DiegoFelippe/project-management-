import { useState } from 'react'
import { toast } from 'sonner'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import {
  ajustarPrevisao, apagarCliente, arquivarCliente, criarCliente, editarCliente, escolherConsultor,
  mandarParaConsultoria, reativarCliente,
} from '@/data/clientes'
import { limparPastaDoCliente } from '@/data/arquivos'
import { lancarHoras } from '@/data/checkins'
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
      // O cliente já era (só sai sem arquivos): a limpeza tira da pasta dele os objetos que ficaram sem linha. Se
      // não limpar, só avisa (a central pode tentar de novo).
      const limpeza = await limparPastaDoCliente(cliente.id).catch(() => ({ erro: true }))
      if (limpeza.erro) {
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

  async function mandar(cliente, consultoriaId, consultoria) {
    const resposta = await mandarParaConsultoria(cliente.id, consultoriaId)
    if (!resposta.erro) {
      toast.success(`Cliente ${cliente.nome} ${cliente.consultoria ? 'movido' : 'enviado'} para ${consultoria.nome}.`)
      recarregar()
    }
    return resposta
  }

  async function escolher(cliente, consultorId, pessoa) {
    const resposta = await escolherConsultor(cliente.id, consultorId)
    if (!resposta.erro) {
      toast.success(`${pessoa.nome} é o consultor de ${cliente.nome}.`)
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
          descricao="O cliente some de vez. Só dá para apagar cliente sem horas nem arquivos registrados; se tiver, arquive em vez de apagar."
          rotuloConfirmar="Apagar cliente" aoConfirmar={() => apagar(apagando)} />
      )}
    </>
  )

  return { abrir, janelas }
}
