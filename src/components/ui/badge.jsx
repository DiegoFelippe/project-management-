import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-rotulo font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-cheio text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground dark:bg-secondary/80",
        destructive: "border-transparent bg-destructive-cheio text-sobre-destructive",
        outline: "text-foreground",
        // Selos de estado sólidos (cores vivas, 19/11): o cheio do estado com o "sobre" por cima.
        notice: "border-transparent bg-notice-cheio text-sobre-notice",
        positive: "border-transparent bg-positive-cheio text-sobre-positive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
