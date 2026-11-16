import { describe, expect, it } from 'vitest'
import { ANIMACOES_DO_MENU, NOME_DO_PAPEL, itensDoMenu, tituloDaRota } from './menu'

const ids = (papel) => itensDoMenu(papel).map((item) => item.id)

describe('itensDoMenu', () => {
  it('cada papel vê os seus itens', () => {
    expect(ids('pessoa')).toEqual(['inicio', 'clientes', 'projetos'])
    expect(ids('gestor')).toEqual(['inicio', 'clientes', 'projetos', 'times', 'usuarios'])
    expect(ids('admin')).toEqual(['inicio', 'clientes', 'projetos', 'times', 'usuarios', 'integracoes'])
    expect(ids('central')).toEqual(['inicio', 'clientes', 'projetos', 'times', 'usuarios', 'consultorias'])
    expect(ids('dono')).toEqual(['inicio', 'clientes', 'projetos', 'times', 'usuarios', 'consultorias', 'integracoes'])
  })

  it('projetos ainda está em breve', () => {
    expect(itensDoMenu('gestor').find((item) => item.id === 'projetos').emBreve).toBe(true)
  })
})

describe('NOME_DO_PAPEL', () => {
  it('o dono é o Administrador geral', () => {
    expect(NOME_DO_PAPEL.dono).toBe('Administrador geral')
    expect(NOME_DO_PAPEL.central).toBe('Central')
  })
})

describe('tituloDaRota', () => {
  it('dá o nome da tela pelo endereço', () => {
    expect(tituloDaRota('/times/0b5c')).toBe('Times')
    expect(tituloDaRota('/')).toBe('Início')
    expect(tituloDaRota('/clientes')).toBe('Clientes')
    expect(tituloDaRota('/usuarios')).toBe('Usuários')
    expect(tituloDaRota('/consultorias')).toBe('Consultorias')
    expect(tituloDaRota('/integracoes')).toBe('Integrações')
  })
})

describe('animação no hover', () => {
  it('Integrações ganhou animação própria (conectar)', () => {
    expect(itensDoMenu('admin').find((item) => item.id === 'integracoes').animacao).toBe('conectar')
    expect(ANIMACOES_DO_MENU).toContain('conectar')
  })

  it('o menu não tem mais Capacidade nem a animação medir', () => {
    expect(ids('dono')).not.toContain('capacidade')
    expect(ANIMACOES_DO_MENU).not.toContain('medir')
  })

  it('Clientes usa a animação transmitir', () => {
    expect(itensDoMenu('pessoa').find((item) => item.id === 'clientes').animacao).toBe('transmitir')
    expect(ANIMACOES_DO_MENU).toContain('transmitir')
  })

  it('todo item do menu tem uma animação da lista (regra do projeto)', () => {
    for (const item of itensDoMenu('dono')) {
      expect(ANIMACOES_DO_MENU, `item "${item.id}" sem animação`).toContain(item.animacao)
    }
  })
})
