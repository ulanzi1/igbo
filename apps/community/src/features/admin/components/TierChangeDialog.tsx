"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useChangeMemberTier,
  type AdminMember,
  type MembershipTier,
} from "@/features/admin/hooks/use-members";

interface TierChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: AdminMember;
}

const TIER_OPTIONS: MembershipTier[] = ["BASIC", "PROFESSIONAL", "TOP_TIER"];

export function TierChangeDialog({ open, onOpenChange, member }: TierChangeDialogProps) {
  const t = useTranslations("Admin.members");
  const [selectedTier, setSelectedTier] = useState<MembershipTier>(member.membershipTier);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const changeTier = useChangeMemberTier();

  function getTierLabel(tier: MembershipTier) {
    const map: Record<MembershipTier, string> = {
      BASIC: t("tierFilter.basic"),
      PROFESSIONAL: t("tierFilter.professional"),
      TOP_TIER: t("tierFilter.topTier"),
    };
    return map[tier];
  }

  async function handleConfirm() {
    setSuccessMsg("");
    setErrorMsg("");
    try {
      await changeTier.mutateAsync({ id: member.id, tier: selectedTier });
      setSuccessMsg(t("changeTier.success"));
      setTimeout(() => onOpenChange(false), 1500);
    } catch {
      setErrorMsg(t("changeTier.error"));
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSuccessMsg("");
      setErrorMsg("");
      setSelectedTier(member.membershipTier);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changeTier.title")}</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <p className="text-sm text-zinc-400 mb-1">{t("changeTier.currentTier")}</p>
            <p className="font-medium">{getTierLabel(member.membershipTier)}</p>
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">{t("changeTier.newTier")}</p>
            <div className="space-y-2">
              {TIER_OPTIONS.map((tier) => (
                <label
                  key={tier}
                  className="flex items-center gap-3 cursor-pointer rounded-md p-2 hover:bg-zinc-800"
                >
                  <input
                    type="radio"
                    name="tier"
                    value={tier}
                    checked={selectedTier === tier}
                    onChange={() => setSelectedTier(tier)}
                    className="accent-blue-500"
                  />
                  <span>{getTierLabel(tier)}</span>
                </label>
              ))}
            </div>
          </div>

          {successMsg && <p className="text-green-400 text-sm">{successMsg}</p>}
          {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={() => handleOpenChange(false)}
            className="rounded-md px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white"
            disabled={changeTier.isPending}
          >
            {t("changeTier.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={changeTier.isPending || selectedTier === member.membershipTier}
            className="rounded-md px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changeTier.isPending ? "…" : t("changeTier.confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
