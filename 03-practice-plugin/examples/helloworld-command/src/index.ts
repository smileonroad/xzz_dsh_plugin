/**
 * Minimal `ctx.commands` demonstration plugin: a human-facing `/helloworld`
 * command that dispatches without a model turn. It mirrors the function-plugin
 * shape of packages/goal/command-goal but keeps only the command registration,
 * so it is the smallest complete example of the commands extension point.
 * @module helloworld-command-example
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

export const name = 'helloworld-command'
export const inject = ['commands']

/**
 * The command's own grammar: `/helloworld` (no input) and
 * `/helloworld <name>` are the only accepted forms; anything else is a usage
 * error. Parsing stays local to this plugin because no other package owns the
 * greeting vocabulary.
 * @param rawInput - exact text following the command name, separator included.
 * @returns the parsed greeting target, or `undefined` for an invalid line.
 */
function parseName(rawInput: string): string | undefined {
  const input = rawInput.trim()
  if (input.length === 0) return undefined
  if (/\s/u.test(input)) return undefined
  return input
}

/**
 * Render one settled greeting. A `CommandResult` is the direct UI output; it
 * never reaches the model, so the text is presentation-only.
 * @param name - greeting target, or `undefined` for a plain greeting.
 * @returns the success result text.
 */
function renderGreeting(name: string | undefined): CommandResult {
  const greeting = name === undefined
    ? 'Hello! I am the dsh harness.'
    : `Hello, ${name}! Nice to meet you.`
  return { kind: 'success', text: greeting }
}

/** Handle one `/helloworld` invocation against the receiving agent. */
function handler(invocation: CommandInvocation): CommandResult {
  const name = parseName(invocation.rawInput)
  if (name === undefined && invocation.rawInput.trim().length > 0) {
    return {
      kind: 'error',
      text: 'Usage: /helloworld [<name>] — a single word name, no spaces.',
    }
  }
  return renderGreeting(name)
}

/** Register the `/helloworld` command on `ctx.commands`. */
export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'helloworld',
    description: 'greet the user with an optional name',
    input: { hint: '[<name>]' },
    handler,
  })
}
