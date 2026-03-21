import multer from 'multer';

/** Interface for file storage strategies */
export interface IStorageStrategy {
  /** Returns a multer StorageEngine for handling file uploads */
  getStorageEngine(): multer.StorageEngine;
  /** Delete a file by its absolute path */
  deleteFile(filePath: string): Promise<void>;
  /** Check if a file exists */
  fileExists(filePath: string): Promise<boolean>;
}
