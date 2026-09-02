/**
 * Browser plugin entry for the laundromat's Client half: registers the
 * `laundry-job` Definition with the conversation event registry and a keyed
 * renderer for the `conversation.chat.node` slot. Both registrations are
 * fiber-scoped — unload removes them.
 * @module laundry-node
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { laundryDefinition } from './definition.ts'
import { LaundryNodeView } from './view.tsx'

export const name = 'laundry-node'
export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(laundryDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'laundry-job',
  }, LaundryNodeView))
}
