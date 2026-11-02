/**
 * Drawer — from 21st.dev (@wensity/drawer), built on the Base UI Drawer.
 * Swipe to dismiss, focus trap, scroll lock and portal come from Base UI.
 * Adapted for Tropic Line: brand tokens, square corners, lucide icon, a header slot
 * and a footer slot so the cart can pin its total and checkout button.
 */
import * as React from 'react'
import { Drawer as BaseDrawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DrawerSide = 'bottom' | 'right'

const backdropClass = cn(
  'fixed inset-0 z-[100] bg-[var(--scrim)]',
  'transition-opacity duration-300 ease-[var(--ease-out)]',
  'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
  'motion-reduce:transition-none',
)

const motionBase = cn(
  'transition-[opacity,translate] duration-500 ease-[var(--ease-out)] data-[ending-style]:duration-[250ms]',
  'motion-reduce:transition-none',
)

const sideLayout: Record<DrawerSide, string> = {
  bottom: 'fixed inset-x-0 bottom-0 z-[100] flex max-h-[88svh] w-full flex-col',
  right: 'fixed inset-y-0 right-0 z-[100] flex h-full w-[min(100vw,30rem)] flex-col',
}

const sideMotion: Record<DrawerSide, string> = {
  bottom: cn(
    motionBase,
    'translate-y-[var(--drawer-swipe-movement-y,0px)]',
    'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  ),
  right: cn(
    motionBase,
    'translate-x-[var(--drawer-swipe-movement-x,0px)]',
    'data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
  ),
}

const DrawerContext = React.createContext<{ side: DrawerSide }>({ side: 'right' })

export interface DrawerProps {
  side?: DrawerSide
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Drawer({ side = 'right', open, onOpenChange, children }: DrawerProps) {
  return (
    <DrawerContext.Provider value={{ side }}>
      <BaseDrawer.Root
        modal
        open={open}
        swipeDirection={side === 'bottom' ? 'down' : 'right'}
        onOpenChange={onOpenChange ? (next: boolean) => onOpenChange(next) : undefined}
      >
        {children}
      </BaseDrawer.Root>
    </DrawerContext.Provider>
  )
}

export interface DrawerContentProps {
  children: React.ReactNode
  footer?: React.ReactNode
  title: string
  description?: string
  className?: string
}

export function DrawerContent({ children, footer, title, description, className }: DrawerContentProps) {
  const { side } = React.useContext(DrawerContext)

  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop className={backdropClass} />
      <BaseDrawer.Viewport className="fixed inset-0 z-[100] outline-none">
        <BaseDrawer.Popup
          className={cn(
            sideLayout[side],
            sideMotion[side],
            'bg-bg text-ink outline-none [box-shadow:0_24px_64px_-28px_rgba(33,23,15,0.6)]', // taste-skill-ignore: the drawer floats over the page
            className,
          )}
        >
          <BaseDrawer.Content className="relative flex min-h-0 flex-1 flex-col">
            {side === 'bottom' ? (
              <div className="flex shrink-0 justify-center pt-3 pb-1" aria-hidden="true">
                <span className="h-1.5 w-10 rounded-full bg-muted/40" />
              </div>
            ) : null}

            <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
              <div>
                <BaseDrawer.Title className="text-head leading-none tracking-[-0.02em]">{title}</BaseDrawer.Title>
                {description ? (
                  <BaseDrawer.Description className="mt-2 text-small text-muted">{description}</BaseDrawer.Description>
                ) : null}
              </div>
              <BaseDrawer.Close
                className="inline-flex size-11 shrink-0 items-center justify-center text-ink transition-colors hover:bg-surface"
                aria-label="Close cart"
              >
                <X className="size-5" strokeWidth={1.75} />
              </BaseDrawer.Close>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>

            {footer ? <div className="shrink-0 bg-surface px-6 py-5">{footer}</div> : null}
          </BaseDrawer.Content>
        </BaseDrawer.Popup>
      </BaseDrawer.Viewport>
    </BaseDrawer.Portal>
  )
}

export const DrawerClose = BaseDrawer.Close
