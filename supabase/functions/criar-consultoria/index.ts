// POST /functions/v1/criar-consultoria — só o dono da plataforma.
// Cria a consultoria e o primeiro administrador dela (por convite ou com senha provisória).
import { clienteAdmin, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { criarAcessoCompleto } from '../_shared/usuarios.ts'
import { validarEmail, validarForma, validarNome, validarRedirect, validarSenha } from '../_shared/validar.ts'

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  if (quem.papel !== 'dono') throw new Falha(403, 'sem_permissao')

  const corpo = await lerJson(req)
  const nome = validarNome(corpo.nome, 'nome')
  const dadosAdmin = (corpo.admin && typeof corpo.admin === 'object' ? corpo.admin : {}) as Record<string, unknown>
  const forma = validarForma(dadosAdmin.forma, 'admin.forma')
  const novoAdmin = {
    forma,
    nome: validarNome(dadosAdmin.nome, 'admin.nome'),
    email: validarEmail(dadosAdmin.email, 'admin.email'),
    senha: validarSenha(forma, dadosAdmin.senha, 'admin.senha'),
  }
  const redirectTo = validarRedirect(corpo.redirectTo)

  const { data: consultoria, error } = await admin.from('consultorias').insert({ nome }).select('id').single()
  if (error) throw error

  try {
    const adminId = await criarAcessoCompleto(admin, {
      ...novoAdmin,
      redirectTo,
      papel: 'admin',
      consultoriaId: consultoria.id,
      criadoPor: quem.id,
      times: [],
    })
    return responder(201, { consultoria_id: consultoria.id, admin_id: adminId })
  } catch (erro) {
    // Sem administrador a consultoria não serve para nada: desfaz.
    await admin.from('consultorias').delete().eq('id', consultoria.id)
    throw erro
  }
})
