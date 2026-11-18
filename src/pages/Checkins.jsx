import { useAuth } from '@/auth/useAuth'
import AndamentoDosClientes from '@/components/checkins/AndamentoDosClientes'
import AbasDoCliente from '@/components/clientes/AbasDoCliente'
import Cabecalho from '@/components/comum/Cabecalho'
import ModelosDeCheckin from '@/components/modelos/ModelosDeCheckin'
import { veTudo } from '@/lib/papeis'

// O que cada papel acompanha no Andamento e faz com os modelos (Quem faz o quê, no desenho dos modelos de check-in).
function subtitulo(perfil) {
  if (veTudo(perfil)) {
    return 'O andamento do check-list em cada cliente e os modelos que o consultor segue. Você cria modelos para todas as consultorias ou para uma só.'
  }
  if (['admin', 'gestor'].includes(perfil.papel)) {
    return 'O andamento do check-list nos clientes da consultoria e os modelos: os da Central e os seus. Você cria e edita os da consultoria; os da Central você duplica e adapta.'
  }
  return 'O que falta em cada cliente seu e os check-lists que a Central e a gestão preparam. Em cada cliente você segue o modelo que foi aplicado.'
}

// As seções da página: com uma só, o conteúdo vem direto (uma barra com uma aba só não diz nada — pedido do Diego,
// 17/11); com duas ou mais, abas de página guardadas em ?aba= (a primeira é a padrão).
export function SecoesDeCheckins({ secoes }) {
  if (secoes.length === 1) return secoes[0].conteudo
  return <AbasDoCliente rotulo="Seções de Check-ins" abas={secoes} />
}

// Item "Check-ins" do trilho, para todos os papéis: Andamento (a primeira; o consultor vê os clientes dele) e Modelos. O
// cabeçalho não tem botões: a ação principal fica no fim da barra de filtros de cada seção.
export default function Checkins() {
  const { perfil } = useAuth()
  return (
    <>
      <Cabecalho titulo="Check-ins" descricao={subtitulo(perfil)} />
      <SecoesDeCheckins secoes={[
        { id: 'andamento', rotulo: 'Andamento', conteudo: <AndamentoDosClientes perfil={perfil} /> },
        { id: 'modelos', rotulo: 'Modelos', conteudo: <ModelosDeCheckin perfil={perfil} /> },
      ]} />
    </>
  )
}
