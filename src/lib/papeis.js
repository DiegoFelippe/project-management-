// Quem vê todas as consultorias: o administrador geral (dono) e a central.
export const veTudo = (perfil) => perfil?.papel === 'dono' || perfil?.papel === 'central'

// Só a central (o dono tem os mesmos poderes, mas não é "central").
export const ehCentral = (perfil) => perfil?.papel === 'central'

// O papel "pessoa" (valor guardado no banco) aparece na tela como "Consultor" (pedido do Diego, 16/11).
const ROTULOS = { central: 'Central', admin: 'Administrador', gestor: 'Gestor', pessoa: 'Consultor' }
export const rotuloDoPapel = (papel) => ROTULOS[papel] ?? papel
const opcao = (valor) => ({ valor, rotulo: ROTULOS[valor] })

// Papéis que quem usa o app pode dar ao criar ou editar um acesso (tabela "Papéis na ficha" do design):
// dono → central ou administrador; central → administrador; administrador → gestor ou consultor; gestor → consultor
// (consultor = valor `pessoa` no banco).
export function papeisQuePodeDar(perfil) {
  const por = { dono: ['admin', 'central'], central: ['admin'], admin: ['pessoa', 'gestor'], gestor: ['pessoa'] }
  return (por[perfil?.papel] ?? []).map(opcao)
}

// Consultor = pessoa de uma consultoria (administrador, gestor ou pessoa): tem Capacidade e Times na ficha.
export const ehPapelDeConsultoria = (papel) => ['admin', 'gestor', 'pessoa'].includes(papel)
