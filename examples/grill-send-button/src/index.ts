/**
 * grill-send-button — add a composer button that sends a preset message.
 *
 * A pure Client (browser) plugin that registers one extra button in the
 * composer tool row (`conversation.input.right`). Clicking it injects a preset
 * trigger phrase through the normal input path — the exact same path the human
 * uses when typing and pressing Enter — so the model receives it as an
 * ordinary user message.
 *
 * The point of the example is the *Client plugin mechanics*, not the message
 * content: how a browser-half plugin registers into a slot, reads the
 * session-scoped `inputActions` from the slot's standard props, and drives the
 * composer through `setDraft` + `submit` instead of reaching for a Host API.
 * The click logic lives in a pure function ({@link buildGrillSend}) so a plain
 * Node vitest can pin the contract without a browser.
 *
 * @module grill-send-button
 */

/** The exact message sent on click. Kept as one constant: the exact text is
 * what gets submitted, so changing it changes the behaviour under test. */
export const GRILL_TRIGGER = 'grill me'

/**
 * Build the message the button sends. Pure and synchronous so the click path
 * is testable without React, the slot system, or a browser.
 * @param busy - true when the input machine is adjudicating/submitting; a busy
 * machine must not be interrupted with a new submit.
 * @returns the trigger phrase, or null when the machine is busy.
 */
export function buildGrillSend(busy: boolean): string | null {
  if (busy) return null
  return GRILL_TRIGGER
}

/**
 * Client plugin body: register the grill-send button into the composer tool
 * row. Mounted through the dynamic Cordis flow with code.client = the exported
 * plugin object (plain JS); for a static package the same body becomes a repo
 * Client plugin's apply with name/inject/apply exports.
 * @param ctx - the client root context.
 */
export function apply(ctx: any): void {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  slots.inject('conversation.input.right', () => slots.register(
    {
      name: 'conversation.input.right',
      id: 'grill-send',
      order: 1,
      label: () => 'Send grill',
    },
    function SendGrillButton(props: any) {
      const inputActions = props.inputActions
      const input = props.input
      const busy = input && (input.phase === 'adjudicating' || input.phase === 'submitting')
      const message = buildGrillSend(Boolean(busy))
      const onClick = function () {
        if (message === null || !inputActions) return
        // setDraft('') first clears any in-progress draft so the trigger alone
        // is submitted (mirrors replacing the composer content, not appending).
        inputActions.setDraft('')
        inputActions.setDraft(message)
        inputActions.submit()
      }
      return React.createElement(
        'button',
        {
          type: 'button',
          disabled: message === null,
          title: 'Send the preset message "grill me"',
          onClick,
          style: { marginLeft: '4px', fontSize: '12px' },
        },
        '⚡ Grill',
      )
    },
  ))
}

export const inject = ['slots']
export const name = 'grill-send-button'
