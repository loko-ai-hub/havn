"use client";

import type { ComponentProps, ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type ComingSoonButtonProps = ComponentProps<typeof Button> & {
  children: ReactNode;
};

export default function ComingSoonButton({ children, onClick, ...props }: ComingSoonButtonProps) {
  return (
    <Button
      type="button"
      {...props}
      onClick={(e) => {
        onClick?.(e);
        toast.info("Coming soon");
      }}
    >
      {children}
    </Button>
  );
}

