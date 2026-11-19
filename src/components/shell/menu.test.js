import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANIMACOES_DO_MENU, NOME_DO_PAPEL, itensDaBarraDeBaixo, itensDoMenu, itensDoMenuDoCelular, tituloDaRota } from './menu'

const ids = (papel) => itensDoMenu(papel).map((item) => item.id)

describe('itensDoMenu', () => {
  it('cada papel vê os seus itens', () => {
    expect(ids('pessoa')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros'])
    expect(ids('gestor')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros', 'times', 'usuarios'])
    expect(ids('admin')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros', 'times', 'usuarios', 'integracoes'])
    expect(ids('central')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros', 'times', 'usuarios', 'consultorias'])
    expect(ids('dono')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros', 'times', 'usuarios', 'consultorias', 'integracoes'])
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
    expect(tituloDaRota('/checklists')).toBe('Check-lists')
    expect(tituloDaRota('/quadros')).toBe('Quadros')
    expect(tituloDaRota('/quadros/x')).toBe('Quadros')
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

  it('Check-lists (era Check-ins: auditoria, G3), para todos os papéis, logo depois do Calendário, abre (só dele)', () => {
    for (const papel of ['pessoa', 'gestor', 'admin', 'central', 'dono']) {
      const itens = itensDoMenu(papel)
      const checkins = itens.find((item) => item.id === 'checklists')
      expect(checkins).toMatchObject({ rotulo: 'Check-lists', rota: '/checklists', animacao: 'abrir' })
      expect(itens[itens.indexOf(checkins) - 1].id).toBe('calendario')
    }
    expect(ANIMACOES_DO_MENU).toContain('abrir')
    expect(itensDoMenu('dono').filter((item) => item.animacao === 'abrir')).toHaveLength(1)
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/@keyframes icone-abrir \{/)
    expect(css).toMatch(/\.group:hover \.anim-abrir, \.group:focus-visible \.anim-abrir \{ animation: icone-abrir/)
  })

  it('Quadros, para todos os papéis, depois de Calendário (e de Check-lists, que já estava logo depois dele), usa a animação arrastar, que existe em src/index.css', () => {
    for (const papel of ['pessoa', 'gestor', 'admin', 'central', 'dono']) {
      const itens = itensDoMenu(papel)
      const quadros = itens.find((item) => item.id === 'quadros')
      expect(quadros).toMatchObject({ rotulo: 'Quadros', rota: '/quadros', animacao: 'arrastar' })
      expect(itens.indexOf(quadros)).toBeGreaterThan(itens.findIndex((item) => item.id === 'calendario'))
      expect(itens[itens.indexOf(quadros) - 1].id).toBe('checklists')
    }
    expect(ANIMACOES_DO_MENU).toContain('arrastar')
    expect(itensDoMenu('dono').filter((item) => item.animacao === 'arrastar')).toHaveLength(1)
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/@keyframes icone-arrastar \{/)
    expect(css).toMatch(/\.group:hover \.anim-arrastar, \.group:focus-visible \.anim-arrastar \{ animation: icone-arrastar/)
  })

  it('cada animação aparece no trilho uma vez só', () => {
    const usadas = itensDoMenu('dono').map((item) => item.animacao)
    expect(new Set(usadas).size).toBe(usadas.length)
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

// Celular (auditoria, G7): a barra de baixo tem até 5 itens do papel, os mais usados, na ordem do trilho; o resto vai para
// o ☰, com o perfil, o tema e o Sair.
describe('barra de baixo do celular', () => {
  const PAPEIS = ['pessoa', 'gestor', 'admin', 'central', 'dono']
  const idsDaBarra = (papel) => itensDaBarraDeBaixo(papel).map((item) => item.id)
  const idsDoMenu = (papel) => itensDoMenuDoCelular(papel).map((item) => item.id)

  it('os 5 de cada papel: Início, Clientes e Calendário para todos; depois o que o papel mais usa', () => {
    expect(idsDaBarra('pessoa')).toEqual(['inicio', 'clientes', 'calendario', 'checklists', 'quadros'])
    expect(idsDaBarra('gestor')).toEqual(['inicio', 'clientes', 'calendario', 'quadros', 'usuarios'])
    expect(idsDaBarra('admin')).toEqual(['inicio', 'clientes', 'calendario', 'quadros', 'usuarios'])
    expect(idsDaBarra('central')).toEqual(['inicio', 'clientes', 'calendario', 'usuarios', 'consultorias'])
    expect(idsDaBarra('dono')).toEqual(['inicio', 'clientes', 'calendario', 'usuarios', 'consultorias'])
  })

  it('no máximo 5, só itens do papel, na ordem do trilho; o ☰ tem o resto, e os dois juntos são o trilho inteiro', () => {
    for (const papel of PAPEIS) {
      const trilho = ids(papel)
      expect(idsDaBarra(papel).length).toBeLessThanOrEqual(5)
      expect(idsDaBarra(papel)).toEqual(trilho.filter((id) => idsDaBarra(papel).includes(id)))
      expect(idsDoMenu(papel)).toEqual(trilho.filter((id) => !idsDaBarra(papel).includes(id)))
    }
    expect(idsDoMenu('pessoa')).toEqual([])
    expect(idsDoMenu('dono')).toEqual(['checklists', 'quadros', 'times', 'integracoes'])
  })

  it('cada item da barra leva a animação do trilho', () => {
    for (const papel of PAPEIS) {
      for (const item of [...itensDaBarraDeBaixo(papel), ...itensDoMenuDoCelular(papel)]) {
        expect(ANIMACOES_DO_MENU, item.id).toContain(item.animacao)
        expect(item).toMatchObject(itensDoMenu(papel).find((i) => i.id === item.id))
      }
    }
  })
})
