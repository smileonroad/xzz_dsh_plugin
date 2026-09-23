import { describe, expect, it } from 'vitest'
import { laundryDefinition, type LaundryChatData } from '../src/client/definition.ts'
import { projectLaundry } from '../src/client/presentation.ts'

/**
 * The chat card renderer (src/client/view.tsx) is a thin mapping from
 * `node.data` through `projectLaundry` to markup, so the renderer's whole
 * behavior — the only logic a card contains — is pinned here without a react
 * dependency. Examples directories resolve no react (pnpm strict layout), so
 * the projection is deliberately React-free.
 */

describe('laundry-view: the chat card projection', () => {
  it('projects a running card with the drum line and bar width', () => {
    const card: LaundryChatData = { title: '一件衬衫', completed: 45, status: 'running' }
    expect(projectLaundry(card)).toEqual({
      line: '🧺 一件衬衫 — 滚筒洗衣中 45%',
      barWidth: 45,
    })
  })

  it('projects 0% and 99% running cards as-is', () => {
    expect(projectLaundry({ title: '牛仔裤', completed: 0, status: 'running' }).line)
      .toBe('🧺 牛仔裤 — 滚筒洗衣中 0%')
    expect(projectLaundry({ title: '牛仔裤', completed: 99, status: 'running' }).barWidth).toBe(99)
  })

  it('projects a completed card with the summary and no bar', () => {
    const card: LaundryChatData = {
      title: '一件衬衫', completed: 100, status: 'completed', summary: '香喷喷的',
    }
    expect(projectLaundry(card)).toEqual({
      line: '🧺 一件衬衫 洗好了，香喷喷的',
      barWidth: null,
    })
  })

  it('keeps the line readable when a completed card carries no summary', () => {
    expect(projectLaundry({ title: '袜子', completed: 100, status: 'completed' }).line)
      .toBe('🧺 袜子 洗好了，')
  })

  it('exposes the merged renderer kind and target', () => {
    expect(laundryDefinition.kind).toBe('laundry-job')
    expect(laundryDefinition.target).toBe('chat')
  })
})
