import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[9998] bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef(({ className, children, description, ...props }, ref) => {
  // Garantiza siempre un aria-describedby válido para evitar warnings de Radix.
  // Prioridad:
  // 1. aria-describedby proporcionado externamente (respetado tal cual)
  // 2. description prop -> genera un Description visible
  // 3. Fallback automático sr-only
  const autoDescId = React.useId();
  const rawProvidedAria = props['aria-describedby'];
  // Normalize provided aria to a usable string or null
  const providedAria = typeof rawProvidedAria === 'string' && rawProvidedAria.trim() ? rawProvidedAria.trim() : null;

  let ariaDescribedBy = providedAria || autoDescId;
  const renderInlineDescription = !!description;
  const contentProps = { ...props, 'aria-describedby': ariaDescribedBy };

  // ensure the rendered Content DOM node always has the aria-describedby attribute
  const innerRef = React.useRef(null);
  React.useEffect(() => {
    try {
      const el = innerRef.current;
      if (el && ariaDescribedBy) el.setAttribute('aria-describedby', ariaDescribedBy);
    } catch (e) {}
    // also mirror the DOM node into the forwarded ref
    if (!ref) return;
    if (typeof ref === 'function') {
      try { ref(innerRef.current); } catch (e) {}
    } else {
      try { ref.current = innerRef.current; } catch (e) {}
    }
  }, [ariaDescribedBy, ref]);

  // If the document has an active fullscreen element (map container may be fullscreen),
  // mount the portal inside that element so the dialog is visible above the fullscreen content.
  let portalContainer = undefined;
  try {
    if (typeof document !== 'undefined') {
      portalContainer = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || undefined;
    }
  } catch (e) {}

  return (
    <DialogPortal container={portalContainer}>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={(el) => { innerRef.current = el; if (typeof ref === 'function') try { ref(el); } catch (e) {} else if (ref) try { ref.current = el; } catch (e) {} }}
        className={cn(
      'fixed left-[50%] top-[50%] z-[9999] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          className
        )}
  {...contentProps}
      >
        {/* Always render a Description element with the resolved id. If a visible description
            was provided via the `description` prop, render it; otherwise render a sr-only
            fallback so Radix sees a Description and the warning disappears. */}
        {renderInlineDescription ? (
          <DialogPrimitive.Description id={ariaDescribedBy} className="text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description id={ariaDescribedBy} className="sr-only">
            Diálogo modal
          </DialogPrimitive.Description>
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};