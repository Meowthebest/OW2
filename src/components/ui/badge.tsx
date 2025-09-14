import * as React from 'react'
import { cn } from '@/lib/cn'


type Variant = 'secondary' | 'outline' | 'default'


export const Badge = ({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) => {
const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium'
const styles: Record<Variant, string> = {
default: 'border-transparent bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
secondary: 'border-transparent bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
outline: 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200',
}
return <span className={cn(base, styles[variant], className)} {...props} />
}
