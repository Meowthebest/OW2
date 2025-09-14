import * as React from 'react'
import { cn } from '@/lib/cn'


interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
checked: boolean
onCheckedChange?: (value: boolean) => void
}


export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
({ checked, onCheckedChange, className, disabled, ...props }, ref) => {
return (
<button
ref={ref}
role="switch"
aria-checked={checked}
disabled={disabled}
onClick={() => onCheckedChange?.(!checked)}
className={cn(
'relative inline-flex h-6 w-10 items-center rounded-full p-0.5 transition',
checked ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700',
'disabled:opacity-50 disabled:cursor-not-allowed',
className
)}
{...props}
>
<span
className={cn(
'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
checked ? 'translate-x-4' : 'translate-x-0'
)}
/>
</button>
)
}
)
Switch.displayName = 'Switch'
