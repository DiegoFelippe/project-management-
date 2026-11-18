// Meu perfil: a mesma ficha de Usuários (FichaDoConsultor), no modo próprio, com os dados de quem está usando. Abre
// pela bolinha do trilho (acima do Sair) e pela própria linha em Usuários: um formulário só, nos dois lugares.
// Cada coisa vai pelo caminho que o banco aceita da própria pessoa: o nome pela Edge Function gerenciar-acesso (em si
// mesmo, só o nome), o contato por atualizar_meu_contato, a foto e a cor pelo Storage, a senha pelo Auth. Depois de
// gravar, recarrega o perfil de quem está usando e chama `aoSalvo()` (Usuários recarrega a lista).
// Os passos vão um por vez e param no primeiro que falha. Se algum já tinha ido, a janela fica aberta dizendo o que foi
// salvo e o que não, o perfil e a lista são recarregados e, ao tentar de novo, o que já foi não vai outra vez (a foto
// não sobe de novo). Senha recusada pelo servidor marca o campo da senha.
import { useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import FichaDoConsultor from '@/components/usuarios/FichaDoConsultor'
import { mudarCor, tirarFoto, trocarFoto } from '@/data/imagens'
import { atualizarMeuContato, gerenciarAcesso } from '@/data/usuarios'
import { juntar } from '@/lib/nomes'

// Nome e gênero de cada passo, para a frase do que foi e do que não foi salvo.
const PASSOS = {
  nome: { nome: 'nome', artigo: 'o' },
  contato: { nome: 'contato', artigo: 'o' },
  foto: { nome: 'foto', artigo: 'a' },
  cor: { nome: 'cor do avatar', artigo: 'a' },
  senha: { nome: 'senha', artigo: 'a' },
}
const maiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1)
const comPonto = (texto) => (/[.!?]$/.test(texto) ? texto : `${texto}.`)

// "Nome e foto salvos. A senha não mudou: <motivo> Falta salvar a cor do avatar."
function mensagemParcial({ salvos, falhou, motivo, faltam = [] }) {
  const feminino = salvos.every((passo) => PASSOS[passo].artigo === 'a')
  const salvo = `salv${feminino ? 'a' : 'o'}${salvos.length > 1 ? 's' : ''}`
  const partes = [
    `${maiuscula(juntar(salvos.map((passo) => PASSOS[passo].nome)))} ${salvo}.`,
    `${maiuscula(PASSOS[falhou].artigo)} ${PASSOS[falhou].nome} não mudou: ${comPonto(motivo)}`,
  ]
  if (faltam.length) partes.push(`Falta salvar ${juntar(faltam.map((passo) => `${PASSOS[passo].artigo} ${PASSOS[passo].nome}`))}.`)
  return partes.join(' ')
}

const mesmoContato = (a, b) => !!a && !!b && a.telefone === b.telefone && a.cidade === b.cidade && a.uf === b.uf

export default function MinhaFicha({ aoFechar, aoSalvo }) {
  const { perfil, recarregarPerfil, definirSenha } = useAuth()
  // O que esta janela já gravou numa tentativa anterior que parou no meio: { nome, contato, foto, fotoAtual, cor }.
  const gravado = useRef({})

  // Os passos que faltam, na ordem: nome → contato → foto → cor → senha. Cada um anota o que gravou.
  function passosDe({ mudancas, contato, foto, cor, senha }) {
    const ja = gravado.current
    const passos = []
    if (mudancas.nome !== undefined && mudancas.nome !== ja.nome) {
      passos.push(['nome', async () => {
        const { erro } = await gerenciarAcesso('editar', perfil.id, { nome: mudancas.nome })
        if (!erro) ja.nome = mudancas.nome
        return erro
      }])
    }
    if (contato && !mesmoContato(contato, ja.contato)) {
      passos.push(['contato', async () => {
        const { erro } = await atualizarMeuContato(contato)
        if (!erro) ja.contato = contato
        return erro
      }])
    }
    if ((foto?.arquivo || foto?.tirar) && foto !== ja.foto) {
      // A foto guardada agora: a que esta janela já enviou (se enviou) ou a do perfil.
      const atual = ja.fotoAtual !== undefined ? ja.fotoAtual : perfil.foto
      passos.push(['foto', async () => {
        const resposta = foto.arquivo ? await trocarFoto(perfil.id, foto.arquivo, atual) : await tirarFoto(perfil.id, atual)
        if (!resposta.erro) {
          ja.foto = foto
          ja.fotoAtual = foto.arquivo ? (resposta.caminho ?? null) : null
        }
        return resposta.erro
      }])
    }
    if (cor !== undefined && !('cor' in ja && ja.cor === cor)) {
      passos.push(['cor', async () => {
        const { erro } = await mudarCor(perfil.id, cor)
        if (!erro) ja.cor = cor
        return erro
      }])
    }
    if (senha) passos.push(['senha', async () => (await definirSenha(senha)).erro])
    return passos
  }

  async function salvar(pedido) {
    const passos = passosDe(pedido)
    const salvos = []
    for (const [indice, [passo, gravar]] of passos.entries()) {
      const erro = await gravar()
      if (erro) {
        const erros = passo === 'senha' ? { senha: erro } : undefined
        if (!salvos.length) return { erro, erros }
        await recarregarPerfil?.()
        aoSalvo?.()
        const faltam = passos.slice(indice + 1).map(([seguinte]) => seguinte)
        return { erro: mensagemParcial({ salvos, falhou: passo, motivo: erro, faltam }), erros }
      }
      salvos.push(passo)
    }
    gravado.current = {}
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
