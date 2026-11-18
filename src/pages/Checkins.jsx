import { useAuth } from '@/auth/useAuth'
import AbasDoCliente from '@/components/clientes/AbasDoCliente'
import Cabecalho from '@/components/comum/Cabecalho'
import ModelosDeCheckin from '@/components/modelos/ModelosDeCheckin'
import { veTudo } from '@/lib/papeis'

// O que cada papel faz com os modelos (Quem faz o quê, no desenho dos modelos de check-in).
function subtitulo(perfil) {
  if (veTudo(perfil)) {
    return 'Os check-lists que o consultor segue em cada cliente. Você cria modelos para todas as consultorias ou para uma só.'
  }
  if (['admin', 'gestor'].includes(perfil.papel)) {
    return 'Os modelos da Central e os da sua consultoria. Você cria e edita os da consultoria; os da Central você duplica e adapta.'
  }
  return 'Os check-lists que a Central e a gestão preparam. Em cada cliente você segue o modelo que foi aplicado.'
}

// As seções da página: com uma só, o conteúdo vem direto (uma barra com uma aba só não diz nada — pedido do Diego,
// 17/11); com duas ou mais, abas de página guardadas em ?aba= (a primeira é a padrão).
export function SecoesDeCheckins({ secoes }) {
  if (secoes.length === 1) return secoes[0].conteudo
  return <AbasDoCliente rotulo="Seções de Check-ins" abas={secoes} />
}

// Item "Check-ins" do trilho, para todos os papéis. Por enquanto só Modelos; o Andamento dos clientes entra na frente
// (e aí as abas aparecem). O cabeçalho não tem botões: a ação principal fica no fim da barra de filtros de cada seção.
export default function Checkins() {
  const { perfil } = useAuth()
  return (
    <>
      <Cabecalho titulo="Check-ins" descricao={subtitulo(perfil)} />
      <SecoesDeCheckins secoes={[{ id: 'modelos', rotulo: 'Modelos', conteudo: <ModelosDeCheckin perfil={perfil} /> }]} />
    </>
  )
}
