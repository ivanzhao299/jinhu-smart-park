import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DictsController } from "./dicts.controller";
import { DictsService } from "./dicts.service";
import { DictItemEntity } from "./entities/dict-item.entity";
import { DictTypeEntity } from "./entities/dict-type.entity";

@Module({
  imports: [TypeOrmModule.forFeature([DictTypeEntity, DictItemEntity])],
  controllers: [DictsController],
  providers: [DictsService],
  exports: [DictsService]
})
export class DictsModule {}
