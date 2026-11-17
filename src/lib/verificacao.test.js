import { describe, expect, it } from 'vitest'
import { codigoCompleto, destinoObrigatorio, nivelDaSessao, situacaoDaVerificacao, situacaoNaFicha, voltaDepoisDaVerificacao } from './verificacao'

// Token com só a parte do meio que importa (o app nunca confia nele para segurança: quem barra é o banco).
const token = (carga) => `x.${btoa(JSON.stringify(carga)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`

describe('nivelDaSessao', () => {
  it('lê o aal do token', () => {
    expect(nivelDaSessao(token({ aal: 'aal2' }))).toBe('aal2')
    expect(nivelDaSessao(token({ aal: 'aal1' }))).toBe('aal1')
  })
  it('token sem aal, inválido ou ausente vale aal1', () => {
    expect(nivelDaSessao(token({ sub: 'u1' }))).toBe('aal1')
    expect(nivelDaSessao('não-é-token')).toBe('aal1')
    expect(nivelDaSessao(undefined)).toBe('aal1')
  })
})

describe('situacaoDaVerificacao (mesma regra do banco)', () => {
  it('sem o app e sem exigência: nada muda, com aal1 ou aal2', () => {
    expect(situacaoDaVerificacao({ perfil: { exige_2fa: false, verificacao_desde: null }, nivel: 'aal1' })).toBe('ok')
    expect(situacaoDaVerificacao({ perfil: {}, nivel: 'aal1' })).toBe('ok')
  })
  it('com o app ativo e sessão aal1: pede o código', () => {
    expect(situacaoDaVerificacao({ perfil: { verificacao_desde: '2026-11-10T15:00:00Z' }, nivel: 'aal1' })).toBe('codigo')
  })
  it('exigida sem o app: configurar; exigida com o app: código', () => {
    expect(situacaoDaVerificacao({ perfil: { exige_2fa: true, verificacao_desde: null }, nivel: 'aal1' })).toBe('configurar')
    expect(situacaoDaVerificacao({ perfil: { exige_2fa: true, verificacao_desde: '2026-11-10T15:00:00Z' }, nivel: 'aal1' })).toBe('codigo')
  })
  it('sessão aal2: tudo certo', () => {
    expect(situacaoDaVerificacao({ perfil: { exige_2fa: true, verificacao_desde: '2026-11-10T15:00:00Z' }, nivel: 'aal2' })).toBe('ok')
  })
  it('sem perfil: nada a pedir', () => {
    expect(situacaoDaVerificacao({ perfil: null, nivel: 'aal1' })).toBe('ok')
  })
})

describe('destinoObrigatorio', () => {
  it('o código vem antes da senha provisória (o Auth não troca a senha de quem tem o app sem o código)', () => {
    expect(destinoObrigatorio({ precisa_trocar_senha: true }, 'codigo')).toBe('/verificar')
  })
  it('senha provisória antes de configurar o app', () => {
    expect(destinoObrigatorio({ precisa_trocar_senha: true }, 'configurar')).toBe('/trocar-senha')
    expect(destinoObrigatorio({ precisa_trocar_senha: false }, 'configurar')).toBe('/configurar-verificacao')
  })
  it('nada pendente: nenhum desvio', () => {
    expect(destinoObrigatorio({ precisa_trocar_senha: false }, 'ok')).toBeNull()
  })
})

describe('situacaoNaFicha', () => {
  it('ativa: com a data (dia/mês/ano em São Paulo)', () => {
    expect(situacaoNaFicha({ verificacaoDesde: '2026-11-10T02:00:00Z', exigida: false }))
      .toEqual({ estado: 'ativa', rotulo: 'Ativa desde 09/11/2026' })
  })
  it('exigida e sem o app: ainda não configurada; sem exigência: desligada', () => {
    expect(situacaoNaFicha({ verificacaoDesde: null, exigida: true })).toEqual({ estado: 'pendente', rotulo: 'Ainda não configurada' })
    expect(situacaoNaFicha({ verificacaoDesde: null, exigida: false })).toEqual({ estado: 'desligada', rotulo: 'Desligada' })
  })
})

describe('codigoCompleto', () => {
  it('só 6 dígitos', () => {
    expect(codigoCompleto('123456')).toBe(true)
    expect(codigoCompleto('12345')).toBe(false)
    expect(codigoCompleto('12345a')).toBe(false)
    expect(codigoCompleto('1234567')).toBe(false)
  })
})

describe('voltaDepoisDaVerificacao', () => {
  it('volta para o endereço do app que a pessoa pediu (com a busca), nunca para fora dele', () => {
    expect(voltaDepoisDaVerificacao({ de: '/calendario?code=abc&state=xyz' })).toBe('/calendario?code=abc&state=xyz')
    expect(voltaDepoisDaVerificacao({ de: '//golpe.test/x' })).toBe('/')
    expect(voltaDepoisDaVerificacao({ de: 'https://golpe.test' })).toBe('/')
    expect(voltaDepoisDaVerificacao({ de: '/\\golpe.test' })).toBe('/')
    expect(voltaDepoisDaVerificacao({ de: '/verificar' })).toBe('/')
    expect(voltaDepoisDaVerificacao(null)).toBe('/')
  })
})
