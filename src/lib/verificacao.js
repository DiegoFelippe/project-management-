// Verificação em duas etapas (app autenticador, TOTP do Auth do Supabase): o que a tela precisa pedir.
// A regra é a mesma do banco (private.liberado): quem tem o app ativo ou a verificação exigida só usa o sistema
// com a sessão confirmada pelo código (aal2). Quem barra de verdade é o banco; aqui é só para mostrar a tela certa.

// Nível da sessão ('aal1' | 'aal2') lido do token. Token sem o campo, inválido ou ausente vale aal1.
export function nivelDaSessao(token) {
  try {
    const parte = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const carga = JSON.parse(atob(parte.padEnd(parte.length + ((4 - (parte.length % 4)) % 4), '=')))
    return carga.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch {
    return 'aal1'
  }
}

// 'ok' (nada a pedir) | 'codigo' (tem o app: digite o código) | 'configurar' (exigida e ainda sem o app).
// `perfil.verificacao_desde` vem do banco (coluna calculada): a própria pessoa sempre lê a dela.
export function situacaoDaVerificacao({ perfil, nivel }) {
  if (!perfil || nivel === 'aal2') return 'ok'
  if (perfil.verificacao_desde) return 'codigo'
  return perfil.exige_2fa ? 'configurar' : 'ok'
}

// Para onde a pessoa vai antes de usar o app. O código vem antes da senha provisória: com o app ativo, o Auth
// só troca a senha de uma sessão aal2. A senha provisória vem antes de configurar o app.
export function destinoObrigatorio(perfil, verificacao) {
  if (verificacao === 'codigo') return '/verificar'
  if (perfil?.precisa_trocar_senha) return '/trocar-senha'
  if (verificacao === 'configurar') return '/configurar-verificacao'
  return null
}

// Telas obrigatórias (código, senha provisória, configurar o app): não servem de volta depois da verificação.
const OBRIGATORIAS = ['/verificar', '/trocar-senha', '/configurar-verificacao']

// Para onde a tela de verificação manda a pessoa depois do código: o endereço do app que ela tinha pedido (a
// RotaProtegida guarda em state.de, com a busca; ex.: a volta do Google em /calendario?code=…&state=…), ou o Início.
// Só caminho deste app ("/…", nunca "//…" nem "/\…", que o navegador leva para outro site).
export function voltaDepoisDaVerificacao(estado) {
  const de = typeof estado?.de === 'string' ? estado.de : ''
  if (!/^\/(?![/\\])/.test(de)) return '/'
  return OBRIGATORIAS.includes(new URL(de, 'http://app').pathname) ? '/' : de
}

const DIA_EM_SP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

// Situação na ficha da pessoa (aba Acesso) e em Meu perfil.
export function situacaoNaFicha({ verificacaoDesde, exigida }) {
  if (verificacaoDesde) return { estado: 'ativa', rotulo: `Ativa desde ${DIA_EM_SP.format(new Date(verificacaoDesde))}` }
  if (exigida) return { estado: 'pendente', rotulo: 'Ainda não configurada' }
  return { estado: 'desligada', rotulo: 'Desligada' }
}

export const codigoCompleto = (texto) => /^\d{6}$/.test(texto)
