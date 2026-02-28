// No "server-only" here — this file is imported by both client components and server routes.

export type UploadCategory = "image" | "video" | "document" | "audio" | "profile_photo";

export const UPLOAD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
] as const;

export const UPLOAD_SIZE_LIMITS: Record<UploadCategory, number> = {
  image: 10 * 1024 * 1024, // 10MB
  video: 100 * 1024 * 1024, // 100MB
  document: 25 * 1024 * 1024, // 25MB
  audio: 50 * 1024 * 1024, // 50MB
  profile_photo: 5 * 1024 * 1024, // 5MB
};

export const UPLOAD_CATEGORY_MIME_TYPES: Record<UploadCategory, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
  video: ["video/mp4", "video/webm"],
  document: ["application/pdf"],
  audio: ["audio/mpeg", "audio/wav"],
  profile_photo: ["image/jpeg", "image/png", "image/webp", "image/avif"],
};

// Srcset widths for responsive image generation
export const IMAGE_SRCSET_WIDTHS = [400, 800, 1200] as const;
