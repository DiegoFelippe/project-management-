import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NOME_DO_TEMA, useTema } from './useTema'

const ICONE = { claro: Sun, escuro: Moon, sistema: Monitor }

// Botão de tema (barra de cima e tela de login): Claro → Escuro → Sistema.
export default function BotaoTema({ aoTrocar, className }) {
  const { tema, trocarTema } = useTema({ aoTrocar })
  const Icone = ICONE[tema]
  return (
    <Button variant="ghost" size="icon" className={className} onClick={trocarTema}
      aria-label={`Tema: ${NOME_DO_TEMA[tema]}. Clique para trocar`} title={`Tema: ${NOME_DO_TEMA[tema]}`}>
      <Icone />
    </Button>
  )
}
