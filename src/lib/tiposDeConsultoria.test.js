import { describe, expect, it } from 'vitest'
import { OPCOES_DE_TIPO, TIPOS_DE_CONSULTORIA, rotulosDosTipos } from './tiposDeConsultoria'

describe('tipos de consultoria', () => {
  it('são quatro, na ordem do pedido, com o rótulo em português', () => {
    expect(TIPOS_DE_CONSULTORIA).toEqual([
      { valor: 'gestao', rotulo: 'Gestão' },
      { valor: 'sucesso_do_cliente', rotulo: 'Sucesso do Cliente' },
      { valor: 'assessoria_juridica', rotulo: 'Assessoria Jurídica' },
      { valor: 'gestao_de_pessoas', rotulo: 'Gestão de Pessoas' },
    ])
  })

  it('o filtro tem Todos e depois os quatro', () => {
    expect(OPCOES_DE_TIPO.map((o) => o.rotulo)).toEqual(['Gestão', 'Sucesso do Cliente', 'Assessoria Jurídica', 'Gestão de Pessoas'])
  })

  it('rotulosDosTipos devolve os rótulos na ordem do pedido e ignora valor desconhecido', () => {
    expect(rotulosDosTipos(['gestao_de_pessoas', 'gestao', 'x'])).toEqual(['Gestão', 'Gestão de Pessoas'])
    expect(rotulosDosTipos([])).toEqual([])
    expect(rotulosDosTipos(null)).toEqual([])
  })
})
