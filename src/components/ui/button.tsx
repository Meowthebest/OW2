import * as React from 'react'
import { cn } from '@/lib/cn'


type Variant = 'default' | 'secondary' | 'outline' | 'destructive'
type Size = 'default' | 'sm' | 'icon'


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
variant?: Variant
size?: Size
}


export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
({ className, variant = 'default', size = 'default', ...props }, ref) => {
const base = 'inline-flex items-center justify-center rounded-2xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'
const sizes: Record<Size, string> = {
default: 'h-10 px-4 py-2 text-sm',
sm: 'h-8 px-3 text-sm',
icon: 'h-9 w-9 p-0',
}
const variants: Record<Variant, string> = {
default: 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
outline: 'border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800',
destructive: 'bg-red-600 text-white hover:bg-red-700',
}
return (
<button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...props} />
)
}
)
Button.displayName = 'Button'
