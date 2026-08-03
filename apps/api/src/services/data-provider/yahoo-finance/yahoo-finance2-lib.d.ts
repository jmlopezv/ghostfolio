// The `yahoo-finance2/lib/getCrumb` subpath is declared in the package's
// `exports` map (which Node and webpack enforce at runtime), but this app
// compiles with `moduleResolution: node10`, which cannot see `exports`-mapped
// subpaths — so the runtime-valid specifier needs this manual declaration.
declare module 'yahoo-finance2/lib/getCrumb' {
  import { ExtendedCookieJar } from 'yahoo-finance2/script/src/lib/cookieJar';

  export function getCrumbClear(cookieJar: ExtendedCookieJar): Promise<void>;
}
