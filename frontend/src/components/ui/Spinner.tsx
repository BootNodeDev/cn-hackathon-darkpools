import { cn } from '@/utils/cn'

// Accessible loading spinner. `tone` picks the ring color against its background.
export const Spinner = ({
  size = 'md',
  tone = 'foreground',
  label = 'Loading',
}: {
  size?: 'sm' | 'md' | 'lg'
  tone?: 'foreground' | 'background' | 'primary' | 'brand'
  label?: string
}): JSX.Element => {
  const ring = {
    foreground: 'border-foreground/30 border-t-foreground',
    background: 'border-background/30 border-t-background',
    primary: 'border-primary-foreground/30 border-t-primary-foreground',
    brand: 'border-primary/25 border-t-primary',
  }[tone]
  const dimension = { sm: 'size-3.5', md: 'size-4', lg: 'size-8' }[size]
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-block animate-spin rounded-full border-2', dimension, ring)}
    />
  )
}
