import { juntarIds, useCampo } from "@/components/campos/contextoDoCampo";
import { cn } from "@/lib/utils";

// Campo de texto de várias linhas do app (auditoria de 17/11, C8): o mesmo .input dos outros campos (borda, foco azul do
// projeto e 44 px no toque) e a .texto-de-campo (16 px no celular, para o iPhone não dar zoom). Cresce só para baixo;
// `className` ajusta (ex.: resize-none). Tamanho da escala só com `sm:`, senão o iPhone volta a dar zoom. Dentro de um
// Campo com erro, fica marcado (aria-invalid) e descrito pelo erro, como o Input.
function Textarea({ className, ...props }) {
  const campo = useCampo(props.id);
  return (
    <textarea data-slot="textarea" className={cn("input texto-de-campo resize-y", className)} {...props}
      aria-invalid={props["aria-invalid"] ?? (campo.invalido || undefined)}
      aria-describedby={juntarIds(props["aria-describedby"], campo.descritoPor)} />
  );
}

export { Textarea };
