import { describe, expect, it } from 'vitest'
import { descreverPeriodo, fimDoMes, lerPeriodo, paraEndereco, periodoAoTrocar, somarDias, validarPeriodo } from './periodo'

const HOJE = '2026-11-17'
const ler = (busca) => lerPeriodo(new URLSearchParams(busca), HOJE)

describe('periodo', () => {
  it('soma dias atravessando mês e ano; fim do mês com fevereiro bissexto', () => {
    expect(somarDias('2026-11-17', -29)).toBe('2026-10-19')
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(fimDoMes('2026-11-01')).toBe('2026-11-30')
    expect(fimDoMes('2028-02-01')).toBe('2028-02-29')
  })

  it('sem nada no endereço: o Mês atual, do primeiro ao último dia', () => {
    expect(ler('')).toEqual({ tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' })
  })

  it('Mês do endereço (e mês inválido cai no atual)', () => {
    expect(ler('periodo=mes&mes=2026-10-01')).toMatchObject({ tipo: 'mes', mes: '2026-10-01', de: '2026-10-01', ate: '2026-10-31' })
    expect(ler('mes=2026-13-01')).toMatchObject({ tipo: 'mes', mes: '2026-11-01' })
    expect(ler('periodo=qualquer')).toMatchObject({ tipo: 'mes', mes: '2026-11-01' })
  })

  it('atalhos contados a partir de hoje', () => {
    expect(ler('periodo=ultimos-30')).toMatchObject({ de: '2026-10-19', ate: HOJE })
    expect(ler('periodo=ultimos-90')).toMatchObject({ de: '2026-08-20', ate: HOJE })
    expect(ler('periodo=ano')).toMatchObject({ de: '2026-01-01', ate: HOJE })
  })

  it('personalizado: as datas do endereço; sem elas (ou inválidas), do dia 1 do mês até hoje', () => {
    expect(ler('periodo=personalizado&de=2026-09-16&ate=2026-10-15')).toMatchObject({ tipo: 'personalizado', de: '2026-09-16', ate: '2026-10-15' })
    expect(ler('periodo=personalizado&de=2026-02-30&ate=x')).toMatchObject({ de: '2026-11-01', ate: HOJE })
  })

  it('endereço de volta: só o que o período precisa', () => {
    expect(paraEndereco({ tipo: 'mes', mes: '2026-10-01', de: '2026-10-01', ate: '2026-10-31' })).toEqual({ periodo: 'mes', mes: '2026-10-01' })
    expect(paraEndereco({ tipo: 'ano', de: '2026-01-01', ate: HOJE })).toEqual({ periodo: 'ano' })
    expect(paraEndereco({ tipo: 'personalizado', de: '2026-09-16', ate: '2026-10-15' })).toEqual({ periodo: 'personalizado', de: '2026-09-16', ate: '2026-10-15' })
  })

  it('trocar o tipo: Personalizado começa no período mostrado; Mês vai para o mês do fim', () => {
    const outubro = { tipo: 'mes', mes: '2026-10-01', de: '2026-10-01', ate: '2026-10-31' }
    expect(periodoAoTrocar(outubro, 'personalizado', HOJE)).toEqual({ tipo: 'personalizado', de: '2026-10-01', ate: '2026-10-31' })
    // Mês futuro: o fim passaria do mês atual; volta para o mês atual.
    expect(periodoAoTrocar({ tipo: 'mes', mes: '2027-01-01', de: '2027-01-01', ate: '2027-01-31' }, 'personalizado', HOJE))
      .toEqual({ tipo: 'personalizado', de: '2026-11-01', ate: '2026-11-30' })
    expect(periodoAoTrocar({ tipo: 'personalizado', de: '2026-09-16', ate: '2026-10-15' }, 'mes', HOJE)).toEqual({ tipo: 'mes', mes: '2026-10-01' })
    expect(periodoAoTrocar(outubro, 'ultimos-30', HOJE)).toEqual({ tipo: 'ultimos-30' })
  })

  it('valida o período: ordem, fim no máximo no fim do mês atual e no máximo 2 anos', () => {
    expect(validarPeriodo('2026-09-16', '2026-10-15', HOJE)).toBeNull()
    expect(validarPeriodo('2026-10-15', '2026-10-01', HOJE)).toBe('A data inicial vem depois da final.')
    expect(validarPeriodo('2026-11-01', '2026-11-30', HOJE)).toBeNull()
    expect(validarPeriodo('2026-11-01', '2026-12-01', HOJE)).toBe('O período vai no máximo até o fim do mês atual.')
    expect(validarPeriodo('2024-01-02', '2026-01-01', HOJE)).toBeNull()
    expect(validarPeriodo('2024-01-01', '2026-01-01', HOJE)).toBe('O período pode ter no máximo 2 anos.')
    // 29/02 + 2 anos = 28/02 (como o banco): até 27/02 cabe, 28/02 não.
    expect(validarPeriodo('2024-02-29', '2026-02-27', HOJE)).toBeNull()
    expect(validarPeriodo('2024-02-29', '2026-02-28', HOJE)).toBe('O período pode ter no máximo 2 anos.')
    expect(validarPeriodo('', '2026-10-15', HOJE)).toBe('Escolha as duas datas.')
  })

  it('descreve o período em dias', () => {
    expect(descreverPeriodo('2026-10-19', '2026-11-17')).toBe('19/10/2026 a 17/11/2026')
    expect(descreverPeriodo('2026-10-19', '2026-10-19')).toBe('19/10/2026')
  })
})
