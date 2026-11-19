import { juntarIds, useCampo } from "@/components/campos/contextoDoCampo";
import { cn } from "@/lib/utils";

// Dentro de um Campo com erro (usabilidade, U2), o campo do rótulo (o mesmo id) ganha aria-invalid (a borda vermelha
// do .input) e aria-describedby com a dica e o erro.
function Input({ className, type, ...props }) {
  const campo = useCampo(props.id);
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "input texto-de-campo h-9 min-w-0 file:text-foreground selection:bg-primary-cheio selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-corpo file:font-medium disabled:pointer-events-none",
        className,
      )}
      {...props}
      aria-invalid={props["aria-invalid"] ?? (campo.invalido || undefined)}
      aria-describedby={juntarIds(props["aria-describedby"], campo.descritoPor)}
    />
  );
}

export { Input };
