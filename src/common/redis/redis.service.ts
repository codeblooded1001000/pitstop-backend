import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis, { type Redis as RedisClient } from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClient;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is required");
    }

    this.client = new Redis(url, {
      // BullMQ requires this to be null because it uses blocking Redis commands.
      // See: "BullMQ: Your redis options maxRetriesPerRequest must be null."
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
  }

  get raw(): RedisClient {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, "EX", ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

