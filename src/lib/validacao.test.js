import { describe, expect, it } from 'vitest'
import { erroDeEmail, erroDeTelefone, MENSAGEM_DE_EMAIL, MENSAGEM_DE_TELEFONE } from './validacao'

// Usabilidade, U2: e-mail e telefone conferidos na tela (o banco continua com as regras dele). Os dois são opcionais
// onde a janela diz "(opcional)": vazio passa.
describe('erroDeEmail', () => {
  it('vazio passa (opcional); com obrigatorio, pede o e-mail', () => {
    expect(erroDeEmail('')).toBeNull()
    expect(erroDeEmail('   ')).toBeNull()
    expect(erroDeEmail(undefined)).toBeNull()
    expect(erroDeEmail('', { obrigatorio: true })).toBe(MENSAGEM_DE_EMAIL)
  })

  it('aceita e-mail com @ e domínio com ponto (com espaço nas pontas)', () => {
    for (const ok of ['contato@empresa.com.br', ' ana.lima+teste@exemplo.test ', 'a@b.co']) expect(erroDeEmail(ok)).toBeNull()
  })

  it('recusa o que não é e-mail', () => {
    for (const ruim of ['contato@', 'contato', '@empresa.com', 'contato@empresa', 'a b@empresa.com', 'a@@b.com']) {
      expect(erroDeEmail(ruim)).toBe(MENSAGEM_DE_EMAIL)
    }
  })
})

describe('erroDeTelefone', () => {
  it('vazio passa (opcional)', () => {
    expect(erroDeTelefone('')).toBeNull()
    expect(erroDeTelefone('  ')).toBeNull()
    expect(erroDeTelefone(null)).toBeNull()
  })

  it('aceita 10 ou 11 números, com ou sem pontuação', () => {
    for (const ok of ['4933221100', '49999887766', '(49) 3322-1100', '(49) 99988-7766', '49 9 9988 7766']) expect(erroDeTelefone(ok)).toBeNull()
  })

  it('recusa menos de 10 ou mais de 11 números, e letras', () => {
    for (const ruim of ['49999', '499998877', '+55 49 99988-7766', '499998877661', 'telefone']) expect(erroDeTelefone(ruim)).toBe(MENSAGEM_DE_TELEFONE)
  })
})
