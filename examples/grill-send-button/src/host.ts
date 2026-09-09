/**
 * Host-half entry for @smileonroad/dsh-grill-send-button.
 *
 * This package is a pure Client plugin: everything it does happens in the
 * browser (a composer button). The Host half is intentionally empty so the
 * package can still be mounted like a normal Cordis package when a loader
 * imports the "." entry, without claiming any Host services.
 * The real plugin body lives in src/index.ts and ships as "./client".
 * @module @smileonroad/dsh-grill-send-button
 */

export const name = 'grill-send-button'

export function apply() {
  /* no Host-side behaviour: see the ./client entry */
}
