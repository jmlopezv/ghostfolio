-- CreateTable
CREATE TABLE "SignalLog" (
    "adaptiveLevel" DOUBLE PRECISION,
    "bearMarket" BOOLEAN NOT NULL DEFAULT false,
    "bollingerPctB" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "conviction" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT,
    "dataSource" "DataSource" NOT NULL,
    "expectedValue" DOUBLE PRECISION,
    "forecastLower" DOUBLE PRECISION,
    "forecastUpper" DOUBLE PRECISION,
    "id" TEXT NOT NULL,
    "livePrice" DOUBLE PRECISION,
    "macdHistogram" DOUBLE PRECISION,
    "metrics" JSONB,
    "name" TEXT,
    "newsScore" DOUBLE PRECISION,
    "reachProbability" DOUBLE PRECISION,
    "reason" TEXT,
    "rsi" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "signalType" TEXT,
    "stopLoss" DOUBLE PRECISION,
    "suggestedAmount" DOUBLE PRECISION,
    "symbol" TEXT NOT NULL,
    "takeProfit" DOUBLE PRECISION,
    "trailingStop" DOUBLE PRECISION,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SignalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalLog_userId_createdAt_idx" ON "SignalLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalLog_userId_category_symbol_createdAt_idx" ON "SignalLog"("userId", "category", "symbol", "createdAt");

-- AddForeignKey
ALTER TABLE "SignalLog" ADD CONSTRAINT "SignalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
