import { describe, expect, it } from 'vitest'
import { situacao } from './situacao'

describe('situacao', () => {
  it('mostra em que pé está o acesso', () => {
    expect(situacao({ convite_pendente: true, precisa_trocar_senha: false })).toBe('Convite pendente')
    expect(situacao({ convite_pendente: false, precisa_trocar_senha: true })).toBe('Senha provisória')
    expect(situacao({ convite_pendente: false, precisa_trocar_senha: false })).toBe('Ativo')
  })

  it('convite pendente vence senha provisória', () => {
    expect(situacao({ convite_pendente: true, precisa_trocar_senha: true })).toBe('Convite pendente')
  })
})

describe('situacao: desativado', () => {
  it('desativado vem antes de tudo', () => {
    expect(situacao({ ativo: false, convite_pendente: true, precisa_trocar_senha: false })).toBe('Desativado')
  })
})

