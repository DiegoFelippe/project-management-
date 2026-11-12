import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog(props) { return <DialogPrimitive.Root data-slot="dialog" {...props} />; }
function DialogTrigger(props) { return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />; }
function DialogPortal(props) { return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />; }
function DialogClose(props) { return <DialogPrimitive.Close data-slot="dialog-close" {...props} />; }
function DialogOverlay({ className, ...props }) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[rgb(15_23_42/0.4)] backdrop-blur-[3px]", className)} {...props} />;
}
function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn("bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border p-6 shadow-lg duration-200 sm:max-w-lg dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.06)]", className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
function DialogHeader({ className, ...props }) { return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />; }
function DialogFooter({ className, ...props }) { return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />; }
function DialogTitle({ className, ...props }) { return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-xl leading-none font-bold tracking-tight [font-stretch:88%]", className)} {...props} />; }
function DialogDescription({ className, ...props }) { return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-muted-foreground text-sm", className)} {...props} />; }

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
