import {
  AcademyExampleResponse,
  AcademyMarketPulseResponse,
  AcademyProgressResponse,
  AcademyQuizSubmissionResult
} from '@ghostfolio/common/interfaces';
import { RequestWithUser } from '@ghostfolio/common/types';

import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from '@prisma/client';

import { AcademyService } from './academy.service';

@Controller('academy')
export class AcademyController {
  public constructor(
    private readonly academyService: AcademyService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('progress')
  @UseGuards(AuthGuard('jwt'))
  public async getProgress(): Promise<AcademyProgressResponse> {
    return this.academyService.getProgress(this.request.user.id);
  }

  @Post('progress/:lessonId')
  @UseGuards(AuthGuard('jwt'))
  public async submitQuiz(
    @Param('lessonId') lessonId: string,
    @Body() answers: Record<string, string>
  ): Promise<AcademyQuizSubmissionResult> {
    return this.academyService.submitQuiz(
      this.request.user.id,
      lessonId,
      answers
    );
  }

  @Get('example/:dataSource/:symbol')
  @UseGuards(AuthGuard('jwt'))
  public async getExample(
    @Param('dataSource') dataSource: DataSource,
    @Param('symbol') symbol: string
  ): Promise<AcademyExampleResponse> {
    return this.academyService.getExample(dataSource, symbol);
  }

  @Get('market-pulse')
  @UseGuards(AuthGuard('jwt'))
  public async getMarketPulse(): Promise<AcademyMarketPulseResponse> {
    return this.academyService.getMarketPulse();
  }
}
