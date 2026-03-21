import multer from 'multer';
import config from '../../config';
import { IStorageStrategy } from './IStorageStrategy';
import { LocalStorageStrategy } from './LocalStorageStrategy';

/**
 * StorageService — Exposes file operations via an injected storage strategy.
 * The strategy is provided at construction time, not resolved internally.
 */
class StorageService {
  private strategy: IStorageStrategy;

  constructor(strategy: IStorageStrategy) {
    this.strategy = strategy;
  }

  getStorageEngine(): multer.StorageEngine {
    return this.strategy.getStorageEngine();
  }

  async deleteFile(filePath: string): Promise<void> {
    return this.strategy.deleteFile(filePath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.strategy.fileExists(filePath);
  }
}

const storageService = new StorageService(new LocalStorageStrategy(config.storage.uploadDir));
export default storageService;
