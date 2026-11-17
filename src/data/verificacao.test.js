import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { cancelarCadastro, concluirCadastro, confirmarCodigo, desativarVerificacao, iniciarCadastro } from './verificacao'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: { listFactors: vi.fn(), enroll: vi.fn(), unenroll: vi.fn(), challengeAndVerify: vi.fn() },
    },
  },
}))

const mfa = supabase.auth.mfa
const ativo = { id: 'f1', factor_type: 'totp', status: 'verified' }
const metade = { id: 'f0', factor_type: 'totp', status: 'unverified' }

beforeEach(() => {
  vi.clearAllMocks()
  mfa.listFactors.mockResolvedValue({ data: { all: [metade, ativo], totp: [ativo] }, error: null })
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null })
  mfa.unenroll.mockResolvedValue({ data: {}, error: null })
})

describe('confirmarCodigo (entrar)', () => {
  it('confirma o código no app autenticador ativo', async () => {
    expect(await confirmarCodigo('123456')).toEqual({ erro: null })
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
  })
  it('código errado: mensagem em português', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { code: 'mfa_verification_failed', status: 422 } })
    expect(await confirmarCodigo('000000')).toEqual({ erro: 'Código incorreto ou vencido. Confira o app e tente de novo.' })
  })
  it('sem app ativo: avisa', async () => {
    mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null })
    expect((await confirmarCodigo('123456')).erro).toMatch(/app autenticador/)
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
  })
})

describe('iniciarCadastro', () => {
  it('tira cadastros começados e não confirmados e cadastra um novo (QR, chave e endereço)', async () => {
    mfa.enroll.mockResolvedValue({
      data: { id: 'f2', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC123', uri: 'otpauth://totp/x' } }, error: null,
    })
    const r = await iniciarCadastro()
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f0' })
    expect(mfa.unenroll).not.toHaveBeenCalledWith({ factorId: 'f1' })
    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp', issuer: 'IXC Consult' }))
    expect(r).toEqual({ erro: null, fatorId: 'f2', qr: 'data:image/svg+xml;utf-8,<svg/>', segredo: 'ABC123', uri: 'otpauth://totp/x' })
  })
  it('se não der para tirar um cadastro começado, avisa e não começa outro', async () => {
    mfa.unenroll.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', status: 500 } })
    expect(await iniciarCadastro()).toEqual({ erro: 'Algo deu errado. Tente de novo.' })
    expect(mfa.enroll).not.toHaveBeenCalled()
  })

  it('falha do Auth vira mensagem', async () => {
    mfa.enroll.mockResolvedValue({ data: null, error: { code: 'too_many_enrolled_mfa_factors' } })
    expect((await iniciarCadastro()).erro).toBeTruthy()
  })
})

describe('concluirCadastro e cancelarCadastro', () => {
  it('confirma o primeiro código no fator novo', async () => {
    expect(await concluirCadastro('f2', '654321')).toEqual({ erro: null })
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f2', code: '654321' })
  })
  it('cancelar tira o cadastro começado', async () => {
    await cancelarCadastro('f2')
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f2' })
  })
})

describe('desativarVerificacao', () => {
  it('confere um código atual e só então tira o app', async () => {
    expect(await desativarVerificacao('111111')).toEqual({ erro: null })
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '111111' })
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' })
  })
  it('código errado: não tira nada', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { code: 'mfa_verification_failed' } })
    expect((await desativarVerificacao('000000')).erro).toMatch(/Código incorreto/)
    expect(mfa.unenroll).not.toHaveBeenCalled()
  })
})
