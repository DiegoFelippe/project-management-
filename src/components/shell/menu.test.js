import { describe, expect, it } from 'vitest'
import { ANIMACOES_DO_MENU, itensDoMenu, tituloDaRota } from './menu'

const ids = (papel) => itensDoMenu(papel).map((item) => item.id)

describe('itensDoMenu', () => {
  it('cada papel vê os seus itens', () => {
    expect(ids('pessoa')).toEqual(['inicio', 'projetos'])
    expect(ids('gestor')).toEqual(['inicio', 'projetos', 'times', 'usuarios'])
    expect(ids('admin')).toEqual(['inicio', 'projetos', 'times', 'usuarios'])
    expect(ids('dono')).toEqual(['inicio', 'projetos', 'times', 'usuarios', 'consultorias'])
  })

  it('projetos ainda está em breve', () => {
    expect(itensDoMenu('gestor').find((item) => item.id === 'projetos').emBreve).toBe(true)
  })
})

describe('tituloDaRota', () => {
  it('dá o nome da tela pelo endereço', () => {
    expect(tituloDaRota('/times/0b5c')).toBe('Times')
    expect(tituloDaRota('/')).toBe('Início')
    expect(tituloDaRota('/usuarios')).toBe('Usuários')
    expect(tituloDaRota('/consultorias')).toBe('Consultorias')
  })
})

describe('animação no hover', () => {
  it('todo item do menu tem uma animação da lista (regra do projeto)', () => {
    for (const item of itensDoMenu('dono')) {
      expect(ANIMACOES_DO_MENU, `item "${item.id}" sem animação`).toContain(item.animacao)
    }
  })
})
