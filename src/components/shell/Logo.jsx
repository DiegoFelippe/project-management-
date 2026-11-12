import { cn } from '@/lib/utils'

export default function Logo({ className }) {
  return (
    <span
      role="img"
      aria-label="Consultoria"
      className={cn(
        'grid size-10 place-items-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground shadow-[0_6px_16px_-6px] shadow-primary/60',
        className,
      )}
    >
      C
    </span>
  )
}
