"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface AffectedMember {
  id: string;
  email: string;
  name: string | null;
  accountStatus: string;
  createdAt: string;
}

export default function BreachResponsePage() {
  const t = useTranslations("Admin.breachResponse");

  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [members, setMembers] = useState<AffectedMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState("");

  const [notificationMessage, setNotificationMessage] = useState("");
  const [incidentTimestamp, setIncidentTimestamp] = useState(new Date().toISOString());
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState("");

  const fetchAffectedMembers = async () => {
    if (!since || !until) {
      setMemberError(t("dateRequired"));
      return;
    }
    setLoadingMembers(true);
    setMemberError("");
    try {
      const res = await fetch(
        `/api/v1/admin/breach-response/affected-members?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      );
      const data = (await res.json()) as { data?: { members?: AffectedMember[] }; title?: string };
      if (!res.ok) {
        setMemberError(data.title ?? t("networkError"));
      } else {
        setMembers(data.data?.members ?? []);
      }
    } catch {
      setMemberError(t("networkError"));
    } finally {
      setLoadingMembers(false);
    }
  };

  const sendNotifications = async () => {
    if (members.length === 0 || !notificationMessage) return;
    setNotifying(true);
    setNotifyResult("");
    try {
      const res = await fetch("/api/v1/admin/breach-response/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: members.map((m) => m.id),
          incidentTimestamp,
          notificationMessage,
        }),
      });
      const data = (await res.json()) as { data?: { message?: string }; title?: string };
      if (!res.ok) {
        setNotifyResult(`Error: ${data.title ?? t("networkError")}`);
      } else {
        setNotifyResult(data.data?.message ?? "");
      }
    } catch {
      setNotifyResult(t("networkError"));
    } finally {
      setNotifying(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">{t("heading")}</h1>

      {/* Step 1: Affected Member List */}
      <section className="mb-8 bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t("step1Title")}</h2>
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">{t("sinceLabel")}</label>
            <input
              type="datetime-local"
              className="bg-gray-700 text-white rounded px-3 py-2"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">{t("untilLabel")}</label>
            <input
              type="datetime-local"
              className="bg-gray-700 text-white rounded px-3 py-2"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => void fetchAffectedMembers()}
          disabled={loadingMembers}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loadingMembers ? t("loading") : t("generateButton")}
        </button>
        {memberError && <p className="text-red-400 mt-2">{memberError}</p>}
        {members.length > 0 && (
          <div className="mt-4">
            <p className="text-gray-300 mb-2">{t("membersFound", { count: members.length })}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-300">
                <thead>
                  <tr className="text-left border-b border-gray-600">
                    <th className="py-2 pr-4">{t("columnEmail")}</th>
                    <th className="py-2 pr-4">{t("columnName")}</th>
                    <th className="py-2">{t("columnStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-gray-700">
                      <td className="py-2 pr-4">{m.email}</td>
                      <td className="py-2 pr-4">{m.name ?? t("noName")}</td>
                      <td className="py-2">{m.accountStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Bulk Notification */}
      <section className="mb-8 bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">{t("step2Title")}</h2>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">{t("incidentTimestampLabel")}</label>
          <input
            type="text"
            className="bg-gray-700 text-white rounded px-3 py-2 w-full"
            value={incidentTimestamp}
            onChange={(e) => setIncidentTimestamp(e.target.value)}
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">
            {t("notificationMessageLabel")}
          </label>
          <textarea
            className="bg-gray-700 text-white rounded px-3 py-2 w-full h-32"
            value={notificationMessage}
            onChange={(e) => setNotificationMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
          />
        </div>
        <button
          onClick={() => void sendNotifications()}
          disabled={notifying || members.length === 0 || !notificationMessage}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {notifying ? t("sending") : t("sendButton", { count: members.length })}
        </button>
        {notifyResult && <p className="text-green-400 mt-2">{notifyResult}</p>}
        <p className="text-yellow-400 text-sm mt-4">{t("gdprWarning")}</p>
      </section>
    </div>
  );
}
