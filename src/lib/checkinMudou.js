// Aviso de que um check-in mudou (feito, fechado, editado, apagado), para quem mostra o check-in aberto fora da tela em que
// a mudança aconteceu: o selo da barra de cima e as telas com o botão de check-in (auditoria, G2). Só avisa; quem ouve relê
// do banco.
const canal = new EventTarget()

export function avisarQueOCheckinMudou() {
  canal.dispatchEvent(new Event('mudou'))
}

// Devolve a função que para de ouvir (serve de limpeza de um useEffect).
export function aoMudarOCheckin(fazer) {
  canal.addEventListener('mudou', fazer)
  return () => canal.removeEventListener('mudou', fazer)
}
