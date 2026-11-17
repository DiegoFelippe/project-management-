// Escala de tamanhos em px, para texto de SVG (gráficos): o SVG não lê as classes do Tailwind.
// São os mesmos valores dos tokens --text-* de src/index.css (design 2026-11-16-tipografia); mudou lá, muda aqui.
export const TAMANHO = {
  titulo: 20,
  destaque: 26,
  janela: 15,
  subtitulo: 14,
  corpo: 13.5,
  rotulo: 12.5,
  legenda: 11,
  mini: 10.5,
}

export const ALTURA_DA_LINHA = {
  titulo: 28,
  destaque: 32,
  janela: 20,
  subtitulo: 20,
  corpo: 20,
  rotulo: 18,
  legenda: 16,
  mini: 14,
}

// Texto de gráfico nunca fica abaixo disto (é o passo "legenda").
export const MENOR_TEXTO_DE_GRAFICO = TAMANHO.legenda
