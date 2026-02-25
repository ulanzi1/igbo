import "server-only";
import { registerJob } from "@/server/jobs/job-runner";
import { anonymizeAccount, findAccountsPendingAnonymization } from "@/services/gdpr-service";

registerJob("retention-cleanup", async () => {
  const accounts = await findAccountsPendingAnonymization();
  for (const account of accounts) {
    await anonymizeAccount(account.id);
  }
});
