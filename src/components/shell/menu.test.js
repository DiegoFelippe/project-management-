import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANIMACOES_DO_MENU, NOME_DO_PAPEL, itensDoMenu, tituloDaRota } from './menu'

const ids = (papel) => itensDoMenu(papel).map((item) => item.id)

describe('itensDoMenu', () => {
  it('cada papel vê os seus itens', () => {
    expect(ids('pessoa')).toEqual(['inicio', 'clientes', 'calendario'])
    expect(ids('gestor')).toEqual(['inicio', 'clientes', 'calendario', 'times', 'usuarios'])
    expect(ids('admin')).toEqual(['inicio', 'clientes', 'calendario', 'times', 'usuarios', 'integracoes'])
    expect(ids('central')).toEqual(['inicio', 'clientes', 'calendario', 'times', 'usuarios', 'consultorias'])
    expect(ids('dono')).toEqual(['inicio', 'clientes', 'calendario', 'times', 'usuarios', 'consultorias', 'integracoes'])
  })

  it('o menu não tem mais Projetos nem itens "em breve" (pedido do Diego, 16/11)', () => {
    expect(ids('dono')).not.toContain('projetos')
    expect(itensDoMenu('dono').some((item) => item.emBreve)).toBe(false)
  })
})

describe('NOME_DO_PAPEL', () => {
  it('o dono é o Administrador geral', () => {
    expect(NOME_DO_PAPEL.dono).toBe('Administrador geral')
    expect(NOME_DO_PAPEL.central).toBe('Central')
    expect(NOME_DO_PAPEL.pessoa).toBe('Consultor')
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
    expect(tituloDaRota('/calendario')).toBe('Calendário')
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

  it('Calendário, para todos os papéis, folheia (animação nova, só dele)', () => {
    for (const papel of ['pessoa', 'gestor', 'admin', 'central', 'dono']) {
      const calendario = itensDoMenu(papel).find((item) => item.id === 'calendario')
      expect(calendario).toMatchObject({ rotulo: 'Calendário', rota: '/calendario', animacao: 'folhear' })
    }
    expect(ANIMACOES_DO_MENU).toContain('folhear')
    expect(itensDoMenu('dono').filter((item) => item.animacao === 'folhear')).toHaveLength(1)
  })

  it('a animação folhear tem keyframes e as regras de hover e de foco em src/index.css', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/@keyframes icone-folhear \{/)
    expect(css).toMatch(/\.group:hover \.anim-folhear, \.group:focus-visible \.anim-folhear \{ animation: icone-folhear/)
  })

  it('todo item do menu tem uma animação da lista (regra do projeto)', () => {
    for (const item of itensDoMenu('dono')) {
      expect(ANIMACOES_DO_MENU, `item "${item.id}" sem animação`).toContain(item.animacao)
    }
  })
})
