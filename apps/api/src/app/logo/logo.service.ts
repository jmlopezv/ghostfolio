import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import { AssetProfileIdentifier } from '@ghostfolio/common/interfaces';

import { HttpException, Injectable } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';

/**
 * A watchlist page renders one <gf-entity-logo> per row and does not paginate,
 * so a single render asks for hundreds of logos at once — every one of which
 * used to become its own outbound gstatic fetch with a REQUEST_TIMEOUT abort.
 * Favicons effectively never change, so an in-process memo collapses all of
 * that to one fetch per host for the lifetime of the process.
 *
 * Deliberately in-process rather than Redis: the payload is binary and the
 * working set is a few hundred small images. Failures are memoised too, and
 * for a shorter time, so a transient gstatic blip is retried within the hour
 * instead of being repeated on every single render.
 */
const LOGO_CACHE_TTL = 24 * 60 * 60 * 1000;
const LOGO_NEGATIVE_CACHE_TTL = 60 * 60 * 1000;
const LOGO_CACHE_MAX_ENTRIES = 2_000;

@Injectable()
export class LogoService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: { buffer: Buffer; type: string } | null }
  >();
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async getLogoByDataSourceAndSymbol({
    dataSource,
    symbol
  }: AssetProfileIdentifier) {
    if (!DataSource[dataSource]) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.NOT_FOUND),
        StatusCodes.NOT_FOUND
      );
    }

    const [assetProfile] = await this.symbolProfileService.getSymbolProfiles([
      { dataSource, symbol }
    ]);

    if (!assetProfile?.url) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.NOT_FOUND),
        StatusCodes.NOT_FOUND
      );
    }

    return this.getBuffer(assetProfile.url);
  }

  public getLogoByUrl(aUrl: string) {
    return this.getBuffer(aUrl);
  }

  private async getBuffer(aUrl: string) {
    const cached = this.cache.get(aUrl);

    if (cached && cached.expiresAt > Date.now()) {
      if (cached.value === null) {
        throw new HttpException(
          getReasonPhrase(StatusCodes.NOT_FOUND),
          StatusCodes.NOT_FOUND
        );
      }

      return cached.value;
    }

    try {
      const blob = await this.fetchService
        .fetch(
          `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${aUrl}&size=64`,
          {
            headers: { 'User-Agent': 'request' },
            signal: AbortSignal.timeout(
              this.configurationService.get('REQUEST_TIMEOUT')
            )
          }
        )
        .then((res) => res.blob());

      const value = {
        buffer: await blob.arrayBuffer().then((arrayBuffer) => {
          return Buffer.from(arrayBuffer);
        }),
        type: blob.type
      };

      this.setCached(aUrl, value, LOGO_CACHE_TTL);

      return value;
    } catch (error) {
      this.setCached(aUrl, null, LOGO_NEGATIVE_CACHE_TTL);

      throw error;
    }
  }

  private setCached(
    key: string,
    value: { buffer: Buffer; type: string } | null,
    ttl: number
  ) {
    // Plain FIFO eviction — the working set is one entry per watched company,
    // so the cap only ever matters as a guard against unbounded growth.
    if (this.cache.size >= LOGO_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;

      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { expiresAt: Date.now() + ttl, value });
  }
}
