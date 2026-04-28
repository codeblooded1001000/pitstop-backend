import { Injectable } from "@nestjs/common";
import { Checkpoint } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CheckpointsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(params?: { take?: number; skip?: number }): Promise<Checkpoint[]> {
    const { take, skip } = params ?? {};
    return this.prisma.checkpoint.findMany({
      where: { isActive: true },
      orderBy: { lastVerifiedAt: "desc" },
      take,
      skip
    });
  }
}
