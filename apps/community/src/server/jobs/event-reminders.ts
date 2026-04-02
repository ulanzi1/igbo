import "server-only";
import { registerJob } from "@/server/jobs/job-runner";
import { eventBus } from "@/services/event-bus";
import {
  listEventsNeedingReminder,
  listRegisteredAttendeeUserIds,
  markReminderSent,
} from "@igbo/db/queries/events";

// Reminder windows: [windowStartMs, windowEndMs] = [farthest, closest] before start
// A 5-minute invocation cadence means each scan covers ±2.5 minutes of slack.
const REMINDER_WINDOWS = [
  {
    type: "24h" as const,
    windowStartMs: 24 * 60 * 60 * 1000 + 5 * 60 * 1000,
    windowEndMs: 24 * 60 * 60 * 1000 - 5 * 60 * 1000,
  },
  {
    type: "1h" as const,
    windowStartMs: 60 * 60 * 1000 + 5 * 60 * 1000,
    windowEndMs: 60 * 60 * 1000 - 5 * 60 * 1000,
  },
  {
    type: "15m" as const,
    windowStartMs: 15 * 60 * 1000 + 5 * 60 * 1000,
    windowEndMs: 15 * 60 * 1000 - 5 * 60 * 1000,
  },
] as const;

registerJob("event-reminders", async () => {
  for (const { type, windowStartMs, windowEndMs } of REMINDER_WINDOWS) {
    const events = await listEventsNeedingReminder(type, windowStartMs, windowEndMs);

    for (const event of events) {
      // Skip cancelled events (should not be in results but double-check)
      if (event.status === "cancelled") continue;

      try {
        const attendeeUserIds = await listRegisteredAttendeeUserIds(event.id);

        for (const userId of attendeeUserIds) {
          await eventBus.emit("event.reminder", {
            eventId: event.id,
            userId,
            reminderType: type,
            title: event.title,
            startTime: event.startTime.toISOString(),
            timestamp: new Date().toISOString(),
          });
        }

        // Mark this reminder type as sent (idempotency)
        await markReminderSent(event.id, type);
      } catch (err) {
        console.error(
          `[event-reminders] Failed to send ${type} reminder for event ${event.id}:`,
          err,
        );
        // Continue to next event — don't block remaining reminders
      }
    }
  }
});
