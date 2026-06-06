import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { FileStorageProvider, StoredFileInput, StoredFileResult } from "./file-storage.types";

@Injectable()
export class LocalFileStorageProvider implements FileStorageProvider {
  readonly storageType = "local" as const;

  constructor(private readonly configService: ConfigService) {}

  async save(input: StoredFileInput): Promise<StoredFileResult> {
    const relativePath = normalize(join(input.relativeDir, input.storedName));
    const absolutePath = this.toAbsolutePath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return {
      storageType: this.storageType,
      storageBucket: null,
      storagePath: relativePath
    };
  }

  resolve(storagePath: string): string {
    return this.toAbsolutePath(normalize(storagePath));
  }

  private getRoot(): string {
    return resolve(this.configService.get<string>("FILE_STORAGE_LOCAL_ROOT", "storage/files"));
  }

  private toAbsolutePath(relativePath: string): string {
    const root = this.getRoot();
    const target = resolve(root, relativePath);
    const relativeToRoot = relative(root, target);

    if (relativeToRoot === "" || (!relativeToRoot.startsWith("..") && !isAbsolute(relativeToRoot))) {
      return target;
    }

    throw new InternalServerErrorException("Invalid file storage path");
  }
}
