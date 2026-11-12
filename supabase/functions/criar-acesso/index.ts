// POST /functions/v1/criar-acesso
// Dono cria administradores de uma consultoria; admin cria gestores e pessoas; gestor cria pessoas
// nos times dele. O acesso é sempre da consultoria de quem cria (ou da escolhida pelo dono).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { clienteAdmin, quemChama, type Perfil } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { criarAcessoCompleto } from '../_shared/usuarios.ts'
import { type DadosAcesso, validarAcesso } from '../_shared/validar.ts'

async function exigirTimes(
  admin: SupabaseClient,
  times: string[],
  filtro: { consultoriaId: string; gestorId?: string },
) {
  if (!times.length) return
  let consulta = admin.from('times').select('id').in('id', times).eq('consultoria_id', filtro.consultoriaId)
  if (filtro.gestorId) consulta = consulta.eq('gestor_id', filtro.gestorId)
  const { data, error } = await consulta
  if (error) throw error
  if ((data?.length ?? 0) !== times.length) throw new Falha(403, 'sem_permissao')
}

// Confere o que quem chama pode criar e devolve a consultoria do novo acesso.
async function consultoriaDoPedido(admin: SupabaseClient, quem: Perfil, dados: DadosAcesso): Promise<string> {
  switch (quem.papel) {
    case 'dono': {
      if (dados.papel !== 'admin' || dados.times.length) throw new Falha(403, 'sem_permissao')
      if (!dados.consultoria_id) throw new Falha(400, 'dados_invalidos', { campo: 'consultoria_id' })
      const { data } = await admin.from('consultorias').select('id').eq('id', dados.consultoria_id).maybeSingle()
      if (!data) throw new Falha(400, 'dados_invalidos', { campo: 'consultoria_id' })
      return data.id
    }
    case 'admin': {
      if (dados.papel !== 'gestor' && dados.papel !== 'pessoa') throw new Falha(403, 'sem_permissao')
      await exigirTimes(admin, dados.times, { consultoriaId: quem.consultoria_id! })
      return quem.consultoria_id!
    }
    case 'gestor': {
      if (dados.papel !== 'pessoa') throw new Falha(403, 'sem_permissao')
      await exigirTimes(admin, dados.times, { consultoriaId: quem.consultoria_id!, gestorId: quem.id })
      return quem.consultoria_id!
    }
    default:
      throw new Falha(403, 'sem_permissao')
  }
}

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const dados = validarAcesso(await lerJson(req))
  const consultoriaId = await consultoriaDoPedido(admin, quem, dados)
  const pessoaId = await criarAcessoCompleto(admin, {
    forma: dados.forma,
    nome: dados.nome,
    email: dados.email,
    senha: dados.senha,
    redirectTo: dados.redirectTo,
    papel: dados.papel,
    consultoriaId,
    criadoPor: quem.id,
    times: dados.times,
  })
  return responder(201, { pessoa_id: pessoaId })
})
