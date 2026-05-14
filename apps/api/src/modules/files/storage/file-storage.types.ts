export interface StoredFileInput {
  buffer: Buffer;
  storedName: string;
  relativeDir: string;
}

export interface StoredFileResult {
  storageType: "local" | "minio" | "oss";
  storageBucket: string | null;
  storagePath: string;
}

export interface FileStorageProvider {
  readonly storageType: "local" | "minio" | "oss";
  save(input: StoredFileInput): Promise<StoredFileResult>;
  resolve(storagePath: string): string;
}
