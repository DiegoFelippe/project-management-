import { UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { buscarComoOpcoes } from '@/components/campos/opcoesDePessoa'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Gestor cria o time dele; o administrador escolhe quem é o gestor. `buscarGestores(termo)` busca no banco
// ({ itens: [pessoa], total }): a lista de gestores nunca vem inteira.
export default function NovoTime({ aberto, aoFechar, papelDeQuemCria, buscarGestores, aoCriar }) {
  const buscarOpcoes = useMemo(() => (buscarGestores ? buscarComoOpcoes(buscarGestores) : undefined), [buscarGestores])
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [gestorId, setGestorId] = useState('')
  const [erroNome, setErroNome] = useState(null)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const escolheGestor = papelDeQuemCria === 'admin'

  function limpar() {
    setNome('')
    setDescricao('')
    setGestorId('')
    setErroNome(null)
    setErro(null)
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErroNome('Use pelo menos 2 caracteres.')
    setErroNome(null)
    if (escolheGestor && !gestorId) return setErro('Escolha o gestor do time.')
    setErro(null)
    setEnviando(true)
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (escolheGestor) dados.gestorId = gestorId
    const resposta = await aoCriar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    limpar()
  }

  function cancelar() {
    limpar()
    aoFechar()
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={cancelar} titulo="Novo time" icone={UsersRound} enviando={enviando}
      descricao={escolheGestor ? 'Dê um nome ao time e escolha quem é o gestor.' : 'Você será o gestor deste time.'}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={cancelar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-novo-time" disabled={enviando}>{enviando ? 'Criando…' : 'Criar time'}</Button>
        </>
      )}>
      <form id="form-novo-time" noValidate onSubmit={enviar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="nome-time">Nome do time</Label>
          <Input id="nome-time" maxLength={80} aria-invalid={erroNome ? true : undefined} className="h-10"
            value={nome} onChange={(e) => setNome(e.target.value)} />
          {erroNome && <p className="text-rotulo text-destructive">{erroNome}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="descricao-time">Descrição (opcional)</Label>
          <textarea id="descricao-time" maxLength={500} rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 texto-de-campo shadow-xs outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30"
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
