import { Module } from "@nestjs/common";
import { PoiFetcherService } from "./poi-fetcher.service";
import { PoiFetcherWorker } from "./poi-fetcher.worker";

@Module({
  providers: [PoiFetcherService, PoiFetcherWorker],
  exports: [PoiFetcherService]
})
export class PoiFetcherModule {}

