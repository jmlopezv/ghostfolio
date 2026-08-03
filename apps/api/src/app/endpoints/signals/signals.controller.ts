import { AssetDetailService } from '@ghostfolio/api/services/signals/asset-detail.service';
import { BacktestService } from '@ghostfolio/api/services/signals/backtest.service';
import { FundHistoryService } from '@ghostfolio/api/services/signals/fund-history.service';
import { SignalsService } from '@ghostfolio/api/services/signals/signals.service';
import { SignalExitMode } from '@ghostfolio/common/config';
import { UpdateSignalConfigDto } from '@ghostfolio/common/dtos';
import {
  AssetDetailResponse,
  BacktestAllResponse,
  BacktestResult,
  CorrelationMatrixResponse,
  FundMetricsResponse,
  FundRecommendationResponse,
  InvestmentStrategiesResponse,
  PortfolioReport,
  SignalLogResponse,
  SimulationResponse,
  TradingSignalsResponse,
  WatchlistMetric
} from '@ghostfolio/common/interfaces';
import { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from '@prisma/client';

function parseExitMode(value?: string): SignalExitMode | undefined {
  return value === 'hold-with-stop' || value === 'trailing' ? value : undefined;
}

@Controller('signals')
export class SignalsController {
  public constructor(
    private readonly assetDetailService: AssetDetailService,
    private readonly backtestService: BacktestService,
    private readonly fundHistoryService: FundHistoryService,
    @Inject(REQUEST) private readonly request: RequestWithUser,
    private readonly signalsService: SignalsService
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  public async getSignals(): Promise<TradingSignalsResponse> {
    return this.signalsService.computeSignals(this.request.user.id);
  }

  @Get('report')
  @UseGuards(AuthGuard('jwt'))
  public async getPortfolioReport(): Promise<PortfolioReport> {
    return this.signalsService.computePortfolioReport(this.request.user.id);
  }

  @Post('report/send')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async sendPortfolioReport(): Promise<{ status: string }> {
    await this.signalsService.sendPortfolioReport(this.request.user.id);

    return { status: 'ok' };
  }

  @Post('catalog/import')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async importCatalog() {
    return this.signalsService.importCatalog(this.request.user.id);
  }

  @Post('funds/import')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async importFunds() {
    return this.signalsService.importFunds(this.request.user.id);
  }

  @Get('funds/recommendations')
  @UseGuards(AuthGuard('jwt'))
  public async getFundRecommendations(): Promise<FundRecommendationResponse> {
    return this.signalsService.computeFundRecommendations(this.request.user.id);
  }

  @Post('funds/recommendations/send')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async sendFundRecommendations(): Promise<{ status: string }> {
    await this.signalsService.sendFundRecommendations(this.request.user.id);

    return { status: 'ok' };
  }

  @Get('funds/metrics')
  @UseGuards(AuthGuard('jwt'))
  public async getFundMetrics(): Promise<FundMetricsResponse> {
    return this.signalsService.getFundMetrics(this.request.user.id);
  }

  @Get('asset-detail/:dataSource/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async getAssetDetail(
    @Param('dataSource') dataSource: DataSource,
    @Param('symbol') symbol: string
  ): Promise<AssetDetailResponse> {
    return this.assetDetailService.getAssetDetail(
      this.request.user.id,
      dataSource,
      symbol
    );
  }

  @Get('correlation-matrix')
  @UseGuards(AuthGuard('jwt'))
  public async getCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    return this.assetDetailService.getCorrelationMatrix(this.request.user.id);
  }

  @Post('funds/history/sync')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async syncFundHistory() {
    return this.fundHistoryService.syncAll();
  }

  @Post('tracked/refresh')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async refreshTrackedTrades(): Promise<{ status: string }> {
    await this.signalsService.refreshTrackedTrades(this.request.user.id);

    return { status: 'ok' };
  }

  @Post('tracked/refresh-intraday')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async refreshTrackedTradesIntraday(): Promise<{ status: string }> {
    await this.signalsService.checkTrailingPositionsIntraday();

    return { status: 'ok' };
  }

  @Get('strategies')
  @UseGuards(AuthGuard('jwt'))
  public async getStrategies(): Promise<InvestmentStrategiesResponse> {
    return this.signalsService.computeStrategies(this.request.user.id);
  }

  @Post('strategies/send')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  public async sendStrategies(): Promise<{ status: string }> {
    await this.signalsService.sendStrategies(this.request.user.id);

    return { status: 'ok' };
  }

  @Get('log')
  @UseGuards(AuthGuard('jwt'))
  public async getSignalLog(
    @Query('category') category?: string,
    @Query('days') days?: string,
    @Query('symbol') symbol?: string
  ): Promise<SignalLogResponse> {
    return this.signalsService.getSignalLog(this.request.user.id, {
      category,
      days: days ? parseInt(days, 10) : undefined,
      symbol
    });
  }

  @Get('simulation')
  @UseGuards(AuthGuard('jwt'))
  public async getSimulation(): Promise<SimulationResponse> {
    return this.signalsService.computeSimulation(this.request.user.id);
  }

  @Get('watchlist-metrics')
  @UseGuards(AuthGuard('jwt'))
  public async getWatchlistMetrics(): Promise<Record<string, WatchlistMetric>> {
    return this.signalsService.getWatchlistMetrics(this.request.user.id);
  }

  @Get('config')
  @UseGuards(AuthGuard('jwt'))
  public async getSignalConfig() {
    return this.signalsService.getSignalConfigList(this.request.user.id);
  }

  @Put('config/:dataSource/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async updateSignalConfig(
    @Param('dataSource') dataSource: DataSource,
    @Param('symbol') symbol: string,
    @Body() data: UpdateSignalConfigDto
  ) {
    return this.signalsService.updateSignalConfig({
      dataSource,
      symbol,
      userId: this.request.user.id,
      ...data
    });
  }

  @Get('backtest/all')
  @UseGuards(AuthGuard('jwt'))
  public async backtestAll(
    @Query('exitMode') exitMode?: string
  ): Promise<BacktestAllResponse> {
    return this.signalsService.backtestAll(
      this.request.user.id,
      parseExitMode(exitMode)
    );
  }

  @Get('backtest/:dataSource/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async backtest(
    @Param('dataSource') dataSource: DataSource,
    @Param('symbol') symbol: string,
    @Query('buyDropPct') buyDropPct?: string,
    @Query('exitMode') exitMode?: string,
    @Query('positionSize') positionSize?: string,
    @Query('sigmaMult') sigmaMult?: string,
    @Query('slippageBps') slippageBps?: string,
    @Query('takeProfitPct') takeProfitPct?: string
  ): Promise<BacktestResult> {
    return this.backtestService.backtest({
      dataSource,
      symbol,
      buyDropPct: buyDropPct ? parseFloat(buyDropPct) : undefined,
      buySigmaMult: sigmaMult ? parseFloat(sigmaMult) : undefined,
      exitMode: parseExitMode(exitMode),
      positionSize: positionSize ? parseFloat(positionSize) : undefined,
      slippageBps: slippageBps ? parseFloat(slippageBps) : undefined,
      takeProfitPct: takeProfitPct ? parseFloat(takeProfitPct) : undefined
    });
  }
}
