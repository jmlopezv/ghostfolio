'use strict';
/**
 * Runs compiled signals specs using Node's built-in test runner + Jest's expect.
 * Bypasses the broken Jest 30/Node 24/Windows resolver issue entirely.
 */

// Resolve @ghostfolio/common/* path aliases to the compiled test output so
// specs whose services import shared config/interfaces load at runtime.
const Module = require('node:module');
const path = require('node:path');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@ghostfolio/common/')) {
    const sub = request.slice('@ghostfolio/common/'.length);
    request = path.join(
      __dirname,
      'dist-test-signals/libs/common/src/lib',
      sub
    );
  } else if (request.startsWith('@ghostfolio/api/')) {
    const sub = request.slice('@ghostfolio/api/'.length);
    request = path.join(__dirname, 'dist-test-signals/apps/api/src', sub);
  }
  return originalResolve.call(this, request, ...args);
};

const { describe, it, before, beforeEach, after } = require('node:test');
const { expect } = require('./node_modules/expect/build/index.js');

// Provide Jest globals that the compiled specs reference
global.describe = describe;
global.it = it;
global.before = before;
global.beforeEach = beforeEach;
global.after = after;
global.expect = expect;

// Load the compiled spec files
require('./dist-test-signals/apps/api/src/services/signals/asset-detail.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/buy-calibration.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/fund-history.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/market-regime.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/indicators.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/forecast.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/strategies.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/fundamentals.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/screening.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/simulation-performance.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/signal-trade-tracking.spec.js');
require('./dist-test-signals/apps/api/src/app/endpoints/academy/academy.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/cross-sectional.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/leader-screen.service.spec.js');
require('./dist-test-signals/apps/api/src/services/signals/ohlc-bar.service.spec.js');
require('./dist-test-signals/libs/common/src/lib/nordnet-fees.spec.js');
require('./dist-test-signals/libs/common/src/lib/tradingview.spec.js');
require('./dist-test-signals/libs/common/src/lib/symbol-links.spec.js');
require('./dist-test-signals/libs/common/src/lib/sectors.spec.js');
require('./dist-test-signals/libs/common/src/lib/index-constituents.spec.js');
