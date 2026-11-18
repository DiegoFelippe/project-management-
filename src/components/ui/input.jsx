import { cn } from "@/lib/utils";

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "input texto-de-campo h-9 min-w-0 file:text-foreground selection:bg-primary-cheio selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-corpo file:font-medium disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
