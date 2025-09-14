import * as React from 'react'
import { cn } from '@/lib/cn'


interface SelectCtx {
value?: string
onChange?: (v: string) => void
open: boolean
setOpen: (v: boolean) => void
register: (v: string, label: string) => void
labels: Record<string, string>
}
const Ctx = React.createContext<SelectCtx | null>(null)


interface RootProps {
value?: string
onValueChange?: (v: string) => void
children: React.ReactNode
className?: string
}


export function Select({ value, onValueChange, children, className }: RootProps) {
const [open, setOpen] = React.useState(false)
const [labels, setLabels] = React.useState<Record<string, string>>({})
const register = (v: string, label: string) => setLabels((p) => ({ ...p, [v]: label }))
return (
<Ctx.Provider value={{ value, onChange: onValueChange, open, setOpen, register, labels }}>
<div className={cn('relative', className)}>{children}</div>
</Ctx.Provider>
)
}


export function SelectTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
const ctx = React.useContext(Ctx)!
return (
<button
type="button"
onClick={() => ctx.setOpen(!ctx.open)}
className={cn('flex h-10 w-full items-center justify-between rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700', className)}
{...props}
>
{children}
</button>
)
}


export function SelectValue({ placeholder }: { placeholder?: string }) {
const ctx = React.useContext(Ctx)!
const label = (ctx.value && ctx.labels[ctx.value]) || ''
return <span className="truncate text-left text-sm opacity-90">{label || placeholder || 'Select…'}</span>
}


export function SelectContent({ className, children }: { className?: string; children: React.ReactNode }) {
const ctx = React.useContext(Ctx)!
if (!ctx.open) return null
return (
<div className={cn('absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 text-sm shadow dark:border-zinc-800 dark:bg-zinc-900', className)}>
{children}
</div>
)
}


export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
const ctx = React.useContext(Ctx)!
const label = String(children)
React.useEffect(() => { ctx.register(value, label) }, [value, label])
return (
<div
role="option"
onClick={() => { ctx.onChange?.(value); ctx.setOpen(false) }}
className="cursor-pointer rounded-lg px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
>
{children}
</div>
)
}
