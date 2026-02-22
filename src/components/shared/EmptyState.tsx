"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ActionProps = {
  label: string;
  onClick?: () => void;
  href?: string;
};

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction: ActionProps;
  secondaryAction?: ActionProps;
  className?: string;
};

function ActionButton({ action, isPrimary }: { action: ActionProps; isPrimary: boolean }) {
  const baseClasses =
    "inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg font-medium text-base transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
  const primaryClasses = "bg-primary text-primary-foreground hover:bg-primary/90";
  const secondaryClasses = "border border-border bg-background text-foreground hover:bg-muted";

  const classes = cn(baseClasses, isPrimary ? primaryClasses : secondaryClasses);

  if (action.href) {
    return (
      <a href={action.href} className={classes}>
        {action.label}
      </a>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {action.label}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12 px-6 text-center",
        className,
      )}
      role="status"
      aria-label={title}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex flex-col gap-2 max-w-sm">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <ActionButton action={primaryAction} isPrimary={true} />
        {secondaryAction && <ActionButton action={secondaryAction} isPrimary={false} />}
      </div>
    </div>
  );
}

function EmptyStateSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-12 px-6", className)}
      aria-busy="true"
      aria-label="Loading"
    >
      {/* Icon skeleton */}
      <Skeleton className="size-16 rounded-full" />
      {/* Title skeleton */}
      <div className="flex flex-col items-center gap-2 w-full max-w-sm">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-56" />
      </div>
      {/* Action skeleton */}
      <div className="flex gap-3 mt-2">
        <Skeleton className="h-11 w-36 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export { EmptyState, EmptyStateSkeleton };
export type { EmptyStateProps, ActionProps };
