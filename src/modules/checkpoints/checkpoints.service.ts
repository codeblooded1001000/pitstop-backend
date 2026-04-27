import { Injectable } from "@nestjs/common";
import { Checkpoint } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CheckpointsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCorridor(corridor: string): Promise<Checkpoint[]> {
    return this.prisma.checkpoint.findMany({
      where: { corridor },
      orderBy: { distanceFromDelhi: "asc" }
    });
  }
}
