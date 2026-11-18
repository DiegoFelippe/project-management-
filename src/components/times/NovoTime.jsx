import { UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { buscarComoOpcoes } from '@/components/campos/opcoesDePessoa'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Gestor cria o time dele; o administrador escolhe quem é o gestor. `buscarGestores(termo)` busca no banco
// ({ itens: [pessoa], total }): a lista de gestores nunca vem inteira.
export default function NovoTime({ aberto, aoFechar, papelDeQuemCria, buscarGestores, aoCriar }) {
  const buscarOpcoes = useMemo(() => (buscarGestores ? buscarComoOpcoes(buscarGestores) : undefined), [buscarGestores])
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gestorId, setGestorId] = useState('')
  const [erroNome, setErroNome] = useState(null)
  // Deu certo: limpa para o próximo (quem chama fecha a janela).
  const { erro, setErro, enviando, enviar } = useEnvio(limpar)
  const escolheGestor = papelDeQuemCria === 'admin'

  function limpar() {
    setNome('')
    setDescricao('')
    setGestorId('')
    setErroNome(null)
    setErro(null)
  }

  async function criar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErroNome('Use pelo menos 2 caracteres.')
    setErroNome(null)
    if (escolheGestor && !gestorId) return setErro('Escolha o gestor do time.')
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (escolheGestor) dados.gestorId = gestorId
    await enviar(() => aoCriar(dados))
  }

  function cancelar() {
    limpar()
    aoFechar()
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={cancelar} titulo="Novo time" icone={UsersRound} enviando={enviando}
      descricao={escolheGestor ? 'Dê um nome ao time e escolha quem é o gestor.' : 'Você será o gestor deste time.'}
      form="form-novo-time" rotuloEnviar="Criar time" rotuloEnviando="Criando…">
      <form id="form-novo-time" noValidate onSubmit={criar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="nome-time">Nome do time</Label>
          <Input id="nome-time" maxLength={80} aria-invalid={erroNome ? true : undefined} className="h-10"
            value={nome} onChange={(e) => setNome(e.target.value)} />
          {erroNome && <p className="text-rotulo text-destructive">{erroNome}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="descricao-time">Descrição (opcional)</Label>
          <Textarea id="descricao-time" maxLength={500} rows={2}
            value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {escolheGestor && (
          <div className="grid gap-2">
            <Label htmlFor="gestor-time">Gestor do time</Label>
            <Seletor id="gestor-time" valor={gestorId} aoMudar={setGestorId} buscar={buscarOpcoes} placeholder="Escolha…" />
          </div>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
