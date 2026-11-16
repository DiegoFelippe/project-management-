import { expect } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

// Ajudantes de teste para os campos do padrão Hub (Seletor, CampoData, CampoHora). Usam a tela de verdade:
// abrem o campo pelo rótulo, navegam e escolhem, como a pessoa faria. Os campos de número (CampoNumero) são
// digitáveis: use user.clear / user.type no campo pelo rótulo, como num input comum.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Escolhe a opção `rotulo` no Seletor chamado `nome`. `busca` digita no campo "Buscar" antes (seletores
// com busca no banco: a opção só aparece depois da resposta).
export async function escolherNoSeletor(user, nome, rotulo, { busca } = {}) {
  await user.click(screen.getByLabelText(nome))
  if (busca) await user.type(await screen.findByRole('combobox', { name: 'Buscar' }), busca)
  // A opção pode ter avatar e detalhe além do rótulo: acha pelo texto do rótulo (o primeiro texto da opção).
  const achar = () => screen.queryAllByRole('option').find((o) => o.querySelector('span > span')?.textContent === rotulo)
  await waitFor(() => expect(achar(), `opção "${rotulo}" no seletor "${nome}"`).toBeTruthy())
  await user.click(achar())
}

// Escolhe a data 'yyyy-MM-dd' no CampoData chamado `nome`: abre, vai até o ano e o mês e clica no dia.
export async function escolherData(user, nome, data) {
  const [ano, mes, dia] = data.split('-').map(Number)
  await user.click(screen.getByLabelText(nome))
  const calendario = await screen.findByRole('dialog', { name: 'Escolher data' })
  const rotuloDoDia = `${dia} de ${MESES[mes - 1]} de ${ano}`
  const diaVisivel = () => within(calendario).queryByRole('button', { name: rotuloDoDia })
  if (!diaVisivel()) {
    await user.click(within(calendario).getByTitle('Escolher ano'))
    const anoVisivel = () => within(calendario).queryByRole('button', { name: String(ano), exact: true })
    for (let i = 0; i < 200 && !anoVisivel(); i++) {
      const faixa = Number(/(\d{4}) a \d{4}/.exec(calendario.textContent)?.[1])
      await user.click(within(calendario).getByRole('button', { name: ano < faixa ? 'Anos anteriores' : 'Próximos anos' }))
    }
    await user.click(anoVisivel())
    await user.click(within(calendario).getByRole('button', { name: MESES_CURTOS[mes - 1], exact: true }))
  }
  await user.click(diaVisivel())
  const aindaAberto = screen.queryByRole('dialog', { name: 'Escolher data' })
  if (aindaAberto) await user.click(within(aindaAberto).getByRole('button', { name: 'Pronto' }))
}

// Escolhe a hora 'HH:mm' no CampoHora chamado `nome`: abre, digita os números e confirma.
export async function escolherHora(user, nome, hora) {
  await user.click(screen.getByLabelText(nome))
  const janela = await screen.findByRole('dialog', { name: 'Escolher horário' })
  await user.type(within(janela).getByLabelText('Digitar horário'), `${hora.replace(':', '')}{Enter}`)
  await user.click(within(janela).getByRole('button', { name: 'Pronto' }))
}
