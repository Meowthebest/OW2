import * as React from 'react'


interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
checked?: boolean
onCheckedChange?: (v: boolean) => void
}


export function Checkbox({ checked, onCheckedChange, ...props }: CheckboxProps) {
return (
<input
type="checkbox"
checked={!!checked}
onChange={(e) => onCheckedChange?.(e.target.checked)}
className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-700 dark:text-zinc-100"
{...props}
/>
)
}
