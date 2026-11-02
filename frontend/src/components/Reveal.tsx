import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'

// Section entrance: children rise 24px and fade in, staggered 80ms, once.
export function Reveal({
  children,
  className,
  as = 'div',
  delay = 0,
  ...rest
}: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'ul' | 'ol' | 'header'; delay?: number } & Omit<
  HTMLMotionProps<'div'>,
  'children'
>) {
  const reduce = useReducedMotion()
  const Tag = motion[as] as typeof motion.div
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ staggerChildren: 0.08, delayChildren: delay }}
      {...rest}
    >
      {children}
      {reduce ? null : null}
    </Tag>
  )
}

export const rise = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1] as const } },
}

export function Item({
  children,
  className,
  as = 'div',
  ...rest
}: { children: ReactNode; className?: string; as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'figure' | 'ul' | 'dl' } & Omit<
  HTMLMotionProps<'div'>,
  'children'
>) {
  const reduce = useReducedMotion()
  const Tag = motion[as] as typeof motion.div
  return (
    <Tag className={className} variants={reduce ? { hidden: { opacity: 1 }, shown: { opacity: 1 } } : rise} {...rest}>
      {children}
    </Tag>
  )
}
