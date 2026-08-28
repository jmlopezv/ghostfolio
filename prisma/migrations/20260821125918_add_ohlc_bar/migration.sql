-- CreateTable
CREATE TABLE "OhlcBar" (
    "close" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSource" "DataSource" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "id" TEXT NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "symbol" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OhlcBar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OhlcBar_dataSource_symbol_idx" ON "OhlcBar"("dataSource", "symbol");

-- CreateIndex
CREATE INDEX "OhlcBar_date_idx" ON "OhlcBar"("date");

-- CreateIndex
CREATE INDEX "OhlcBar_symbol_date_idx" ON "OhlcBar"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OhlcBar_dataSource_date_symbol_key" ON "OhlcBar"("dataSource", "date", "symbol");
