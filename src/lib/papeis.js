// Quem vê todas as consultorias: o administrador geral (dono) e a central.
export const veTudo = (perfil) => perfil?.papel === 'dono' || perfil?.papel === 'central'

// Só a central (o dono tem os mesmos poderes, mas não é "central").
export const ehCentral = (perfil) => perfil?.papel === 'central'

const ROTULOS = { central: 'Central', admin: 'Administrador', gestor: 'Gestor', pessoa: 'Pessoa' }
const opcao = (valor) => ({ valor, rotulo: ROTULOS[valor] })

// Papéis que quem usa o app pode dar ao criar ou editar um acesso (tabela "Papéis na ficha" do design):
// dono → central ou administrador; central → administrador; administrador → gestor ou pessoa; gestor → pessoa.
export function papeisQuePodeDar(perfil) {
  const por = { dono: ['admin', 'central'], central: ['admin'], admin: ['pessoa', 'gestor'], gestor: ['pessoa'] }
  return (por[perfil?.papel] ?? []).map(opcao)
}

// Consultor = pessoa de uma consultoria (administrador, gestor ou pessoa): tem Capacidade e Times na ficha.
export const ehPapelDeConsultoria = (papel) => ['admin', 'gestor', 'pessoa'].includes(papel)
