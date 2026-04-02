type UploadCategory = "image" | "video" | "document" | "audio" | "media" | "profile_photo";
declare const UPLOAD_ALLOWED_MIME_TYPES: readonly [
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
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/x-ms-wmv",
  "video/3gpp",
  "video/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/x-m4a",
  "audio/mp4",
  "audio/webm",
  "audio/x-wav",
  "application/pdf",
];
declare const UPLOAD_SIZE_LIMITS: Record<UploadCategory, number>;
declare const UPLOAD_CATEGORY_MIME_TYPES: Record<UploadCategory, readonly string[]>;
declare const IMAGE_SRCSET_WIDTHS: readonly [400, 800, 1200];

export {
  IMAGE_SRCSET_WIDTHS,
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_CATEGORY_MIME_TYPES,
  UPLOAD_SIZE_LIMITS,
  type UploadCategory,
};
