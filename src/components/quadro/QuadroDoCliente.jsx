import { useCallback, useState } from 'react'
import { quadroDoCliente, quadroPorId, quadrosDoCliente } from '@/data/quadro'
import { useAtraso } from '@/lib/useAtraso'
import { veTudo } from '@/lib/papeis'
import QuadroKanban from './QuadroKanban'
import { FILTROS_VAZIOS, useQuadro } from './useQuadro'

// Aba Quadro do cliente: o QuadroKanban com o quadro do cliente (desenho em
// docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md). Quem mexe é o consultor do cliente e a gestão da
// consultoria, com o cliente ativo; a central e o dono só leem e escolhem o quadro de uma consultoria anterior
// (quadros_do_cliente + quadro_por_id); os outros recebem o quadro da consultoria que atende (quadro_do_cliente). Cliente
// arquivado: o quadro é só para ler (o banco recusa a escrita).
export default function QuadroDoCliente({ cliente, perfil }) {
  const central = veTudo(perfil)
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const buscaAtrasada = useAtraso(filtros.busca, 300)
  const ler = useCallback(async (escolhido) => {
    if (!central) return { quadro: await quadroDoCliente(cliente.id) }
    const quadros = await quadrosDoCliente(cliente.id)
    const quero = quadros.find((x) => x.id === escolhido) ?? quadros.find((x) => x.atual) ?? quadros[0]
    return { quadros, quadro: quero ? await quadroPorId(quero.id) : null }
  }, [central, cliente.id])
  const estado = useQuadro({ ler, chave: cliente.id, filtros: { ...filtros, busca: buscaAtrasada } })

  return (
    <QuadroKanban estado={estado} filtros={filtros} aoFiltrar={setFiltros} perfil={perfil} seletorDeConsultoria={central}
      motivoSomenteLeitura={cliente.arquivado ? 'Cliente arquivado: o quadro é só para ler.' : null}
      vazio={central ? 'Nenhuma consultoria abriu o quadro deste cliente ainda.' : 'Este cliente não tem quadro.'} />
  )
}
