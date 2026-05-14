import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentEntity } from "./entities/attachment.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity])],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService]
})
export class AttachmentsModule {}
