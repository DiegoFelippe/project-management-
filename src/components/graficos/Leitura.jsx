// A frase curta embaixo do título de um gráfico (a "leitura"), com o número que importa em negrito. As partes vêm de
// src/lib/frasesDosGraficos.js: texto corrido ou { forte: texto }.
export default function Leitura({ partes }) {
  if (!partes?.length) return null
  return (
    <p className="mt-0.5 text-rotulo text-muted-foreground">
      {partes.map((parte, i) => (typeof parte === 'string'
        ? parte
        : <b key={i} className="font-semibold text-foreground">{parte.forte}</b>))}
    </p>
  )
}
