import * as React from 'react'
import { cn } from '@/lib/cn'


type TabsContextValue = { value: string; setValue: (v: string) => void }
const TabsContext = React.createContext<TabsContextValue | null>(null)


interface TabsProps {
value?: string
onValueChange?: (v: string) => void
children: React.ReactNode
className?: string
}


export function Tabs({ value, onValueChange, children, className }: TabsProps) {
const [internal, setInternal] = React.useState(value || '')
React.useEffect(() => { if (value !== undefined) setInternal(value) }, [value])
const setValue = (v: string) => { onValueChange?.(v); if (value === undefined) setInternal(v) }
return (
<TabsContext.Provider value={{ value: value ?? internal, setValue }}>
<div className={className}>{children}</div>
</TabsContext.Provider>
)
}


export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
return <div className={cn('inline-grid gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800', className)} {...props} />
}


export function TabsTrigger({ value, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
const ctx = React.useContext(TabsContext)!
const selected = ctx.value === value
return (
<button
onClick={() => ctx.setValue(value)}
className={cn(
'px-3 py-1.5 text-sm rounded-lg transition',
selected ? 'bg-white dark:bg-zinc-900 shadow font-semibold' : 'opacity-70 hover:opacity-100'
, className)}
{...props}
/>
)
}


export function TabsContent({ value, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
const ctx = React.useContext(TabsContext)!
if (ctx.value !== value) return null
return <div className={className} {...props} />
}
