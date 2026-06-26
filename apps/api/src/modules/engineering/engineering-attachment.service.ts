import { BadRequestException, Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { FilesService } from "../files/files.service";

@Injectable()
export class EngineeringAttachmentService {
  constructor(private readonly filesService: FilesService) {}

  async normalizeAttachmentIds(scope: TenantParkScope, attachmentIds: string[] | null | undefined): Promise<string[] | null | undefined> {
    if (attachmentIds === undefined || attachmentIds === null) {
      return attachmentIds;
    }
    const uniqueIds = [...new Set(attachmentIds)];
    if (uniqueIds.length !== attachmentIds.length) {
      return this.assertFilesExist(scope, uniqueIds);
    }
    return this.assertFilesExist(scope, attachmentIds);
  }

  private async assertFilesExist(scope: TenantParkScope, attachmentIds: string[]): Promise<string[]> {
    for (const attachmentId of attachmentIds) {
      try {
        await this.filesService.detail(scope, attachmentId);
      } catch {
        throw new BadRequestException("attachment_ids must reference files in the current tenant and park");
      }
    }
    return attachmentIds;
  }
}
