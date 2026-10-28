"use client";

import { useState, useActionState } from "react";
import { PlayIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Alert } from "@/components/common/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cancelScanAction,
  resumeScanAction,
  startScanAction,
} from "@/features/intelligence/actions";
import { initialIntelligenceActionState } from "@/features/intelligence/schemas";

/**
 * Scan launcher — the ONLY trigger for paid provider calls.
 *
 * - Two-step confirmation server-enforced (`confirm=yes`), with the exact
 *   scope and estimated cost shown before anything runs.
 * - NEVER auto-submits; scans never start on load, login or navigation.
 * - When a scan is queued/running the launcher offers Resume/Cancel instead
 *   of a new scan.
 */

export interface LauncherScan {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export function ScanLauncher({
  domainId,
  domainLabel,
  scansPerDay,
  mockMode,
  activeScan,
  promptCount,
}: {
  domainId: string;
  domainLabel: string;
  scansPerDay: number;
  mockMode: boolean;
  activeScan: LauncherScan | null;
  promptCount: number;
}) {
  const [armed, setArmed] = useState(false);
  const [startState, startFormAction, startPending] = useActionState(
    startScanAction,
    initialIntelligenceActionState
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelScanAction,
    initialIntelligenceActionState
  );
  const [resumeState, resumeFormAction, resumePending] = useActionState(
    resumeScanAction,
    initialIntelligenceActionState
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlayIcon className="size-4" aria-hidden /> Intelligence scan
        </CardTitle>
        <CardDescription>
          One scan checks live Google keyword data and SERPs for your tracked
          questions, then asks each enabled AI engine and measures whether your
          brand is mentioned. Runs only when you start it — never in the
          background.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">up to 10 keywords</Badge>
          <Badge variant="outline">up to 4 live SERPs</Badge>
          <Badge variant="outline">
            {Math.min(promptCount, 10)} prompt(s) × 2 AI engines
          </Badge>
          <Badge variant="outline">
            {mockMode
              ? "mock providers — $0"
              : "≈ $0.03 in search data (est.)"}
          </Badge>
          <Badge variant="secondary">{scansPerDay} scan(s)/day on your plan</Badge>
        </div>

        {activeScan ? (
          <div className="space-y-3">
            <p className="text-sm">
              A scan is currently <span className="font-medium">{activeScan.status}</span>{" "}
              (started {new Date(activeScan.createdAt).toLocaleString()}).
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={resumeFormAction} className="inline-flex">
                <input type="hidden" name="scanId" value={activeScan.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={resumePending}
                >
                  <RotateCcwIcon aria-hidden />
                  {resumePending ? "Resuming…" : "Resume scan"}
                </Button>
              </form>
              <form action={cancelFormAction} className="inline-flex">
                <input type="hidden" name="scanId" value={activeScan.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={cancelPending}
                >
                  <XIcon aria-hidden />
                  {cancelPending ? "Cancelling…" : "Cancel (keep partial data)"}
                </Button>
              </form>
            </div>
            {resumeState.message ? (
              <Alert variant={resumeState.status === "error" ? "error" : "success"}>
                {resumeState.message}
              </Alert>
            ) : null}
            {cancelState.message ? (
              <Alert variant={cancelState.status === "error" ? "error" : "success"}>
                {cancelState.message}
              </Alert>
            ) : null}
          </div>
        ) : (
          <form
            action={startFormAction}
            onSubmit={(event) => {
              if (!armed) {
                event.preventDefault();
                setArmed(true);
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="domainId" value={domainId} />
            {armed ? <input type="hidden" name="confirm" value="yes" /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={startPending}>
                <PlayIcon aria-hidden />
                {startPending
                  ? "Scanning…"
                  : armed
                    ? "Confirm — start paid checks"
                    : "Run scan"}
              </Button>
              {armed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setArmed(false)}
                >
                  Never mind
                </Button>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Scanning {domainLabel}. Costs nothing with mock providers; with
                real providers configured it spends up to the per-scan cap of
                $0.10 and stops there.
              </p>
            </div>
            {startState.message ? (
              <Alert variant={startState.status === "error" ? "error" : "success"}>
                {startState.message}
              </Alert>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
