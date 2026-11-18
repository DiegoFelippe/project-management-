import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// o principal é o azul da marca. Regra do projeto (CLAUDE.md): todo botão anima — sobe 1px e ganha sombra no
// hover, o ícone dá um pulinho ("botao-animado" em index.css) e ao apertar ele afunda. Em tela de toque
// (pointer-coarse) todo botão tem 44 px de altura, e os de ícone 44 px de largura (auditoria, G5); no computador nada muda.
const buttonVariants = cva(
  "botao-animado inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-corpo font-semibold transition-[color,background-color,border-color,box-shadow,filter,translate,scale] duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive aria-busy:opacity-70 aria-busy:pointer-events-none pointer-coarse:min-h-11",
  {
    variants: {
      variant: {
        default: "bg-primary-cheio text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_4px_12px_-4px] shadow-primary/55 hover:bg-primary-cheio/90 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_18px_-6px] active:bg-primary-cheio",
        destructive: "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_4px_12px_-4px] shadow-destructive/55 hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline: "border bg-card text-foreground/80 shadow-xs hover:border-primary/35 hover:bg-accent hover:text-accent-foreground dark:bg-input/20 dark:border-input dark:hover:border-primary/45 dark:hover:bg-input/40",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "text-muted-foreground font-medium hover:text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
        link: "text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-8 rounded-lg pointer-coarse:min-w-11",
        "icon-sm": "size-8 rounded-lg pointer-coarse:min-w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button };
