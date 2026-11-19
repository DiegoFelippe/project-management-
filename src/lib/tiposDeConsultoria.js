// Tipos de consultoria da pessoa (perfis.tipos_de_consultoria): um só lugar para os valores e os rótulos.
// A ordem daqui é a ordem em que aparecem na ficha, no filtro e na lista.
export const TIPOS_DE_CONSULTORIA = [
  { valor: 'gestao', rotulo: 'Gestão' },
  { valor: 'sucesso_do_cliente', rotulo: 'Sucesso do Cliente' },
  { valor: 'assessoria_juridica', rotulo: 'Assessoria Jurídica' },
  { valor: 'gestao_de_pessoas', rotulo: 'Gestão de Pessoas' },
]

// Opções do filtro "Tipo" (o Seletor acrescenta o "Todos" com rotuloTodos).
export const OPCOES_DE_TIPO = TIPOS_DE_CONSULTORIA

// Rótulos dos tipos que a pessoa tem, na ordem do pedido (valor desconhecido some).
export function rotulosDosTipos(tipos) {
  const tem = new Set(tipos ?? [])
  return TIPOS_DE_CONSULTORIA.filter((t) => tem.has(t.valor)).map((t) => t.rotulo)
}
