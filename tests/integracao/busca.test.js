import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { padraoDeBusca } from '../../src/lib/busca.js'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, criarTimeDeTeste, entrarComo, limparTudo } from './ambiente.js'

// A busca dos seletores (pessoas e consultorias) ignora acento e maiúscula no banco, com o mesmo recorte de RLS.
const admin = clienteAdmin()
const marca = `Zq${Date.now().toString(36)}`
let A, B, adminA, adminB, comoA, comoB, joaoA

beforeAll(async () => {
  A = await criarConsultoriaDeTeste(`Açaí ${marca}`)
  B = await criarConsultoriaDeTeste(`Outra ${marca}`)
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  joaoA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  await admin.from('perfis').update({ nome: `João ${marca}` }).eq('id', joaoA.id)
  comoA = await entrarComo(adminA)
  comoB = await entrarComo(adminB)
})

afterAll(limparTudo)

describe('busca sem acento (nome_busca)', () => {
  it('"joao" acha "João" em perfis, com count e limit, e a outra consultoria não vê', async () => {
    const padrao = padraoDeBusca(`JOÃO ${marca}`)
    const { data, count, error } = await comoA.from('perfis').select('id, nome', { count: 'exact' }).ilike('nome_busca', padrao).order('nome').limit(20)
    expect(error).toBeNull()
    expect(count).toBe(1)
    expect(data).toEqual([{ id: joaoA.id, nome: `João ${marca}` }])
    const doutra = await comoB.from('perfis').select('id', { count: 'exact' }).ilike('nome_busca', padrao)
    expect(doutra.count).toBe(0)
  })

  it('"acai" acha "Açaí" em consultorias; a consultoria alheia não aparece', async () => {
    const padrao = padraoDeBusca(`acai ${marca}`)
    const propria = await comoA.from('consultorias').select('id', { count: 'exact' }).ilike('nome_busca', padrao)
    expect(propria.data).toEqual([{ id: A }])
    const alheia = await comoB.from('consultorias').select('id', { count: 'exact' }).ilike('nome_busca', padrao)
    expect(alheia.count).toBe(0)
  })

  it('times: "implantacao" acha "Implantação" pelo nome_busca, só na própria consultoria', async () => {
    await criarTimeDeTeste({ consultoriaId: A, gestorId: adminA.id, nome: `Implantação ${marca}` })
    const padrao = padraoDeBusca(`IMPLANTACAO ${marca}`)
    const propria = await comoA.from('times').select('nome', { count: 'exact' }).ilike('nome_busca', padrao)
    expect(propria.error).toBeNull()
    expect(propria.data).toEqual([{ nome: `Implantação ${marca}` }])
    const alheia = await comoB.from('times').select('id', { count: 'exact' }).ilike('nome_busca', padrao)
    expect(alheia.count).toBe(0)
    const { error } = await comoA.from('times').update({ nome_busca: 'x' }).eq('consultoria_id', A)
    expect(error).not.toBeNull()
  })

  it('nome_busca não é gravável por quem está logado', async () => {
    const { error } = await comoA.from('perfis').update({ nome_busca: 'x' }).eq('id', adminA.id)
    expect(error).not.toBeNull()
  })
})
