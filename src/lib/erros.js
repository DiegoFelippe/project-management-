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
  // Verificação em duas etapas (app autenticador)
  mfa_verification_failed: 'Código incorreto ou vencido. Confira o app e tente de novo.',
  mfa_challenge_expired: 'O código venceu. Digite o código novo que aparece no app.',
  insufficient_aal: 'Digite antes o código do seu app autenticador.',
  mfa_factor_not_found: 'Não achamos o app autenticador desta conta. Peça a quem administra o seu acesso para zerar a verificação.',
  too_many_enrolled_mfa_factors: 'Muitos cadastros do app começados. Peça a quem administra o seu acesso para zerar a verificação.',
  mfa_totp_enroll_not_enabled: 'A verificação em duas etapas não está ligada no Supabase (veja o README).',
  mfa_totp_verify_not_enabled: 'A verificação em duas etapas não está ligada no Supabase (veja o README).',
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
  google_nao_configurado: 'Falta configurar o app do Google na plataforma (veja o README).',
  verificacao_pendente: 'Confirme o código do seu app autenticador para continuar.',
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

// O banco recusa (23514) check-in de mais de 24 h; a tela confere o mesmo antes de enviar.
export const CHECKIN_DE_MAIS_DE_24H = 'Um check-in não pode passar de 24 h. Ajuste o horário de fim.'

// Mensagens levantadas pelo banco (raise exception '<texto>').
const ERROS_MENSAGEM_BANCO = {
  so_central_muda: 'Só a central muda os dados do cliente.',
  consultor_invalido: 'Escolha um consultor ativo desta consultoria.',
  consultoria_arquivada: 'Essa consultoria está arquivada.',
  checkin_sem_cliente: 'Você não é o consultor deste cliente.',
  checkin_no_futuro: 'O horário não pode estar no futuro.',
  consultoria_escolhe_consultor: 'Quem escolhe o consultor é a consultoria.',
  objeto_de_outra_pessoa: ERROS_FUNCAO.sem_permissao,
  sem_permissao: ERROS_FUNCAO.sem_permissao,
}

// O Storage recusa (413) arquivo acima do limite do bucket "arquivos"; a tela confere o mesmo antes de enviar.
export const ARQUIVO_GRANDE_DEMAIS = 'O arquivo passa de 25 MB.'

// Erros do Storage (bucket "arquivos"): a resposta vem com HTTP 400 e o código em `statusCode` ("403" sem
// permissão, "404" para o objeto que a pessoa não vê, sem dizer se ele existe, "413" acima do limite); `status`
// é o HTTP, que conta quando a resposta não traz corpo.
function traduzirErroDoStorage(erro) {
  const codigos = [erro?.statusCode, erro?.status].map((codigo) => String(codigo ?? ''))
  if (codigos.includes('413')) return ARQUIVO_GRANDE_DEMAIS
  if (codigos.includes('403')) return ERROS_FUNCAO.sem_permissao
  if (codigos.includes('404')) return 'Esse arquivo não foi encontrado.'
  return null
}

// `sobre`: 'time' (padrão) | 'cliente' | 'checkin' | 'arquivo' — muda o texto de alguns códigos.
export function traduzirErroBanco(erro, { sobre = 'time' } = {}) {
  const mensagem = ERROS_MENSAGEM_BANCO[erro?.message]
  if (mensagem) return mensagem
  if (sobre === 'arquivo') {
    const doStorage = traduzirErroDoStorage(erro)
    if (doStorage) return doStorage
  }
  if (erro?.code === '23505') {
    return sobre === 'cliente'
      ? 'Já existe um cliente com esse CNPJ (pode estar entre os arquivados).'
      : 'Já existe um time com esse nome.'
  }
  // Check-ins e arquivos seguram o cliente (on delete restrict).
  if (erro?.code === '23503' && sobre === 'cliente') {
    return 'Este cliente tem horas ou arquivos registrados. Arquive em vez de apagar.'
  }
  if (erro?.code === '23514') return sobre === 'checkin' ? CHECKIN_DE_MAIS_DE_24H : 'Confira os campos destacados.'
  if (erro?.code === '23P01') return 'Esse horário se sobrepõe a outro check-in seu.'
  if (erro?.code === '42501') return ERROS_FUNCAO.sem_permissao
  return PADRAO
}

// "Esqueci minha senha": só o limite por endereço de rede aparece. O limite por e-mail só acontece
// com e-mails cadastrados e revelaria quem tem acesso; para a tela, ele vale como "enviado".
export function erroDeRecuperacao(erro) {
  return erro?.code === 'over_request_rate_limit' ? MUITAS_TENTATIVAS : null
}
