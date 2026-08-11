import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";

@Module({
  imports: [UsersModule],
  controllers: [MobileController],
  providers: [MobileService]
})
export class MobileModule {}
