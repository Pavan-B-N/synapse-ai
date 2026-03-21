import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { IStorageStrategy } from './IStorageStrategy';

/** Local disk storage strategy — stores files in a local directory */
export class LocalStorageStrategy implements IStorageStrategy {
  private uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = path.resolve(uploadDir);
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  getStorageEngine(): multer.StorageEngine {
    return multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, this.uploadDir),
      filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    return fs.existsSync(filePath);
  }
}
