import { UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { buscarComoOpcoes, comoOpcaoDePessoa } from '@/components/campos/opcoesDePessoa'
import Seletor from '@/components/campos/Seletor'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Editar time: nome e descrição (gestor do time e administrador); trocar o gestor só o administrador, escolhendo
// numa busca no banco (`buscarGestores(termo)` devolve { itens: [pessoa], total }); o gestor de agora já vem na lista.
export default function EditarTime({ aberto, aoFechar, time, papelDeQuemEdita, buscarGestores, aoSalvar }) {
  const buscarOpcoes = useMemo(() => (buscarGestores ? buscarComoOpcoes(buscarGestores) : undefined), [buscarGestores])
  const gestor = time?.gestor
  const gestorAtual = useMemo(() => (gestor ? [comoOpcaoDePessoa(gestor)] : []), [gestor])
  const [nome, setNome] = useState(time?.nome ?? '')
  const [descricao, setDescricao] = useState(time?.descricao ?? '')
  const [gestorId, setGestorId] = useState(time?.gestor_id ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const trocaGestor = papelDeQuemEdita === 'admin'

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres no nome.')
    setErro(null)
    setEnviando(true)
    const dados = { nome: nome.trim(), descricao: descricao.trim() }
    if (trocaGestor) dados.gestorId = gestorId
    const resposta = await aoSalvar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo="Editar time" icone={UsersRound} enviando={enviando}
      descricao={trocaGestor ? 'Nome, descrição e gestor do time.' : 'Nome e descrição do time.'}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-editar-time" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-editar-time" noValidate onSubmit={salvar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="editar-time-nome">Nome do time</Label>
          <Input id="editar-time-nome" className="h-10" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editar-time-descricao">Descrição (opcional)</Label>
          <textarea id="editar-time-descricao" rows={2} maxLength={500}
            className="w-full rounded-md border border-input bg-card px-3 py-2 texto-de-campo shadow-xs outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30"
            value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {trocaGestor && (
          <div className="grid gap-2">
            <Label htmlFor="editar-time-gestor">Gestor do time</Label>
            <Seletor id="editar-time-gestor" valor={gestorId} aoMudar={setGestorId} opcoes={gestorAtual} buscar={buscarOpcoes} />
          </div>
        )}
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
