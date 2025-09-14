* as React from 'react'
import { cn } from '@/lib/cn'


export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
return <div className={cn('h-px w-full bg-zinc-200 dark:bg-zinc-800', className)} {...props} />
}
