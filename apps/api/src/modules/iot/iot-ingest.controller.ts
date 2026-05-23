import { Body, Controller, Headers, Post } from "@nestjs/common";
import { Public } from "../../shared/decorators/public.decorator";
import { IotHttpIngestDto } from "./dto/iot-http-ingest.dto";
import { IotIngestService } from "./iot-ingest.service";

@Controller("iot/ingest")
export class IotIngestController {
  constructor(private readonly ingestService: IotIngestService) {}

  @Post("http")
  @Public()
  ingestHttp(
    @Headers("x-device-code") deviceCode: string | undefined,
    @Headers("x-timestamp") timestamp: string | undefined,
    @Headers("x-nonce") nonce: string | undefined,
    @Headers("x-signature") signature: string | undefined,
    @Body() dto: IotHttpIngestDto
  ) {
    return this.ingestService.ingestHttp(
      {
        deviceCode: deviceCode ?? "",
        timestamp: timestamp ?? "",
        nonce: nonce ?? "",
        signature: signature ?? ""
      },
      dto
    );
  }
}
