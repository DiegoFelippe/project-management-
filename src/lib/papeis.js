// Quem vê todas as consultorias: o administrador geral (dono) e a central.
export const veTudo = (perfil) => perfil?.papel === 'dono' || perfil?.papel === 'central'

// Só a central (o dono tem os mesmos poderes, mas não é "central").
export const ehCentral = (perfil) => perfil?.papel === 'central'
