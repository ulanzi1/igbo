// No "server-only" here — this file is imported by both client components and server routes.

export type UploadCategory = "image" | "video" | "document" | "audio" | "media" | "profile_photo";

export const UPLOAD_ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/x-ms-wmv",
  "video/3gpp",
  "video/ogg",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/x-m4a",
  "audio/mp4",
  "audio/webm",
  "audio/x-wav",
  // Documents
  "application/pdf",
] as const;

export const UPLOAD_SIZE_LIMITS: Record<UploadCategory, number> = {
  image: 50 * 1024 * 1024, // 50MB
  video: 100 * 1024 * 1024, // 100MB
  document: 25 * 1024 * 1024, // 25MB
  audio: 50 * 1024 * 1024, // 50MB
  media: 100 * 1024 * 1024, // 100MB — combined category for feed posts
  profile_photo: 5 * 1024 * 1024, // 5MB
};

export const UPLOAD_CATEGORY_MIME_TYPES: Record<UploadCategory, readonly string[]> = {
  image: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
    "image/heic",
    "image/heif",
  ],
  video: [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/x-ms-wmv",
    "video/3gpp",
    "video/ogg",
  ],
  document: ["application/pdf"],
  audio: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
    "audio/x-m4a",
    "audio/mp4",
    "audio/webm",
    "audio/x-wav",
  ],
  media: [
    // Images
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
    "image/heic",
    "image/heif",
    // Video
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/x-ms-wmv",
    "video/3gpp",
    "video/ogg",
    // Audio
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
    "audio/x-m4a",
    "audio/mp4",
    "audio/webm",
    "audio/x-wav",
  ],
  profile_photo: ["image/jpeg", "image/png", "image/webp", "image/avif"],
};

// Srcset widths for responsive image generation
export const IMAGE_SRCSET_WIDTHS = [400, 800, 1200] as const;
