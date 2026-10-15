"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Application error boundary. Shows a safe message; details are logged
 * client-side but never rendered (they could contain sensitive state).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, hook into monitoring here (Sentry etc.).
    console.error("Application error boundary triggered", error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <span className="bg-destructive/10 text-destructive mx-auto flex size-12 items-center justify-center rounded-full">
          <AlertTriangleIcon className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred. Your data is safe — try again, or come
          back in a few minutes.
          {error.digest ? (
            <span className="text-muted-foreground/70 mt-1 block font-mono text-xs">
              Reference: {error.digest}
            </span>
          ) : null}
        </p>
        <Button onClick={reset} variant="outline">
          <RotateCcwIcon className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    </div>
  );
}
