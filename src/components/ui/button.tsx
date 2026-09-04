"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClassName =
  "flex w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-foreground placeholder:text-muted-foreground";

/** Native selects need extra right padding so the chevron isn't flush to the edge. */
export const selectClassName =
  "select-field flex w-full rounded-md border border-neutral-800 bg-neutral-950 pl-3 text-sm text-foreground";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:brightness-110",
    secondary: "bg-neutral-800 text-foreground hover:bg-neutral-700",
    destructive: "bg-destructive text-white hover:opacity-90",
    outline: "bg-transparent text-foreground hover:bg-neutral-900",
    ghost: "text-muted-foreground hover:bg-neutral-900 hover:text-foreground",
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 text-sm",
    lg: "h-10 px-6",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(inputClassName, "h-9 py-1", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputClassName, "min-h-[80px] py-2", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(selectClassName, "h-9", className)} {...props} />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Primary entity card. Use NestedEntityCard for the one allowed level of nesting. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6",
        className
      )}
      {...props}
    />
  );
}

/** Nested child card (e.g. shots/angles inside a story state). Only valid inside Card. */
export function NestedEntityCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-700/50 bg-[#1e1e1e] p-5",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "error" | "info";
}) {
  const variants = {
    default: "text-muted-foreground",
    success: "text-emerald-400",
    warning: "text-primary",
    error: "text-red-400",
    info: "text-sky-300/90",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
