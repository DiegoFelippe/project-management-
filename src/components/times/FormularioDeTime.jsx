import { UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import { buscarComoOpcoes, comoOpcaoDePessoa } from '@/components/campos/opcoesDePessoa'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import EscolhaDePessoas from './EscolhaDePessoas'

// Novo time e Editar time num formulário só (auditoria, C4); com `time`, vem preenchido. Nome e descrição: o gestor do
// time e o administrador. O gestor só o administrador escolhe ou troca, numa busca no banco (`buscarGestores(termo)`
// devolve { itens: [pessoa], total }; o gestor de agora já vem na lista); o gestor que cria é o gestor do time. No Novo
// time, "Pessoas" (opcional) leva várias de uma vez (usabilidade, U7): `buscarPessoas(termo, excluirIds)` busca no banco
// as da consultoria, sem o gestor escolhido. `aoSalvar(dados)` devolve { erro } (a janela fica aberta) ou fecha.
// Os erros ficam embaixo de cada campo, todos de uma vez, e fechar com algo digitado pergunta antes (U2 e U4).
export default function FormularioDeTime({ time, papel, buscarGestores, buscarPessoas, aoFechar, aoSalvar }) {
  const novo = !time
  const escolheGestor = papel === 'admin'
  const opcoesDeGestor = useMemo(() => (buscarGestores ? buscarComoOpcoes(buscarGestores) : undefined), [buscarGestores])
  const gestor = time?.gestor
  const gestorAtual = useMemo(() => (gestor ? [comoOpcaoDePessoa(gestor)] : []), [gestor])
  const [nome, setNome] = useState(time?.nome ?? '')
  const [descricao, setDescricao] = useState(time?.descricao ?? '')
  const [gestorId, setGestorId] = useState(time?.gestor_id ?? '')
  const [pessoas, setPessoas] = useState([])
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, { validar: errosDoTime })
  const alterado = useAlterado({ nome, descricao, gestorId, pessoas: pessoas.map((p) => p.id) })
  const buscarDisponiveis = useCallback((termo) => buscarPessoas(termo, gestorId ? [gestorId] : []), [buscarPessoas, gestorId])

  function errosDoTime() {
    const achados = {}
    if (nome.trim().length < 2) achados.nome = 'Use pelo menos 2 caracteres.'
    if (novo && escolheGestor && !gestorId) achados.gestor = 'Escolha o gestor do time.'
    return achados
  }

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir()) return
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (escolheGestor) dados.gestorId = gestorId
    // Quem virou gestor não entra também como pessoa do time.
    if (novo) dados.pessoas = pessoas.filter((p) => p.id !== gestorId)
    await enviar(() => aoSalvar(dados))
  }

  const descricaoDaJanela = novo
    ? (escolheGestor ? 'Dê um nome ao time, escolha quem é o gestor e quem entra.' : 'Você será o gestor deste time. Já dá para escolher quem entra.')
    : (escolheGestor ? 'Nome, descrição e gestor do time.' : 'Nome e descrição do time.')

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={novo ? 'Novo time' : 'Editar time'} icone={UsersRound} enviando={enviando}
      descricao={descricaoDaJanela} tentativa={tentativa} alterado={alterado}
      form="form-do-time" rotuloEnviar={novo ? 'Criar time' : 'Salvar'} rotuloEnviando={novo ? 'Criando…' : 'Salvando…'}>
      <form id="form-do-time" noValidate onSubmit={salvar} className="space-y-5">
        <Campo id="time-nome" rotulo="Nome do time" erro={erros.nome}>
          <Input id="time-nome" maxLength={80} className="h-10" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo id="time-descricao" rotulo="Descrição (opcional)">
          <Textarea id="time-descricao" maxLength={500} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        {escolheGestor && (
          <Campo id="time-gestor" rotulo="Gestor do time" erro={erros.gestor}>
            <Seletor id="time-gestor" valor={gestorId} aoMudar={setGestorId} opcoes={gestorAtual} buscar={opcoesDeGestor} placeholder="Escolha…" />
          </Campo>
        )}
        {novo && buscarPessoas && (
          <Campo id="time-pessoas" rotulo="Pessoas (opcional)">
            <EscolhaDePessoas id="time-pessoas" escolhidas={pessoas} aoMudar={setPessoas} buscar={buscarDisponiveis} />
          </Campo>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
