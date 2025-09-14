import * as React from 'react'
import { cn } from '@/lib/cn'


export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cn('rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm', className)} {...props} />
)


export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cn('p-4 sm:p-5', className)} {...props} />
)


export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cn('text-lg font-semibold', className)} {...props} />
)


export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
<div className={cn('p-4 sm:p-5 pt-0', className)} {...props} />
)
