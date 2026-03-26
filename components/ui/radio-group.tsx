"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type RadioGroupContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue>({});

function RadioGroup({
  className,
  value,
  onValueChange,
  children,
}: {
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div className={cn(className)}>{children}</div>
    </RadioGroupContext.Provider>
  );
}

function RadioGroupItem({
  className,
  value,
  id,
}: {
  className?: string;
  value: string;
  id?: string;
}) {
  const ctx = React.useContext(RadioGroupContext);
  return (
    <input
      id={id}
      type="radio"
      checked={ctx.value === value}
      onChange={() => ctx.onValueChange?.(value)}
      className={cn("h-4 w-4 accent-primary", className)}
    />
  );
}

export { RadioGroup, RadioGroupItem };
