import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out transform-gpu focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 disabled:hover:brightness-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.04] active:scale-[0.97] will-change-transform",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/30 hover:brightness-110",
        outline:
          "border border-input shadow-sm hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:border-primary/60",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md hover:brightness-110",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:scale-[1.02]",
        link:
          "text-primary underline-offset-4 hover:underline hover:scale-100 active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, onClick, children, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  const [ripples, setRipples] = React.useState([]);
  const skipRipple = asChild || variant === "link";

  const handleClick = (e) => {
    if (!skipRipple && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const rect = e.currentTarget.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - diameter / 2;
      const y = e.clientY - rect.top - diameter / 2;
      const id = Date.now() + Math.random();
      setRipples((prev) => [...prev, { id, x, y, size: diameter }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 600);
    }
    if (onClick) onClick(e);
  };

  const classes = cn(
    buttonVariants({ variant, size, className }),
    !skipRipple && "overflow-hidden"
  );

  return (
    <Comp className={classes} ref={ref} onClick={handleClick} {...props}>
      {children}
      {!skipRipple && ripples.map((r) => (
        <span
          key={r.id}
          className="ripple-span"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </Comp>
  );
});

export { Button, buttonVariants }
