import { describe, expect, it } from 'vitest'
import { MENSAGEM_SSO, erroDeRecuperacao, traduzirErroAuth, traduzirErroBanco, traduzirErroFuncao } from './erros'

describe('traduzirErroAuth', () => {
  it('traduz os erros de login', () => {
    expect(traduzirErroAuth({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.')
    expect(traduzirErroAuth({ code: 'signup_disabled' })).toBe(
      'Esse e-mail não tem acesso. Peça o acesso ao gestor ou ao administrador da sua consultoria.',
    )
    expect(traduzirErroAuth({ code: 'email_not_confirmed' })).toBe(
      'Esse acesso ainda não foi ativado. Abra o convite que chegou no seu e-mail.',
    )
    expect(traduzirErroAuth({ code: 'weak_password' })).toBe(
      'A senha precisa ter pelo menos 10 caracteres, uma letra maiúscula, uma letra minúscula, um número e um símbolo.',
    )
    expect(traduzirErroAuth({ code: 'same_password' })).toBe('A senha nova precisa ser diferente da atual.')
    expect(traduzirErroAuth({ code: 'over_email_send_rate_limit' })).toBe(
      'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
    )
  })

  it('reconhece o Google ainda desligado', () => {
    expect(
      traduzirErroAuth({ code: 'validation_failed', message: 'Unsupported provider: provider is not enabled' }),
    ).toBe('O login com Google ainda não foi configurado.')
    expect(traduzirErroAuth({ code: 'provider_disabled' })).toBe('O login com Google ainda não foi configurado.')
  })

  it('muitos cadastros do app começados: diz o que a própria pessoa pode fazer (o Zerar só existe com o app ativo)', () => {
    const texto = traduzirErroAuth({ code: 'too_many_enrolled_mfa_factors' })
    expect(texto).toBe('Há muitos cadastros do app começados e não confirmados. Tente de novo: os começados são apagados antes de começar outro.')
    expect(texto).not.toMatch(/zerar/i)
  })

  it('qualquer outro erro vira a mensagem padrão', () => {
    expect(traduzirErroAuth({ code: 'qualquer' })).toBe('Algo deu errado. Tente de novo.')
    expect(traduzirErroAuth(null)).toBe('Algo deu errado. Tente de novo.')
  })
})

describe('traduzirErroFuncao e traduzirErroBanco', () => {
  it('traduz os códigos das funções', () => {
    expect(traduzirErroFuncao('email_indisponivel')).toBe(
      'Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.',
    )
    expect(traduzirErroFuncao('ja_na_consultoria')).toBe('Essa pessoa já tem acesso na sua consultoria.')
    expect(traduzirErroFuncao('sem_permissao')).toBe('Você não tem permissão para isso.')
    expect(traduzirErroFuncao('nao_autenticado')).toBe('Sua sessão terminou. Entre de novo.')
    expect(traduzirErroFuncao('dados_invalidos')).toBe('Confira os campos destacados.')
    expect(traduzirErroFuncao('convite_ja_aceito')).toBe('Essa pessoa já aceitou o convite.')
    expect(traduzirErroFuncao('outra_coisa')).toBe('Algo deu errado. Tente de novo.')
  })

  it('nome de time repetido', () => {
    expect(traduzirErroBanco({ code: '23505' })).toBe('Já existe um time com esse nome.')
    expect(traduzirErroBanco({ code: '42501' })).toBe('Você não tem permissão para isso.')
  })

  it('mensagem do SSO', () => {
    expect(MENSAGEM_SSO).toBe(
      'O SSO da sua empresa ainda não foi configurado. Entre com e-mail e senha ou com o Google.',
    )
  })
})

describe('erroDeRecuperacao (esqueci minha senha)', () => {
  it('não revela se o e-mail existe: o limite por e-mail vira sucesso', () => {
    expect(erroDeRecuperacao({ code: 'over_email_send_rate_limit' })).toBeNull()
    expect(erroDeRecuperacao({ code: 'user_not_found' })).toBeNull()
    expect(erroDeRecuperacao(null)).toBeNull()
  })

  it('o limite por endereço de rede aparece (vale para qualquer e-mail)', () => {
    expect(erroDeRecuperacao({ code: 'over_request_rate_limit' })).toBe(
      'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
    )
  })
})

describe('mensagens do CRUD', () => {
  it('traduz os códigos novos', () => {
    expect(traduzirErroFuncao('gestor_com_times')).toBe('Essa pessoa ainda é gestora de times. Troque o gestor desses times antes.')
    expect(traduzirErroFuncao('consultoria_arquivada')).toBe('A consultoria dessa pessoa está arquivada. Reative a consultoria antes.')
    expect(traduzirErroFuncao('nome_em_uso')).toBe('Já existe uma consultoria com esse nome.')
    expect(traduzirErroAuth({ code: 'user_banned' })).toBe('Seu acesso está desativado. Fale com o administrador da sua consultoria.')
  })
})

describe('traduzirErroBanco com contexto', () => {
  it('mantém o padrão de time', () => {
    expect(traduzirErroBanco({ code: '23505' }, { sobre: 'time' })).toBe('Já existe um time com esse nome.')
  })

  it('traduz cliente', () => {
    expect(traduzirErroBanco({ code: '23505' }, { sobre: 'cliente' })).toBe(
      'Já existe um cliente com esse CNPJ (pode estar entre os arquivados).',
    )
    expect(traduzirErroBanco({ code: '23503' }, { sobre: 'cliente' })).toBe(
      'Este cliente tem horas, arquivos, cartões ou modelo de check-in registrados. Arquive em vez de apagar.',
    )
    expect(traduzirErroBanco({ code: '23514' })).toBe('Confira os campos destacados.')
    expect(traduzirErroBanco({ code: '23514' }, { sobre: 'checkin' })).toBe(
      'Um check-in não pode passar de 24 h. Ajuste o horário de fim.',
    )
    expect(traduzirErroBanco({ code: '23P01' }, { sobre: 'checkin' })).toBe(
      'Esse horário se sobrepõe a outro check-in seu.',
    )
  })

  it('traduz arquivo (erros do Storage e do banco)', () => {
    const arquivo = (erro) => traduzirErroBanco(erro, { sobre: 'arquivo' })
    // Formas reais do Storage local (HTTP 400 com o código em statusCode).
    expect(arquivo({ status: 400, statusCode: '413', code: 'EntityTooLarge', message: 'The object exceeded the maximum allowed size' }))
      .toBe('O arquivo passa de 25 MB.')
    expect(arquivo({ status: 400, statusCode: '403', code: 'AccessDenied', message: 'new row violates row-level security policy' }))
      .toBe('Você não tem permissão para isso.')
    expect(arquivo({ status: 400, statusCode: '404', code: 'NoSuchKey', message: 'Object not found' }))
      .toBe('Esse arquivo não foi encontrado.')
    // Resposta sem corpo (ex.: o limite de um proxy): vale o HTTP.
    expect(arquivo({ status: 413 })).toBe('O arquivo passa de 25 MB.')
    expect(arquivo({ code: '42501' })).toBe('Você não tem permissão para isso.')
    expect(arquivo({ code: 'P0001', message: 'objeto_de_outra_pessoa' })).toBe('Você não tem permissão para isso.')
    expect(arquivo({ code: '23514' })).toBe('Confira os campos destacados.')
    expect(arquivo({ status: 500, statusCode: '500' })).toBe('Algo deu errado. Tente de novo.')
    // Fora de "arquivo", os códigos HTTP do Storage não mudam as mensagens de antes.
    expect(traduzirErroBanco({ status: 413 })).toBe('Algo deu errado. Tente de novo.')
  })

  it('traduz as mensagens do banco', () => {
    const msg = (message) => traduzirErroBanco({ code: 'P0001', message }, { sobre: 'cliente' })
    expect(msg('consultor_invalido')).toBe('Escolha um consultor ativo desta consultoria.')
    expect(msg('so_central_muda')).toBe('Só a central muda os dados do cliente.')
    expect(msg('consultoria_arquivada')).toBe('Essa consultoria está arquivada.')
    expect(msg('checkin_sem_cliente')).toBe('Você não é o consultor deste cliente.')
    expect(msg('checkin_no_futuro')).toBe('O horário não pode estar no futuro.')
    expect(msg('sem_permissao')).toBe('Você não tem permissão para isso.')
    expect(msg('consultoria_escolhe_consultor')).toBe('Quem escolhe o consultor é a consultoria.')
    expect(msg('outra_coisa')).toBe('Algo deu errado. Tente de novo.')
  })

  it('traduz as recusas do quadro do cliente', () => {
    const msg = (message, code = 'P0001') => traduzirErroBanco({ code, message })
    expect(msg('responsavel_invalido')).toBe(
      'Escolha alguém que atende este cliente: o consultor dele ou quem cuida da consultoria.',
    )
    expect(msg('coluna_com_cartoes')).toBe('Esta coluna tem cartões. Escolha para qual coluna eles vão ou apague junto.')
    expect(msg('ultima_coluna')).toBe('O quadro precisa de pelo menos uma coluna.')
    expect(msg('coluna_invalida')).toBe('Essa coluna não está mais no quadro. Atualize o quadro e tente de novo.')
    expect(msg('vizinho_invalido')).toBe('O quadro mudou enquanto você arrastava. Atualize o quadro e tente de novo.')
    expect(msg('cartao_arquivado')).toBe('Este cartão foi arquivado. Restaure antes de mover.')
    expect(msg('colunas_demais')).toBe('O quadro chegou ao limite de 50 colunas.')
    expect(msg('checklist_cheio')).toBe('O checklist chegou ao limite de 200 itens.')
    expect(msg('filtro_invalido', '22023')).toBe('Esse filtro não existe. Limpe os filtros e tente de novo.')
  })

  it('traduz as recusas dos modelos de check-in', () => {
    const msg = (message, code = 'P0001') => traduzirErroBanco({ code, message }, { sobre: 'modelo' })
    expect(msg('sem_permissao')).toBe('Você não tem permissão para isso.')
    expect(msg('modelo_arquivado')).toBe('Este modelo está arquivado. Reative o modelo antes de editar.')
    expect(msg('modelo_nome_curto')).toBe('O nome do modelo precisa ter pelo menos 2 letras.')
    expect(msg('modelo_sem_tarefas')).toBe('O modelo precisa de pelo menos uma tarefa.')
    expect(msg('etapa_sem_nome')).toBe('Dê um nome a cada etapa.')
    expect(msg('etapa_sem_tarefas')).toBe('Cada etapa precisa de pelo menos uma tarefa. Acrescente uma ou apague a etapa.')
    expect(msg('tarefa_sem_titulo')).toBe('Dê um título a cada tarefa.')
    expect(msg('prazo_invalido')).toBe('O prazo de cada tarefa vai do dia 0 ao dia 365.')
    expect(msg('dependencia_invalida')).toBe('Uma tarefa só pode depender de tarefas que vêm antes dela na lista.')
    expect(msg('modelo_grande_demais')).toBe(
      'O modelo passou do limite: até 50 etapas, 500 tarefas e 30 dependências por tarefa.',
    )
    expect(msg('consultoria_invalida')).toBe('Escolha uma consultoria ativa para o modelo.')
    expect(msg('filtro_invalido', '22023')).toBe('Esse filtro não existe. Limpe os filtros e tente de novo.')
    // Texto acima do tamanho (o banco confere ao gravar): diz os limites.
    expect(msg('new row for relation "modelo_tarefas" violates check constraint "modelo_tarefas_titulo_check"', '23514'))
      .toBe('Algum texto passou do tamanho: nome do modelo e título da tarefa até 80 letras, descrição do modelo até 400, ' +
        'nome da etapa até 60 e descrição da tarefa até 160.')
    expect(msg('new row for relation "modelos" violates check constraint "modelos_nome_check"', '23514'))
      .toMatch(/^Algum texto passou do tamanho/)
    // Outra regra da coluna (o tipo, que vem de uma lista): o texto de sempre.
    expect(msg('new row for relation "modelos" violates check constraint "modelos_tipo_check"', '23514'))
      .toBe('Confira os campos destacados.')
    // Fora de "modelo", o 23514 continua o de sempre.
    expect(traduzirErroBanco({ code: '23514' })).toBe('Confira os campos destacados.')
    expect(traduzirErroBanco({ code: '23514', message: 'violates check constraint "modelos_nome_check"' }))
      .toBe('Confira os campos destacados.')
  })

  it('traduz as recusas do check-list do cliente', () => {
    const msg = (message, code = 'P0001') => traduzirErroBanco({ code, message }, { sobre: 'checklist' })
    expect(msg('sem_permissao')).toBe('Você não tem permissão para isso.')
    expect(msg('so_o_consultor_marca')).toBe('Só o consultor do cliente marca as tarefas.')
    expect(msg('checklist_encerrado')).toBe('Este check-list foi trocado ou tirado. Atualize a página para ver o atual.')
    expect(msg('cliente_arquivado')).toBe('Este cliente está arquivado: o check-list fica só para ler. Reative o cliente antes.')
    expect(msg('cliente_sem_consultoria')).toBe('Mande o cliente para uma consultoria antes de aplicar um modelo.')
    expect(msg('modelo_indisponivel')).toBe('Esse modelo não está mais disponível para este cliente. Escolha outro.')
    expect(msg('inicio_invalido')).toBe('O início dos prazos precisa estar entre 2 anos atrás e 1 ano à frente.')
    expect(msg('tarefa_bloqueada')).toBe('Esta tarefa depende de outras que ainda não foram feitas.')
    expect(msg('estado_invalido')).toBe('Essa situação de tarefa não existe. Atualize a página.')
    // A nota acima do tamanho (o banco confere ao gravar).
    expect(msg('new row for relation "checklist_tarefas" violates check constraint "checklist_tarefas_nota_check"', '23514'))
      .toBe('A nota vai até 500 letras.')
    // Fora do check-list, estado_invalido e o 23514 continuam os de sempre.
    expect(traduzirErroBanco({ code: 'P0001', message: 'estado_invalido' })).toBe('Algo deu errado. Tente de novo.')
    expect(traduzirErroBanco({ code: '23514' })).toBe('Confira os campos destacados.')
  })

  it('modelo em uso não se apaga: pede para arquivar', () => {
    expect(traduzirErroBanco({ code: 'P0001', message: 'modelo_em_uso' }, { sobre: 'modelo' })).toBe(
      'Este modelo está em uso: clientes têm check-list dele. Arquive em vez de apagar.',
    )
  })

  it('traduz as recusas da descrição do cartão', () => {
    const msg = (message) => traduzirErroBanco({ code: '23514', message })
    expect(msg('descricao_invalida')).toBe(
      'A descrição tem uma formatação que o quadro não aceita. Cole o texto de novo, sem a formatação.',
    )
    expect(msg('link_invalido')).toBe('Os links da descrição precisam começar com http://, https:// ou mailto:.')
    expect(msg('imagem_invalida')).toBe(
      'A imagem da descrição precisa ser enviada por aqui, para este cartão (imagem de outro endereço não entra).',
    )
  })
})

