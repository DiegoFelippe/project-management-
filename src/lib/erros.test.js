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
    expect(traduzirErroAuth({ code: 'weak_password' })).toBe('A senha precisa ter pelo menos 8 caracteres.')
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
