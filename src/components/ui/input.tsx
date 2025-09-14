import * as React from 'react'
import { cn } from '@/lib/cn'


export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}


export const Input = React.forwardRef<HTMLInputElement, InputProps>(
({ className, ...props }, ref) => (
<input
ref={ref}
className={cn(
'h-10 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-sm outline-none ring-0 focus:border-zinc-400 dark:border-zinc-700',
className
)}
{...props}
/>
)
)
Input.displayName = 'Input'
