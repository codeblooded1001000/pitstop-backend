import { Module } from "@nestjs/common";
import { PoiFetcherModule } from "../../jobs/poi-fetcher/poi-fetcher.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [PoiFetcherModule],
  controllers: [AdminController]
})
export class AdminModule {}

