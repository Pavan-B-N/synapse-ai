/**
 * Shared constants and enums for the document-server.
 */

/** Supported document types */
export enum DocumentType {
  PDF = 'pdf',
  TEXT = 'text',
  MARKDOWN = 'markdown',
}

/** Document processing status */
export enum DocumentStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  ERROR = 'error',
}

/** Embedding processing status */
export enum EmbeddingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  ERROR = 'error',
}

/** Event sourcing event types */
export enum DocumentEventType {
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  PROCESSING_STARTED = 'PROCESSING_STARTED',
  CONTENT_EXTRACTED = 'CONTENT_EXTRACTED',
  SUMMARY_GENERATED = 'SUMMARY_GENERATED',
  EMBEDDINGS_CREATED = 'EMBEDDINGS_CREATED',
  DOCUMENT_PROCESSED = 'DOCUMENT_PROCESSED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',
  DOCUMENT_SHARED = 'DOCUMENT_SHARED',
  DOCUMENT_UNSHARED = 'DOCUMENT_UNSHARED',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
}

/** Maximum storage per user in bytes (100 MB) */
export const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

/** Allowed MIME types for upload */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/csv',
] as const;

/** Allowed file extensions for upload */
export const ALLOWED_FILE_EXTENSIONS = /\.(pdf|md|csv)$/i;

/** Maximum file size in bytes (50 MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Default chunk size for progressive content loading */
export const DEFAULT_CONTENT_CHUNK_SIZE = 5;
