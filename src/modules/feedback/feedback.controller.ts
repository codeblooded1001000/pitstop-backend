import { Body, Controller, Post } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CheckpointFeedbackDto } from "./dto/checkpoint-feedback.dto";

@Controller("feedback")
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("checkpoint")
  async checkpoint(@Body() dto: CheckpointFeedbackDto): Promise<{ ok: true }> {
    await this.prisma.checkpointFeedback.create({
      data: {
        checkpointId: dto.checkpointId,
        reason: dto.reason,
        comment: dto.comment ?? null
      }
    });
    return { ok: true };
  }
}

