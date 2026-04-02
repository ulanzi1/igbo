import { randomBytes } from "node:crypto";

export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const suffix = randomBytes(3).toString("hex"); // 6-char hex suffix
  return `${base}-${suffix}`;
}
