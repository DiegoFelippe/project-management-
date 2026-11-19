import { Building2, CalendarDays, House, ListChecks, PlugZap, RadioTower, SquareKanban, UserPlus, Users } from 'lucide-react'

// Regra do projeto (CLAUDE.md): todo ícone do trilho anima ao passar o mouse.
// Item novo: escolha uma destas (keyframes "icone-<nome>" em src/index.css).
export const ANIMACOES_DO_MENU = ['subir', 'balancar', 'pulsar', 'abrir', 'erguer', 'conectar', 'transmitir', 'folhear', 'arrastar', 'sair']

const TODOS = ['dono', 'central', 'admin', 'gestor', 'pessoa']
const QUEM_ADMINISTRA = ['dono', 'central', 'admin', 'gestor']

// Itens do trilho, na ordem em que aparecem, e quem vê cada um.
const ITENS = [
  { id: 'inicio', rotulo: 'Início', rota: '/', icone: House, animacao: 'subir', papeis: TODOS },
  { id: 'clientes', rotulo: 'Clientes', rota: '/clientes', icone: RadioTower, animacao: 'transmitir', papeis: TODOS },
  { id: 'calendario', rotulo: 'Calendário', rota: '/calendario', icone: CalendarDays, animacao: 'folhear', papeis: TODOS },
  // "Check-lists" (era "Check-ins": auditoria, G3): "Check-in" fica só para as horas (a aba do cliente). /checkins redireciona.
  { id: 'checklists', rotulo: 'Check-lists', rota: '/checklists', icone: ListChecks, animacao: 'abrir', papeis: TODOS },
  { id: 'quadros', rotulo: 'Quadros', rota: '/quadros', icone: SquareKanban, animacao: 'arrastar', papeis: TODOS },
  { id: 'times', rotulo: 'Times', rota: '/times', icone: Users, animacao: 'pulsar', papeis: QUEM_ADMINISTRA },
  { id: 'usuarios', rotulo: 'Usuários', rota: '/usuarios', icone: UserPlus, animacao: 'balancar', papeis: QUEM_ADMINISTRA },
  { id: 'consultorias', rotulo: 'Consultorias', rota: '/consultorias', icone: Building2, animacao: 'erguer', papeis: ['dono', 'central'] },
  { id: 'integracoes', rotulo: 'Integrações', rota: '/integracoes', icone: PlugZap, animacao: 'conectar', papeis: ['dono', 'admin'] },
]

export const NOME_DO_PAPEL = {
  dono: 'Administrador geral',
  central: 'Central',
  admin: 'Administrador',
  gestor: 'Gestor',
  pessoa: 'Consultor',
}

export function itensDoMenu(papel) {
  return ITENS.filter((item) => item.papeis.includes(papel)).map(({ papeis: _papeis, ...item }) => item)
}

// No celular (auditoria, G7), a barra de baixo tem até 5 itens de cada papel, os que ele mais usa, na ordem do trilho:
// Início, Clientes e Calendário para todos; o consultor ainda tem Check-lists e Quadros (são só 5); a gestão
// (administrador e gestor), Quadros e Usuários (a ocupação da equipe); a central e o dono, Usuários e Consultorias.
// O resto vai para o ☰, com o perfil, o tema e o Sair.
const NA_BARRA_DE_BAIXO = {
  pessoa: ['inicio', 'clientes', 'calendario', 'checklists', 'quadros'],
  gestor: ['inicio', 'clientes', 'calendario', 'quadros', 'usuarios'],
  admin: ['inicio', 'clientes', 'calendario', 'quadros', 'usuarios'],
  central: ['inicio', 'clientes', 'calendario', 'usuarios', 'consultorias'],
  dono: ['inicio', 'clientes', 'calendario', 'usuarios', 'consultorias'],
}

export function itensDaBarraDeBaixo(papel) {
  const escolhidos = NA_BARRA_DE_BAIXO[papel] ?? []
  return itensDoMenu(papel).filter((item) => escolhidos.includes(item.id))
}

export function itensDoMenuDoCelular(papel) {
  const escolhidos = NA_BARRA_DE_BAIXO[papel] ?? []
  return itensDoMenu(papel).filter((item) => !escolhidos.includes(item.id))
}

export function tituloDaRota(pathname) {
  const primeiraParte = `/${pathname.split('/')[1] ?? ''}`
  return ITENS.find((item) => item.rota === primeiraParte)?.rotulo ?? 'Início'
}
