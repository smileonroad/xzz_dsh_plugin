/**
 * Producer-side session event family for one laundry cycle.
 *
 * The laundromat records a wash as three replayable session events that share
 * one stable business id (`laundryId`): `laundry/start` opens the cycle,
 * `laundry/progress` carries the drum percentage, and `laundry/done` closes
 * it. The Client half folds this family into a keyed chat node; everything a
 * renderer shows must be derivable from these events alone — never from live
 * memory.
 *
 * This module is the producer's pure-type export: the merge and the payload
 * types live here so the Client can import them type-only without pulling any
 * Host code into the browser bundle.
 * @module laundry-events
 */

import type {} from '@deepseek-ai/dsh-session/types'

/** Opens one laundry cycle. */
export interface LaundryStartData {
  /** Stable business id shared by every event of the same cycle. */
  readonly laundryId: string
  /** What is being washed, e.g. "一件衬衫". */
  readonly title: string
}

/** Records the drum progress of one running cycle. */
export interface LaundryProgressData {
  readonly laundryId: string
  /** Drum percentage: 0–99 while running (the done event finalizes 100). */
  readonly completed: number
}

/** Closes one laundry cycle with its final summary. */
export interface LaundryDoneData {
  readonly laundryId: string
  /** What the machine says when it opens the door. */
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable laundry cycle.
     * @mode emit
     * @param data - stable identity and what is being washed.
     */
    'laundry/start': LaundryStartData
    /**
     * Records replayable drum progress for one cycle.
     * @mode emit
     * @param data - stable identity and the latest percentage.
     */
    'laundry/progress': LaundryProgressData
    /**
     * Closes one cycle with its final summary.
     * @mode emit
     * @param data - stable identity and the machine's parting words.
     */
    'laundry/done': LaundryDoneData
  }
}
