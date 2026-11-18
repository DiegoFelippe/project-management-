import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoData from '@/components/campos/CampoData'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { AcaoDaLinha } from '@/components/comum/Tabela'
import { useEnvio } from '@/components/comum/useEnvio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apagarAusencia, criarAusencia, editarAusencia } from '@/data/capacidade'
import { formatarDia } from '@/lib/mes'
import AusenciasDaPessoa from './AusenciasDaPessoa'

// Os erros da ausência, todos de uma vez, cada um no seu campo (usabilidade, U2).
function errosDaAusencia({ de, ate, motivo }) {
  const erros = {}
  if (!de) erros.de = 'Informe a data inicial.'
  if (!ate) erros.ate = 'Informe a data final.'
  else if (de && ate < de) erros.ate = 'A data final não pode ser antes da inicial.'
  const texto = motivo.trim()
  if (texto.length < 2 || texto.length > 120) erros.motivo = 'O motivo precisa ter de 2 a 120 caracteres.'
  return erros
}

// O formulário em linha (dentro da ficha e da Capacidade): sem a JanelaFormulario, o foco vai ao primeiro campo errado aqui.
function Formulario({ ausencia, aoSalvar, aoCancelar }) {
  const [de, setDe] = useState(ausencia?.de ?? '')
  const [ate, setAte] = useState(ausencia?.ate ?? '')
  const [motivo, setMotivo] = useState(ausencia?.motivo ?? '')
  const { erro, erros, conferir, enviando, enviar } = useEnvio()
  const formulario = useRef(null)
  useEffect(() => {
    if (Object.keys(erros).length) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [erros])

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir(errosDaAusencia({ de, ate, motivo }))) return
    await enviar(() => aoSalvar({ de, ate, motivo: motivo.trim() }))
  }

  return (
    <form ref={formulario} noValidate onSubmit={salvar} aria-label={ausencia ? 'Editar ausência' : 'Nova ausência'} className="grid gap-4 rounded-xl border p-4">
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Campo id="ausencia-de" rotulo="De" erro={erros.de}>
          <CampoData id="ausencia-de" valor={de} aoMudar={setDe} obrigatorio />
        </Campo>
        <Campo id="ausencia-ate" rotulo="Até" erro={erros.ate}>
          <CampoData id="ausencia-ate" valor={ate} aoMudar={setAte} obrigatorio />
        </Campo>
      </div>
      <Campo id="ausencia-motivo" rotulo="Motivo" erro={erros.motivo}>
        <Input id="ausencia-motivo" className="h-10" maxLength={120} placeholder="Férias, licença, feriado…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoCancelar}>Cancelar</Button>
        <Button type="submit" disabled={enviando}>Salvar ausência</Button>
      </div>
    </form>
  )
}

// Lista, cria, edita e apaga as ausências de uma pessoa (férias, licenças). Quem pode é decidido no banco.
export function GerirAusencias({ pessoa, aoMudar }) {
  const [formulario, setFormulario] = useState(null) // null | 'nova' | ausência
  const [apagando, setApagando] = useState(null)
  const [versao, setVersao] = useState(0)

  const mudou = () => {
    setVersao((v) => v + 1)
    aoMudar?.()
  }

  async function salvar(dados) {
    const resposta = formulario === 'nova'
      ? await criarAusencia({ perfilId: pessoa.id, ...dados })
      : await editarAusencia(formulario.id, dados)
    if (resposta.erro) return resposta
    setFormulario(null)
    mudou()
    return resposta
  }

  return (
    <>
      <AusenciasDaPessoa perfilId={pessoa.id} versao={versao} acoes={(a) => (
        <>
          <AcaoDaLinha nome="Editar" icone={Pencil} onClick={() => setFormulario(a)} />
          <AcaoDaLinha nome="Apagar" icone={Trash2} perigo onClick={() => setApagando(a)} />
        </>
      )} />
      {formulario ? (
        <Formulario key={formulario === 'nova' ? 'nova' : formulario.id} ausencia={formulario === 'nova' ? null : formulario}
          aoSalvar={salvar} aoCancelar={() => setFormulario(null)} />
      ) : (
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={() => setFormulario('nova')}><Plus /> Nova ausência</Button>
        </div>
      )}
      {apagando && (
        <ConfirmarAcao aberto titulo="Apagar esta ausência?" rotuloConfirmar="Apagar"
          descricao={`A ausência de ${formatarDia(apagando.de)} a ${formatarDia(apagando.ate)} (${apagando.motivo}) some, e esses dias voltam a contar na capacidade de ${pessoa.nome}.`}
          aoFechar={() => setApagando(null)}
          aoConfirmar={async () => {
            const resposta = await apagarAusencia(apagando.id)
            if (!resposta.erro) mudou()
            return resposta
          }} />
      )}
    </>
  )
}
