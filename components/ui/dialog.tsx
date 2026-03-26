"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Dialog({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DialogTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>;
}

function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(className)}>{children}</div>;
}

function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h3>{children}</h3>;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger };
