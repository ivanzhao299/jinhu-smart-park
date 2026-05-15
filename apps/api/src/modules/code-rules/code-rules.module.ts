import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesController } from "./code-rules.controller";
import { CodeRulesService } from "./code-rules.service";
import { CodeRuleEntity } from "./entities/code-rule.entity";

@Module({
  imports: [TypeOrmModule.forFeature([CodeRuleEntity])],
  controllers: [CodeRulesController],
  providers: [CodeRulesService],
  exports: [CodeRulesService]
})
export class CodeRulesModule {}
