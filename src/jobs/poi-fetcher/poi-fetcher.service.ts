import { Injectable } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import { RedisService } from "../../common/redis/redis.service";

export type PoiFetchJob = { encodedPolyline: string };

@Injectable()
export class PoiFetcherService {
  private readonly queue: Queue<PoiFetchJob>;

  constructor(redis: RedisService) {
    this.queue = new Queue<PoiFetchJob>("poi-fetch", { connection: redis.raw });
  }

  async enqueue(encodedPolyline: string, opts?: JobsOptions): Promise<{ jobId: string }> {
    const job = await this.queue.add(
      "fetch",
      { encodedPolyline },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        ...opts
      }
    );
    return { jobId: job.id ?? job.name };
  }
}

