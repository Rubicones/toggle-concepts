// Adapted from shadcn/ui's official new-york registry (MIT), with Toggle theme classes.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("ui-button", {
  variants: {
    variant: { default: "ui-button-primary", secondary: "ui-button-secondary", outline: "ui-button-outline", ghost: "ui-button-ghost" },
    size: { default: "ui-button-md", sm: "ui-button-sm", icon: "ui-button-icon" },
  }, defaultVariants: { variant: "default", size: "default" },
});
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type, ...props }, ref) => {
  const Component = asChild ? Slot : "button";
  return <Component ref={ref} type={asChild ? undefined : type ?? "button"} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";
