import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Os tamanhos nomeados da escala (index.css) são tamanho de fonte: sem isto o twMerge os trata como cor
// (text-corpo × text-primary) e apaga um dos dois.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["titulo", "destaque", "janela", "subtitulo", "corpo", "rotulo", "legenda", "mini"] }],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
