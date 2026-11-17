// Meu perfil: a mesma ficha de Usuários (FichaDoConsultor), no modo próprio, com os dados de quem está usando. Abre
// pela bolinha do trilho (acima do Sair) e pela própria linha em Usuários: um formulário só, nos dois lugares.
// Cada coisa vai pelo caminho que o banco aceita da própria pessoa: o nome pela Edge Function gerenciar-acesso (em si
// mesmo, só o nome), o contato por atualizar_meu_contato, a foto e a cor pelo Storage, a senha pelo Auth. Depois de
// gravar, recarrega o perfil de quem está usando e chama `aoSalvo()` (Usuários recarrega a lista).
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'

export default function MinhaFicha({ aoFechar, aoSalvo }) {
  const { perfil, recarregarPerfil, definirSenha } = useAuth()

  // Para no primeiro passo que falhar; o que já foi gravado fica.
  async function gravar({ mudancas, contato, foto, cor, senha }) {
    if (mudancas.nome !== undefined) {
      const { erro } = await gerenciarAcesso('editar', perfil.id, { nome: mudancas.nome })
      if (erro) return erro
    }
    if (contato) {
      const { erro } = await atualizarMeuContato(contato)
      if (erro) return erro
    }
    if (foto?.arquivo || foto?.tirar) {
      const { erro } = foto.arquivo ? await trocarFoto(perfil.id, foto.arquivo, perfil.foto) : await tirarFoto(perfil.id, perfil.foto)
      if (erro) return erro
    }
    if (cor !== undefined) {
      const { erro } = await mudarCor(perfil.id, cor)
      if (erro) return erro
    }
    if (senha) {
      const { erro } = await definirSenha(senha)
      if (erro) return erro
    }
    return null
  }

  async function salvar(pedido) {
    const erro = await gravar(pedido)
    if (erro) return { erro }
    await recarregarPerfil?.()
    toast.success('Perfil atualizado.')
    aoSalvo?.()
    return { erro: null }
  }

  return (
    <FichaDoConsultor aberto pessoa={perfil} perfilDeQuem={perfil} aoFechar={aoFechar} aoSalvar={salvar}
      aoMudarVerificacao={recarregarPerfil} />
  )
}
