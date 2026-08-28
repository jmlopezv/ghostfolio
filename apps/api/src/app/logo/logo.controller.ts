import { TransformDataSourceInRequestInterceptor } from '@ghostfolio/api/interceptors/transform-data-source-in-request/transform-data-source-in-request.interceptor';

import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseInterceptors
} from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { Response } from 'express';

import { LogoService } from './logo.service';

// Logos are immutable in practice and the watchlist re-requests every one of
// them on every navigation. Without these headers the browser never reuses a
// single response — logos re-fetched (most of them only to 404 again) were the
// largest share of a watchlist page's request count.
const LOGO_CACHE_CONTROL = 'public, max-age=86400';
// A miss gets a shorter window: an asset profile can gain a `url` later, and a
// full day of hard-cached 404s would hide it.
const LOGO_NOT_FOUND_CACHE_CONTROL = 'public, max-age=3600';

@Controller('logo')
export class LogoController {
  public constructor(private readonly logoService: LogoService) {}

  @Get(':dataSource/:symbol')
  @UseInterceptors(TransformDataSourceInRequestInterceptor)
  public async getLogoByDataSourceAndSymbol(
    @Param('dataSource') dataSource: DataSource,
    @Param('symbol') symbol: string,
    @Res() response: Response
  ) {
    try {
      const { buffer, type } =
        await this.logoService.getLogoByDataSourceAndSymbol({
          dataSource,
          symbol
        });

      response.contentType(type);
      response.setHeader('Cache-Control', LOGO_CACHE_CONTROL);
      response.send(buffer);
    } catch {
      response.setHeader('Cache-Control', LOGO_NOT_FOUND_CACHE_CONTROL);
      response.status(HttpStatus.NOT_FOUND).send();
    }
  }

  @Get()
  public async getLogoByUrl(
    @Query('url') url: string,
    @Res() response: Response
  ) {
    try {
      const { buffer, type } = await this.logoService.getLogoByUrl(url);

      response.contentType(type);
      response.setHeader('Cache-Control', LOGO_CACHE_CONTROL);
      response.send(buffer);
    } catch {
      response.setHeader('Cache-Control', LOGO_NOT_FOUND_CACHE_CONTROL);
      response.status(HttpStatus.NOT_FOUND).send();
    }
  }
}
