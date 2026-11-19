import { useAuth } from '@/auth/useAuth'
import Cabecalho from '@/components/comum/Cabecalho'
import CalendarioDaAgenda from '@/components/calendario/CalendarioDaAgenda'

// Menu Calendário: o título da página e o calendário sem recorte (tudo o que a pessoa vê). O mesmo calendário, recortado
// por cliente, é a aba Agenda da página do cliente.
export default function Calendario() {
  const { perfil } = useAuth()
  return (
    <>
      <Cabecalho titulo="Calendário"
        descricao={perfil.papel === 'pessoa' ? 'Sua agenda e os eventos para os quais você foi convidado.' : 'Reuniões, compromissos, ausências e feriados.'} />
      <CalendarioDaAgenda />
    </>
  )
}
