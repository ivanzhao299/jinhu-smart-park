import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { FileStorageProvider, StoredFileInput, StoredFileResult } from "./file-storage.types";

@Injectable()
export class LocalFileStorageProvider implements FileStorageProvider {
  readonly storageType = "local" as const;

  constructor(private readonly configService: ConfigService) {}

  async save(input: StoredFileInput): Promise<StoredFileResult> {
    const root = this.getRoot();
    const relativePath = normalize(join(input.relativeDir, input.storedName));
    const absolutePath = join(root, relativePath);
    await mkdir(join(root, input.relativeDir), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return {
      storageType: this.storageType,
      storageBucket: null,
      storagePath: relativePath
    };
  }

  resolve(storagePath: string): string {
    return join(this.getRoot(), normalize(storagePath));
  }

  private getRoot(): string {
    return this.configService.get<string>("FILE_STORAGE_LOCAL_ROOT", "storage/files");
  }
}
