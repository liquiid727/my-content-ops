// @vitest-environment jsdom

import type { OperationDefinition } from '@creator-studio/contracts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../modules/i18n'
import { GenerateNextPicker } from './generate-next-picker'

function operation(id: string, label: string): OperationDefinition {
  return {
    id,
    label,
    description: label,
    behavior: 'create',
    input: { roles: ['topic'] },
    output: { kind: 'image', role: 'cover', behavior: 'new_collection' },
    executor: `operation.${id}`,
    defaultConfig: {},
    presentation: { group: 'media', priority: 10, placement: 'secondary', danger: false },
    runtime: { retryable: true },
  }
}

afterEach(cleanup)

describe('GenerateNextPicker', () => {
  it('lists create operations and reports the picked one', () => {
    const onPick = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <GenerateNextPicker
        error={null}
        loading={false}
        onOpenChange={onOpenChange}
        onPick={onPick}
        open
        operations={[operation('generate_cover', '生成封面'), operation('generate_images', '生成配图')]}
      />,
    )
    expect(screen.getByText('从这里继续生成')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '生成封面' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'generate_cover' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
