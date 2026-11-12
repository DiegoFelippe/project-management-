import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// o principal é o azul da marca. Regra do projeto (CLAUDE.md): todo botão anima — sobe 1px e ganha sombra no
// hover, o ícone dá um pulinho ("botao-animado" em index.css) e ao apertar ele afunda.
const buttonVariants = cva(
  "botao-animado inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow,filter,translate,scale] duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive aria-busy:opacity-70 aria-busy:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px] shadow-primary/60 hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_8px_20px_-10px] shadow-destructive/70 hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline: "border bg-card shadow-xs hover:border-primary/35 hover:bg-accent hover:text-accent-foreground dark:bg-input/20 dark:border-input dark:hover:border-primary/45 dark:hover:bg-input/40",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/60",
        link: "text-primary underline-offset-4 hover:underline active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 text-[15px] has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
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
