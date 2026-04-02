"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Inline error boundary — catches child render errors
interface ErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends Component<
  { children: ReactNode; fallbackMessage: string },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallbackMessage: string }) {
    super(props);
    this.state = { hasError: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[WidgetSlot] Widget render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {this.props.fallbackMessage}
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

interface WidgetSlotProps {
  enabled: boolean;
  title: string;
  loading?: boolean;
  children?: ReactNode;
}

export function WidgetSlot({ enabled, title, loading = false, children }: WidgetSlotProps) {
  const t = useTranslations("Dashboard");

  if (!enabled) return null;

  if (loading) {
    return (
      <div aria-label={title}>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <WidgetErrorBoundary fallbackMessage={t("widget.error")}>
      <div aria-label={title}>{children}</div>
    </WidgetErrorBoundary>
  );
}
