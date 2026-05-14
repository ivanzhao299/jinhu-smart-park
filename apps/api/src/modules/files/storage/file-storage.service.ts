import { Injectable, UnsupportedMediaTypeException } from "@nestjs/common";
import { LocalFileStorageProvider } from "./local-file-storage.provider";
import type { FileStorageProvider, StoredFileInput, StoredFileResult } from "./file-storage.types";

@Injectable()
export class FileStorageService {
  constructor(private readonly localProvider: LocalFileStorageProvider) {}

  save(input: StoredFileInput, storageType: "local" | "minio" | "oss" = "local"): Promise<StoredFileResult> {
    return this.getProvider(storageType).save(input);
  }

  resolve(storagePath: string, storageType: "local" | "minio" | "oss" = "local"): string {
    return this.getProvider(storageType).resolve(storagePath);
  }

  private getProvider(storageType: "local" | "minio" | "oss"): FileStorageProvider {
    if (storageType === "local") {
      return this.localProvider;
    }
    throw new UnsupportedMediaTypeException(`Storage provider ${storageType} is not enabled`);
  }
}
