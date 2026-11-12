import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// gaveta lateral (menu no celular)
function Sheet(props) { return <SheetPrimitive.Root data-slot="sheet" {...props} />; }
function SheetTrigger(props) { return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />; }
function SheetClose(props) { return <SheetPrimitive.Close data-slot="sheet-close" {...props} />; }
function SheetContent({ className, children, side = "left", ...props }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[rgb(15_23_42/0.4)] backdrop-blur-[3px]" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn("bg-moldura data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-300",
          side === "left" && "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-auto",
          side === "right" && "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 sm:max-w-sm",
          side === "bottom" && "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto max-h-[85dvh] rounded-t-xl",
          className)}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
function SheetTitle({ className, ...props }) { return <SheetPrimitive.Title className={cn("text-foreground font-semibold", className)} {...props} />; }
function SheetDescription({ className, ...props }) { return <SheetPrimitive.Description className={cn("text-muted-foreground text-sm", className)} {...props} />; }

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
