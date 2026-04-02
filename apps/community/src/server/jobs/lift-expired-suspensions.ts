import "server-only";
import { registerJob } from "@/server/jobs/job-runner";
import { liftExpiredSuspensions } from "@/services/member-discipline-service";

registerJob("lift-expired-suspensions", async () => {
  const now = new Date();
  const lifted = await liftExpiredSuspensions(now);
  if (lifted > 0) {
    console.info(`[lift-expired-suspensions] Lifted ${lifted} expired suspension(s)`);
  }
});
