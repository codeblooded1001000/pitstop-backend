import { Body, Controller, Post } from "@nestjs/common";
import { PlanTripDto } from "./dto/plan-trip.dto";
import { PlanTripResponse, TripPlannerService } from "./trip-planner.service";

@Controller("trip")
export class TripPlannerController {
  constructor(private readonly tripPlannerService: TripPlannerService) {}

  @Post("plan")
  async planTrip(@Body() dto: PlanTripDto): Promise<PlanTripResponse> {
    return this.tripPlannerService.planTrip(dto);
  }
}
