-- CreateTable
CREATE TABLE "SignalConfig" (
    "buyDropPct" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "cashThreshold" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSource" "DataSource" NOT NULL,
    "id" TEXT NOT NULL,
    "isActiveTrade" BOOLEAN NOT NULL DEFAULT false,
    "symbol" TEXT NOT NULL,
    "takeProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SignalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalState" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3),
    "lastPrice" DOUBLE PRECISION,
    "lastSignal" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SignalState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignalConfig_userId_idx" ON "SignalConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalConfig_userId_dataSource_symbol_key" ON "SignalConfig"("userId", "dataSource", "symbol");

-- CreateIndex
CREATE INDEX "SignalState_userId_idx" ON "SignalState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalState_userId_key_key" ON "SignalState"("userId", "key");

-- AddForeignKey
ALTER TABLE "SignalConfig" ADD CONSTRAINT "SignalConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalState" ADD CONSTRAINT "SignalState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
