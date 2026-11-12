// Mensagens que a pessoa vê quando algo dá errado (sempre em português).
const PADRAO = 'Algo deu errado. Tente de novo.'
const GOOGLE_DESLIGADO = 'O login com Google ainda não foi configurado.'
const MUITAS_TENTATIVAS = 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'

export const MENSAGEM_SSO =
  'O SSO da sua empresa ainda não foi configurado. Entre com e-mail e senha ou com o Google.'

const ERROS_AUTH = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  signup_disabled: 'Esse e-mail não tem acesso. Peça o acesso ao gestor ou ao administrador da sua consultoria.',
  email_not_confirmed: 'Esse acesso ainda não foi ativado. Abra o convite que chegou no seu e-mail.',
  provider_disabled: GOOGLE_DESLIGADO,
  over_request_rate_limit: MUITAS_TENTATIVAS,
  over_email_send_rate_limit: MUITAS_TENTATIVAS,
  weak_password: 'A senha precisa ter pelo menos 8 caracteres.',
  same_password: 'A senha nova precisa ser diferente da atual.',
  user_banned: 'Seu acesso está desativado. Fale com o administrador da sua consultoria.',
}

const ERROS_FUNCAO = {
  nao_autenticado: 'Sua sessão terminou. Entre de novo.',
  sem_permissao: 'Você não tem permissão para isso.',
  dados_invalidos: 'Confira os campos destacados.',
  ja_na_consultoria: 'Essa pessoa já tem acesso na sua consultoria.',
  email_indisponivel: 'Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.',
  convite_ja_aceito: 'Essa pessoa já aceitou o convite.',
  gestor_com_times: 'Essa pessoa ainda é gestora de times. Troque o gestor desses times antes.',
  consultoria_arquivada: 'A consultoria dessa pessoa está arquivada. Reative a consultoria antes.',
  nome_em_uso: 'Já existe uma consultoria com esse nome.',
}

export function traduzirErroAuth(erro) {
  if (!erro) return PADRAO
  if (erro.code === 'validation_failed' && /provider is not enabled/i.test(erro.message ?? '')) {
    return GOOGLE_DESLIGADO
  }
  return ERROS_AUTH[erro.code] ?? PADRAO
}

export function traduzirErroFuncao(codigo) {
  return ERROS_FUNCAO[codigo] ?? PADRAO
}

export function traduzirErroBanco(erro) {
  if (erro?.code === '23505') return 'Já existe um time com esse nome.'
  if (erro?.code === '42501') return ERROS_FUNCAO.sem_permissao
  return PADRAO
}

// "Esqueci minha senha": só o limite por endereço de rede aparece. O limite por e-mail só acontece
// com e-mails cadastrados e revelaria quem tem acesso; para a tela, ele vale como "enviado".
export function erroDeRecuperacao(erro) {
  return erro?.code === 'over_request_rate_limit' ? MUITAS_TENTATIVAS : null
}
