/**
 * grill-send-button — pure Node contract spec.
 *
 * The plugin's UI half (slot registration, React render, inputActions
 * driving) can only run in the browser, so what is verifiable without one is
 * pinned here: the exported identity, the exact trigger phrase, the busy guard
 * that decides whether a click may send, and apply's fail-safe when the slots
 * service is absent. The click path itself is proved in the running GUI via
 * the dynamic Cordis flow — see the example README for the division of labour.
 */
import { describe, expect, it } from 'vitest'

import { GRILL_TRIGGER, apply, buildGrillSend, inject, name } from '../src/index'

describe('grill-send-button contract', () => {
  it('exports the plugin identity', () => {
    expect(name).toBe('grill-send-button')
    expect(inject).toContain('slots')
  })

  it('pins the exact trigger phrase the button sends', () => {
    expect(GRILL_TRIGGER).toBe('grill me')
  })

  it('sends the trigger when the input machine is idle', () => {
    expect(buildGrillSend(false)).toBe('grill me')
  })

  it('refuses to send while the input machine is busy', () => {
    expect(buildGrillSend(true)).toBeNull()
  })

  it('no-ops without throwing when the slots service is absent', () => {
    const ctx = { get: () => undefined } as any
    expect(() => apply(ctx)).not.toThrow()
  })
})
