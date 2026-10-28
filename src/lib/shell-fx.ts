/**
 * Decorative shell effects (Aurora WebGL / ClickSpark).
 * Keep SitesPrefetch, HrFieldSync, and notifications outside this gate.
 */

/** Routes where WebGL/canvas chrome competes with dense data UIs. */
const HEAVY_SHELL_FX_PATHS: RegExp[] = [
  /^\/people$/,
  /^\/people\/staff(?:\/|$)/,
  /^\/people\/attendance(?:\/|$)/,
  /^\/people\/roster(?:\/|$)/,
  /^\/people\/hr\/ot(?:\/|$)/,
  /^\/people\/hr\/payroll(?:\/|$)/,
  /^\/people\/hr\/leave(?:\/|$)/,
  /^\/chat(?:\/|$)/,
];

export function isHeavyShellFxRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return HEAVY_SHELL_FX_PATHS.some((re) => re.test(pathname));
}

/** True when Aurora / ClickSpark may mount (preference + route; reduced-motion checked by callers). */
export function mayMountShellFx(options: {
  pathname: string | null | undefined;
  shellFxEnabled: boolean;
  prefersReducedMotion?: boolean;
}): boolean {
  if (!options.shellFxEnabled) return false;
  if (options.prefersReducedMotion) return false;
  if (isHeavyShellFxRoute(options.pathname)) return false;
  return true;
}
