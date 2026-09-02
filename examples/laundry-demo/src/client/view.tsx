/**
 * One keyed chat renderer for a laundry cycle card.
 *
 * Pure presentation: reads only `node.data` and delegates the whole behavior
 * to the React-free projection in presentation.ts. No session access, no
 * hooks, no ctx — everything the card shows travels in the props the
 * framework hands a keyed `conversation.chat.node` entry.
 * @module laundry-node-view
 */

import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { projectLaundry } from './presentation.ts'

/** Render one durable laundry cycle card from its projected data. */
export function LaundryNodeView({ node }: ChatNodeViewProps<'laundry-job'>) {
  const { line, barWidth } = projectLaundry(node.data)
  if (barWidth === null) {
    return <p className="laundry-line">{line}</p>
  }
  return (
    <div className="laundry-card">
      <p className="laundry-line">{line}</p>
      <div className="laundry-bar" style={{ width: `${barWidth}%` }} />
    </div>
  )
}
