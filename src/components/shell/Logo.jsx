import { cn } from '@/lib/utils'

// Logo da IXC Consult (quadrada, com a moldura preta dela mesma).
export default function Logo({ className }) {
  return (
    <img src="/logo-ixc-consult.png" alt="IXC Consult" width="40" height="40"
      className={cn('size-10 bg-white shadow-[0_4px_12px_-4px_rgb(15_23_42/0.35)]', className)} />
  )
}
