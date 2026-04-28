import { BadRequestException, Body, Controller, HttpException, Post } from "@nestjs/common";
import { GoogleMapsService } from "../../common/google-maps/google-maps.service";
import { AutocompleteDto } from "./dto/autocomplete.dto";
import { GeocodeDto } from "./dto/geocode.dto";
import { ReverseGeocodeDto } from "./dto/reverse-geocode.dto";
import { ReverseGeocodeService } from "./reverse-geocode.service";

@Controller("places")
export class PlacesController {
  constructor(
    private readonly googleMaps: GoogleMapsService,
    private readonly reverseGeocodeService: ReverseGeocodeService
  ) {}

  @Post("geocode")
  async geocode(@Body() dto: GeocodeDto): Promise<{
    placeId: string;
    name: string;
    lat: number;
    lng: number;
    formattedAddress: string;
  }> {
    if (!dto.address && !dto.placeId) {
      throw new BadRequestException("Either address or placeId is required");
    }
    const result = await this.googleMaps.geocode({ address: dto.address, placeId: dto.placeId });
    return {
      placeId: result.placeId || dto.placeId || `${result.lat},${result.lng}`,
      name: result.name || result.formattedAddress,
      lat: result.lat,
      lng: result.lng,
      formattedAddress: result.formattedAddress
    };
  }

  @Post("autocomplete")
  async autocomplete(@Body() dto: AutocompleteDto): Promise<{ predictions: Array<{ placeId: string; description: string }> }> {
    const predictions = await this.googleMaps.autocomplete(dto.input, dto.sessionToken);
    return { predictions };
  }

  @Post("reverse-geocode")
  async reverseGeocode(
    @Body() dto: ReverseGeocodeDto
  ): Promise<{ place: Awaited<ReturnType<ReverseGeocodeService["reverse"]>> }> {
    const lat = dto.lat;
    const lng = dto.lng;
    const zoom = dto.zoom ?? 16;
    const lang = dto.lang ?? "en";

    try {
      const place = await this.reverseGeocodeService.reverse({ lat, lng, lang, zoom });
      return { place };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "RATE_LIMITED" || (err instanceof Error && err.message === "RATE_LIMITED")) {
        throw new HttpException(
          { error: { code: "RATE_LIMITED", message: "Reverse geocoding rate limit exceeded, try again later" } },
          429
        );
      }

      throw new HttpException(
        { error: { code: "UPSTREAM_ERROR", message: "Reverse geocoding provider failed" } },
        502
      );
    }
  }
}

