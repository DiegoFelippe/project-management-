import { Building2, House, PlugZap, RadioTower, UserPlus, Users } from 'lucide-react'

// Regra do projeto (CLAUDE.md): todo ícone do trilho anima ao passar o mouse.
// Item novo: escolha uma destas (keyframes "icone-<nome>" em src/index.css).
export const ANIMACOES_DO_MENU = ['subir', 'balancar', 'pulsar', 'abrir', 'erguer', 'conectar', 'transmitir', 'sair']

const TODOS = ['dono', 'central', 'admin', 'gestor', 'pessoa']
const QUEM_ADMINISTRA = ['dono', 'central', 'admin', 'gestor']

// Itens do trilho, na ordem em que aparecem, e quem vê cada um.
const ITENS = [
  { id: 'inicio', rotulo: 'Início', rota: '/', icone: House, animacao: 'subir', papeis: TODOS },
  { id: 'clientes', rotulo: 'Clientes', rota: '/clientes', icone: RadioTower, animacao: 'transmitir', papeis: TODOS },
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
  pessoa: 'Pessoa',
}

export function itensDoMenu(papel) {
  return ITENS.filter((item) => item.papeis.includes(papel)).map(({ papeis: _papeis, ...item }) => item)
}

export function tituloDaRota(pathname) {
  const primeiraParte = `/${pathname.split('/')[1] ?? ''}`
  return ITENS.find((item) => item.rota === primeiraParte)?.rotulo ?? 'Início'
}
