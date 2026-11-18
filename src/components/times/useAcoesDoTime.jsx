import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { buscarPessoas } from '@/data/pessoas'
import { apagarTime, editarTime } from '@/data/times'
import FormularioDeTime from './FormularioDeTime'

// Editar e apagar time, iguais na lista e na página do time (auditoria, C5), como o useAcoesDoCliente. Quem mexe: o
// administrador da consultoria ou o gestor do time (o dono só olha); o banco confere de novo. aoMudar() relê a tela depois
// de editar; aoApagar(time) roda depois de apagar (sem ele, aoMudar). `buscarGestores` (busca no banco, nunca a lista
// inteira) serve também ao Novo time.
export function useAcoesDoTime({ perfil, aoMudar, aoApagar }) {
  const [editando, setEditando] = useState(null)
  const [apagando, setApagando] = useState(null)
  const gerencio = (time) => perfil.papel === 'admin' || (perfil.papel === 'gestor' && time.gestor_id === perfil.id)
  const buscarGestores = useCallback(
    (termo) => buscarPessoas({ consultoriaId: perfil.consultoria_id, papeis: ['gestor', 'admin'], termo }),
    [perfil.consultoria_id],
  )

  async function salvar(time, dados) {
    const resposta = await editarTime(time.id, dados)
    if (!resposta.erro) {
      toast.success(`Time ${dados.nome} atualizado.`)
      aoMudar()
    }
    return resposta
  }

  async function apagar(time) {
    const resposta = await apagarTime(time.id)
    if (!resposta.erro) {
      toast.success(`Time ${time.nome} apagado.`)
      if (aoApagar) aoApagar(time)
      else aoMudar()
    }
    return resposta
  }

  const janelas = (
    <>
      {editando && (
        <FormularioDeTime key={editando.id} time={editando} papel={perfil.papel} buscarGestores={buscarGestores}
          aoFechar={() => setEditando(null)} aoSalvar={(dados) => salvar(editando, dados)} />
      )}
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(null)} titulo={`Apagar o time ${apagando.nome}?`}
          descricao="O time some de vez. As pessoas continuam com acesso; só saem deste time. Se o time tiver quadros, apague-os antes, em Quadros."
          rotuloConfirmar="Apagar time" aoConfirmar={() => apagar(apagando)} />
      )}
    </>
  )

  return { gerencio, buscarGestores, editar: setEditando, apagar: setApagando, janelas }
}
