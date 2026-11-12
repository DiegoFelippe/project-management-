import { Building2, FolderKanban, House, UserPlus, Users } from 'lucide-react'

const TODOS = ['dono', 'admin', 'gestor', 'pessoa']
const QUEM_ADMINISTRA = ['dono', 'admin', 'gestor']

// Itens do trilho, na ordem em que aparecem, e quem vê cada um.
const ITENS = [
  { id: 'inicio', rotulo: 'Início', rota: '/', icone: House, papeis: TODOS },
  { id: 'projetos', rotulo: 'Projetos', icone: FolderKanban, emBreve: true, papeis: TODOS },
  { id: 'times', rotulo: 'Times', rota: '/times', icone: Users, papeis: QUEM_ADMINISTRA },
  { id: 'usuarios', rotulo: 'Usuários', rota: '/usuarios', icone: UserPlus, papeis: QUEM_ADMINISTRA },
  { id: 'consultorias', rotulo: 'Consultorias', rota: '/consultorias', icone: Building2, papeis: ['dono'] },
]

export const NOME_DO_PAPEL = {
  dono: 'Dono da plataforma',
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
