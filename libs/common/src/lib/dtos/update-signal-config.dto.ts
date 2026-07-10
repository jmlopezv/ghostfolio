import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSignalConfigDto {
  @IsNumber()
  @IsOptional()
  @Max(1)
  @Min(0)
  buyDropPct?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cashThreshold?: number;

  @IsBoolean()
  @IsOptional()
  isActiveTrade?: boolean;

  @IsNumber()
  @IsOptional()
  @Max(10)
  @Min(0)
  takeProfitPct?: number;
}
