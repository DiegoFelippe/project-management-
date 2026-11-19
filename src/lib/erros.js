// Mensagens que a pessoa vê quando algo dá errado (sempre em português).
import { REGRA_DA_SENHA } from './senha'

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
  weak_password: `A senha precisa ter ${REGRA_DA_SENHA}.`,
  same_password: 'A senha nova precisa ser diferente da atual.',
  user_banned: 'Seu acesso está desativado. Fale com o administrador da sua consultoria.',
  // Verificação em duas etapas (app autenticador)
  mfa_verification_failed: 'Código incorreto ou vencido. Confira o app e tente de novo.',
  mfa_challenge_expired: 'O código venceu. Digite o código novo que aparece no app.',
  insufficient_aal: 'Digite antes o código do seu app autenticador.',
  mfa_factor_not_found: 'Não achamos o app autenticador desta conta. Peça a quem administra o seu acesso para zerar a verificação.',
  too_many_enrolled_mfa_factors: 'Há muitos cadastros do app começados e não confirmados. Tente de novo: os começados são apagados antes de começar outro.',
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
  estado_invalido: 'O pedido ao Google venceu ou não é seu. Clique em Conectar Google de novo.',
  google_sem_permissoes: 'Marque todas as permissões que o Google pedir (agenda e Meet) e conecte de novo.',
  google_recusou: 'O Google recusou a conexão. Tente de novo.',
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

// O motivo do "não se aplica" é obrigatório: a janela da tarefa diz o mesmo embaixo do campo, antes de enviar.
export const MOTIVO_OBRIGATORIO = 'Conte por que esta tarefa não se aplica.'

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
  // Quadro do cliente
  responsavel_invalido: 'Escolha alguém que atende este cliente: o consultor dele ou quem cuida da consultoria.',
  coluna_com_cartoes: 'Esta coluna tem cartões. Escolha para qual coluna eles vão ou apague junto.',
  ultima_coluna: 'O quadro precisa de pelo menos uma coluna.',
  coluna_invalida: 'Essa coluna não está mais no quadro. Atualize o quadro e tente de novo.',
  vizinho_invalido: 'O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.',
  cartao_arquivado: 'Este cartão foi arquivado. Restaure antes de mover.',
  colunas_demais: 'O quadro chegou ao limite de 50 colunas.',
  checklist_cheio: 'O checklist chegou ao limite de 200 itens.',
  filtro_invalido: 'Esse filtro não existe. Limpe os filtros e tente de novo.',
  // Descrição do cartão (o banco confere o JSON do editor)
  descricao_invalida: 'A descrição tem uma formatação que o quadro não aceita. Cole o texto de novo, sem a formatação.',
  link_invalido: 'Os links da descrição precisam começar com http://, https:// ou mailto:.',
  imagem_invalida:
    'A imagem da descrição precisa ser enviada por aqui, para este cartão (imagem de outro endereço não entra).',
  // Modelos de check-in (salvar_modelo confere antes de gravar; a tela confere o mesmo)
  modelo_arquivado: 'Este modelo está arquivado. Reative o modelo antes de editar.',
  modelo_nome_curto: 'O nome do modelo precisa ter pelo menos 2 letras.',
  modelo_sem_tarefas: 'O modelo precisa de pelo menos uma tarefa.',
  etapa_sem_nome: 'Dê um nome a cada etapa.',
  etapa_sem_tarefas: 'Cada etapa precisa de pelo menos uma tarefa. Acrescente uma ou apague a etapa.',
  tarefa_sem_titulo: 'Dê um título a cada tarefa.',
  prazo_invalido: 'O prazo de cada tarefa vai do dia 0 ao dia 365.',
  dependencia_invalida: 'Uma tarefa só pode depender de tarefas que vêm antes dela na lista.',
  modelo_grande_demais: 'O modelo passou do limite: até 50 etapas, 500 tarefas e 30 dependências por tarefa.',
  consultoria_invalida: 'Escolha uma consultoria ativa para o modelo.',
  modelo_mudou: 'Alguém salvou este modelo depois que você abriu. Feche e abra de novo.',
  modelo_em_uso: 'Este modelo está em uso: clientes têm check-list dele. Arquive em vez de apagar.',
  // Check-list do cliente (aplicar, marcar e a nota)
  so_o_consultor_marca: 'Só o consultor do cliente marca as tarefas.',
  checklist_encerrado: 'Este check-list foi trocado ou tirado. Atualize a página para ver o atual.',
  cliente_arquivado: 'Este cliente está arquivado: o check-list fica só para ler. Reative o cliente antes.',
  cliente_sem_consultoria: 'Mande o cliente para uma consultoria antes de aplicar um modelo.',
  modelo_indisponivel: 'Esse modelo não está mais disponível para este cliente. Escolha outro.',
  inicio_invalido: 'O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.',
  tarefa_bloqueada: 'Esta tarefa depende de outras que ainda não foram feitas.',
  // "Não se aplica" sem motivo (ou só com espaços): 22023
  motivo_obrigatorio: MOTIVO_OBRIGATORIO,
  // "Não se aplica" de novo, com outro motivo (a tela estava velha): trocar o motivo é reabrir e marcar de novo
  ja_nao_se_aplica: 'Esta tarefa já está como não se aplica. Para trocar o motivo, use o Editar da tarefa.',
  // Trocar o motivo (o Editar) de uma tarefa que deixou de ser "não se aplica" (a tela estava velha)
  so_em_nao_se_aplica: 'Esta tarefa não está mais como "não se aplica". Atualize a página.',
  // Comentários da tarefa: em branco (22023) e o que alguém apagou enquanto a tela estava aberta
  comentario_vazio: 'Escreva o comentário.',
  comentario_nao_encontrado: 'Este comentário foi apagado. Atualize a tarefa.',
  // Quadros do menu (pessoais e de time)
  time_invalido: 'Esse time não está mais disponível para você. Escolha outro time.',
  quadro_arquivado: 'Este quadro está arquivado: restaure antes de renomear.',
}

// O quadro segura o time (on delete restrict): time com quadros, abertos ou arquivados, não se apaga.
const QUADROS_SEGURAM_O_TIME =
  'Este time tem quadros (abertos ou arquivados). Apague os quadros dele em Quadros antes de apagar o time.'

// Códigos que só valem no check-list (o mesmo código tem outro sentido em outras telas).
const ERROS_DO_CHECKLIST = {
  estado_invalido: 'Essa situação de tarefa não existe. Atualize a página.',
}

// Nos quadros do menu (pessoal e do time) não há cliente: o responsável recusado ganha o texto neutro.
const ERROS_DOS_QUADROS_DO_MENU = {
  responsavel_invalido: 'Essa pessoa não pode ser responsável neste quadro. Escolha outra.',
}

// As regras das colunas dos modelos recusam (23514) texto acima do tamanho; a tela confere o mesmo antes de enviar.
export const TEXTO_DO_MODELO_GRANDE_DEMAIS =
  'Algum texto passou do tamanho: nome do modelo e título da tarefa até 80 letras, descrição do modelo até 400, ' +
  'nome da etapa até 60 e descrição da tarefa até 160.'

// O Storage recusa (413) arquivo acima do limite do bucket "arquivos"; a tela confere o mesmo antes de enviar.
export const ARQUIVO_GRANDE_DEMAIS = 'O arquivo passa de 25 MB.'

// Erros do Storage (baldes "arquivos" e "quadros"): a resposta vem com HTTP 400 e o código em `statusCode` ("403" sem
// permissão, "404" para o objeto que a pessoa não vê, sem dizer se ele existe, "413" acima do limite); `status`
// é o HTTP, que conta quando a resposta não traz corpo.
function traduzirErroDoStorage(erro) {
  const codigos = [erro?.statusCode, erro?.status].map((codigo) => String(codigo ?? ''))
  if (codigos.includes('413')) return ARQUIVO_GRANDE_DEMAIS
  if (codigos.includes('403')) return ERROS_FUNCAO.sem_permissao
  if (codigos.includes('404')) return 'Esse arquivo não foi encontrado.'
  return null
}

// `sobre`: 'time' (o padrão quando não vem) | 'cliente' | 'checkin' | 'arquivo' | 'modelo' | 'checklist' | 'quadro' (os
// quadros do menu) — muda o texto de alguns códigos. O 23503 do time com quadros vale com `sobre: 'time'` dito ou quando
// a recusa é a da regra quadros_time_id_fkey (apagarTime não diz o `sobre`, e outro 23503 sem contexto continua no texto
// padrão).
export function traduzirErroBanco(erro, { sobre } = {}) {
  const doChecklist = sobre === 'checklist' ? ERROS_DO_CHECKLIST[erro?.message] : null
  if (doChecklist) return doChecklist
  const doQuadroDoMenu = sobre === 'quadro' ? ERROS_DOS_QUADROS_DO_MENU[erro?.message] : null
  if (doQuadroDoMenu) return doQuadroDoMenu
  const mensagem = ERROS_MENSAGEM_BANCO[erro?.message]
  if (mensagem) return mensagem
  if (sobre === 'arquivo') {
    const doStorage = traduzirErroDoStorage(erro)
    if (doStorage) return doStorage
  }
  if (erro?.code === '23505') {
    if (sobre === 'cliente') return 'Já existe um cliente com esse CNPJ (pode estar entre os arquivados).'
    // O nome do quadro não se repete entre os abertos do mesmo dono (criar, renomear e restaurar).
    if (sobre === 'quadro') return 'Já existe um quadro aberto com esse nome.'
    return 'Já existe um time com esse nome.'
  }
  // Check-ins, arquivos, cartões do quadro e check-lists de modelo seguram o cliente (on delete restrict).
  if (erro?.code === '23503' && sobre === 'cliente') {
    return 'Este cliente tem horas, arquivos, cartões ou modelo de check-in registrados. Arquive em vez de apagar.'
  }
  if (erro?.code === '23503' && (sobre === 'time' || /quadros_time_id_fkey/.test(erro.message ?? ''))) {
    return QUADROS_SEGURAM_O_TIME
  }
  if (erro?.code === '23514') {
    if (sobre === 'checkin') return CHECKIN_DE_MAIS_DE_24H
    // No quadro, o que a pessoa digita é só o nome.
    if (sobre === 'quadro') return 'O nome do quadro precisa ter de 1 a 80 letras.'
    // No check-list, o que a pessoa digita é a nota da tarefa, o motivo do "não se aplica" e os comentários.
    if (sobre === 'checklist') {
      if (/checklist_comentarios_texto_check/.test(erro.message ?? '')) return 'O comentário vai até 2.000 letras.'
      return /checklist_tarefas_motivo_check/.test(erro.message ?? '') ? 'O motivo vai até 500 letras.' : 'A nota vai até 500 letras.'
    }
    // Só as regras de tamanho dos textos (nome, descrição, título); as outras (ex.: tipo) ficam no texto de sempre.
    if (sobre === 'modelo' && /_(nome|descricao|titulo)_check"/.test(erro.message ?? '')) {
      return TEXTO_DO_MODELO_GRANDE_DEMAIS
    }
    return 'Confira os campos destacados.'
  }
  if (erro?.code === '23P01') return 'Esse horário se sobrepõe a outro check-in seu.'
  if (erro?.code === '42501') return ERROS_FUNCAO.sem_permissao
  return PADRAO
}

// "Esqueci minha senha": só o limite por endereço de rede aparece. O limite por e-mail só acontece
// com e-mails cadastrados e revelaria quem tem acesso; para a tela, ele vale como "enviado".
export function erroDeRecuperacao(erro) {
  return erro?.code === 'over_request_rate_limit' ? MUITAS_TENTATIVAS : null
}
