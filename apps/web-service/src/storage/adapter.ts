import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Abstract storage adapter interface
 * Implementations for local filesystem, S3, Cloudflare R2, etc.
 */
export interface StorageAdapter {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

/**
 * Local filesystem storage adapter
 * For development and self-hosted deployments
 */
export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = process.env.STORAGE_PATH || './uploads';
    this.baseUrl = process.env.STORAGE_URL || 'http://localhost:3001/uploads';
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    const filePath = path.join(this.basePath, key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, data);

    return this.getUrl(key);
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key);
    return await fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

/**
 * S3-compatible storage adapter
 * Works with AWS S3, Cloudflare R2, MinIO, etc.
 */
export class S3StorageAdapter implements StorageAdapter {
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'asaps-assets';
    this.region = process.env.S3_REGION || 'auto';
    this.endpoint = process.env.S3_ENDPOINT; // For R2 or custom endpoints
    this.accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
    this.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    // Note: In production, use @aws-sdk/client-s3
    // This is a placeholder showing the interface
    console.log(`[S3] Would upload ${key} (${data.length} bytes) as ${contentType}`);

    // For now, fall back to local storage
    const local = new LocalStorageAdapter();
    return await local.upload(key, data, contentType);
  }

  async download(key: string): Promise<Buffer> {
    // Placeholder - use @aws-sdk/client-s3 in production
    const local = new LocalStorageAdapter();
    return await local.download(key);
  }

  async delete(key: string): Promise<void> {
    // Placeholder - use @aws-sdk/client-s3 in production
    const local = new LocalStorageAdapter();
    return await local.delete(key);
  }

  getUrl(key: string): string {
    if (process.env.CDN_URL) {
      return `${process.env.CDN_URL}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

// Factory function
let storageAdapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!storageAdapter) {
    const storageType = process.env.STORAGE_TYPE || 'local';

    switch (storageType) {
      case 's3':
      case 'r2':
        storageAdapter = new S3StorageAdapter();
        break;
      case 'local':
      default:
        storageAdapter = new LocalStorageAdapter();
    }

    console.log(`[Storage] Using ${storageType} storage adapter`);
  }

  return storageAdapter;
}
