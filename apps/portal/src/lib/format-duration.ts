/**
 * Formats a duration in milliseconds to a human-readable string.
 * Examples: 45000 → "0m", 90000 → "1m", 3600000 → "1h", 5400000 → "1h 30m"
 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
}
