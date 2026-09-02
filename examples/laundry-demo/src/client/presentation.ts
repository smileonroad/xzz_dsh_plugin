/**
 * Pure, React-free projection of one laundry card from its renderer data.
 *
 * The whole renderer behavior lives here so it is testable from an examples
 * directory (no react dependency resolution is needed): the chat card
 * component (view.tsx) is then only a thin mapping from `node.data` through
 * this function to markup.
 * @module laundry-node-presentation
 */

import type { LaundryChatData } from './definition.ts'

/** The text line and optional drum bar width a laundry card renders. */
export interface LaundryCardProjection {
  readonly line: string
  /** Drum bar width in percent; null once the cycle is done. */
  readonly barWidth: number | null
}

/** Project one laundry card from its chat data. */
export function projectLaundry(data: LaundryChatData): LaundryCardProjection {
  if (data.status === 'completed') {
    return {
      line: `🧺 ${data.title} 洗好了，${data.summary ?? ''}`,
      barWidth: null,
    }
  }
  return {
    line: `🧺 ${data.title} — 滚筒洗衣中 ${data.completed}%`,
    barWidth: data.completed,
  }
}
