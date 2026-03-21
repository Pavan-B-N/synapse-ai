import crypto from 'crypto';

/**
 * Bloom Filter — probabilistic data structure for fast duplicate detection.
 * Used to efficiently check if an upload has been seen before without DB queries.
 */
export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;

  constructor(size: number = 10000, hashCount: number = 7) {
    this.size = size;
    this.hashCount = hashCount;
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
  }

  private _hash(item: string, seed: number): number {
    const hash = crypto.createHash('md5').update(`${seed}:${item}`).digest();
    return (hash.readUInt32BE(0) % this.size);
  }

  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const pos = this._hash(item, i);
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
  }

  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const pos = this._hash(item, i);
      const byteIndex = Math.floor(pos / 8);
      const bitIndex = pos % 8;
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) return false;
    }
    return true; // Possibly in set (false positives possible)
  }

  get stats() {
    let setBits = 0;
    for (const byte of this.bitArray) {
      for (let i = 0; i < 8; i++) if (byte & (1 << i)) setBits++;
    }
    return { size: this.size, hashCount: this.hashCount, setBits, fillRatio: (setBits / this.size).toFixed(4) };
  }
}
