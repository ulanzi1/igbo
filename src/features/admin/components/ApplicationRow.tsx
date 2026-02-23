"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AuthUser } from "@/db/schema/auth-users";
import {
  useApproveApplication,
  useRequestInfo,
  useRejectApplication,
  useUndoAction,
} from "@/features/admin/hooks/use-approvals";

type AccountStatus = "PENDING_APPROVAL" | "APPROVED" | "INFO_REQUESTED" | "REJECTED";

function getStatusVariant(
  status: string,
): "default" | "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "PENDING_APPROVAL":
      return "default";
    case "APPROVED":
      return "success";
    case "INFO_REQUESTED":
      return "warning";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

function getCulturalStrength(culturalConnection: string | null): "Strong" | "Unclear" | "Weak" {
  const len = culturalConnection?.trim().length ?? 0;
  if (len >= 200) return "Strong";
  if (len >= 50) return "Unclear";
  return "Weak";
}

interface ApplicationRowProps {
  application: AuthUser;
  isActive: boolean;
  onNext: () => void;
}

const UNDO_SECONDS = 30;

export function ApplicationRow({ application, isActive, onNext }: ApplicationRowProps) {
  const t = useTranslations("Admin");
  const rowRef = useRef<HTMLTableRowElement>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [showInfoInput, setShowInfoInput] = useState(false);

  const approveMutation = useApproveApplication();
  const requestInfoMutation = useRequestInfo();
  const rejectMutation = useRejectApplication();
  const undoMutation = useUndoAction();

  // Focus row when active
  useEffect(() => {
    if (isActive) {
      rowRef.current?.focus();
    }
  }, [isActive]);

  // Clean up undo timers on unmount
  useEffect(() => {
    return () => {
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const startUndo = useCallback(
    (appliedStatus: AccountStatus) => {
      // Clear any existing timers
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

      let remaining = UNDO_SECONDS;
      const toastId = toast(t("approvals.undoMessage", { seconds: remaining }), {
        duration: UNDO_SECONDS * 1000,
        action: {
          label: t("approvals.undo"),
          onClick: () => {
            undoMutation.mutate({ id: application.id, undoFromStatus: appliedStatus });
            toast.dismiss(toastId);
          },
        },
      });

      undoIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
          undoIntervalRef.current = null;
          return;
        }
        toast(t("approvals.undoMessage", { seconds: remaining }), {
          id: toastId,
          duration: remaining * 1000,
          action: {
            label: t("approvals.undo"),
            onClick: () => {
              undoMutation.mutate({ id: application.id, undoFromStatus: appliedStatus });
              toast.dismiss(toastId);
            },
          },
        });
      }, 1000);

      undoTimeoutRef.current = setTimeout(() => {
        if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
        undoIntervalRef.current = null;
        undoTimeoutRef.current = null;
      }, UNDO_SECONDS * 1000);
    },
    [application.id, t, undoMutation],
  );

  const handleApprove = useCallback(() => {
    approveMutation.mutate(application.id, {
      onSuccess: () => {
        startUndo("APPROVED");
        onNext();
      },
    });
  }, [application.id, approveMutation, startUndo, onNext]);

  const handleReject = useCallback(() => {
    rejectMutation.mutate(
      { id: application.id },
      {
        onSuccess: () => {
          startUndo("REJECTED");
          onNext();
        },
      },
    );
  }, [application.id, rejectMutation, startUndo, onNext]);

  const handleRequestInfo = useCallback(() => {
    if (!showInfoInput) {
      setShowInfoInput(true);
      return;
    }
    if (!infoMessage.trim()) return;
    requestInfoMutation.mutate(
      { id: application.id, message: infoMessage.trim() },
      {
        onSuccess: () => {
          startUndo("INFO_REQUESTED");
          setShowInfoInput(false);
          setInfoMessage("");
          onNext();
        },
      },
    );
  }, [showInfoInput, infoMessage, application.id, requestInfoMutation, startUndo, onNext]);

  // Keyboard shortcuts on the focused row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isActive) return;
      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault();
          handleApprove();
          break;
        case "r":
          e.preventDefault();
          handleReject();
          break;
        case "m":
          e.preventDefault();
          handleRequestInfo();
          break;
        case "n":
          e.preventDefault();
          onNext();
          break;
      }
    },
    [isActive, handleApprove, handleReject, handleRequestInfo, onNext],
  );

  const culturalStrength = getCulturalStrength(application.culturalConnection);
  const statusKey =
    {
      PENDING_APPROVAL: "statusPending",
      APPROVED: "statusApproved",
      INFO_REQUESTED: "statusInfoRequested",
      REJECTED: "statusRejected",
    }[application.accountStatus as AccountStatus] ?? "statusPending";

  const culturalStrengthKey = {
    Strong: "culturalStrengthStrong",
    Unclear: "culturalStrengthUnclear",
    Weak: "culturalStrengthWeak",
  }[culturalStrength] as
    | "culturalStrengthStrong"
    | "culturalStrengthUnclear"
    | "culturalStrengthWeak";

  const isBusy =
    approveMutation.isPending || requestInfoMutation.isPending || rejectMutation.isPending;

  return (
    <tr
      ref={rowRef}
      tabIndex={isActive ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-keyshortcuts="a r m n"
      className={`border-b border-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive ? "bg-zinc-700/50" : "hover:bg-zinc-800/50"
      }`}
    >
      <td className="px-4 py-3">
        <div className="font-medium text-white">{application.name ?? "—"}</div>
        <div className="text-sm text-zinc-400">{application.email}</div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-300">
        {[application.locationCity, application.locationState, application.locationCountry]
          .filter(Boolean)
          .join(", ") || "—"}
        {application.locationCountry && (
          <span className="ml-1 text-xs text-zinc-500">({t("approvals.locationPrefilled")})</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge
          variant={
            culturalStrength === "Strong"
              ? "success"
              : culturalStrength === "Unclear"
                ? "warning"
                : "destructive"
          }
        >
          {t(`approvals.${culturalStrengthKey}`)}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={getStatusVariant(application.accountStatus)}>
          {t(`approvals.${statusKey}`)}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {showInfoInput ? (
            <div className="flex flex-col gap-2 w-full">
              <label className="text-xs text-zinc-400" htmlFor={`info-msg-${application.id}`}>
                {t("approvals.infoMessageLabel")}
              </label>
              <textarea
                id={`info-msg-${application.id}`}
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder={t("approvals.infoMessagePlaceholder")}
                rows={2}
                className="w-full rounded bg-zinc-700 border border-zinc-600 text-white text-sm p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleRequestInfo}
                  disabled={isBusy || !infoMessage.trim()}
                  aria-label={t("approvals.requestInfo")}
                >
                  {t("approvals.requestInfo")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowInfoInput(false);
                    setInfoMessage("");
                  }}
                >
                  {/* cancel icon */}✕
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={handleApprove}
                disabled={isBusy}
                aria-label={t("approvals.approve")}
              >
                {t("approvals.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRequestInfo}
                disabled={isBusy}
                aria-label={t("approvals.requestInfo")}
              >
                {t("approvals.requestInfo")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isBusy}
                aria-label={t("approvals.reject")}
              >
                {t("approvals.reject")}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
