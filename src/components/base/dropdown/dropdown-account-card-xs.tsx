'use client'

import { useState } from 'react'
import {
  ChevronDown,
  LogOut01,
  Moon01,
  Plus,
  Settings01,
} from '@untitledui/icons'
import type { Selection } from 'react-aria-components'
import { Button as AriaButton, SubmenuTrigger } from 'react-aria-components'
import { Avatar } from '@/components/base/avatar/avatar'
import { Dropdown } from '@/components/base/dropdown/dropdown'
import { cx } from '@/utils/cx'

export const DropdownAccountCardXS = () => {
  const [selectedAccount, setSelectedAccount] = useState<Selection>(
    new Set(['olivia'])
  )
  const [selectedTheme, setSelectedTheme] = useState<Selection>(
    new Set(['light-mode'])
  )

  return (
    <Dropdown.Root>
      <AriaButton
        className={({ isPressed, isFocused }) =>
          cx(
            'bg-primary_alt inset-ring-border-secondary outline-focus-ring relative flex w-38 cursor-pointer items-center gap-1.5 rounded-lg p-2 text-left inset-ring-1 outline-offset-2',
            (isPressed || isFocused) && 'outline-2'
          )
        }
      >
        <Avatar
          size="xs"
          src="https://www.untitledui.com/images/avatars/olivia-rhye?fm=webp&q=80"
          className="size-5"
        />

        <p className="text-primary text-sm font-semibold">Olivia Rhye</p>

        <div className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-md">
          <ChevronDown className="text-fg-quaternary size-4 shrink-0 stroke-[2.25px]" />
        </div>
      </AriaButton>

      <Dropdown.Popover className="w-50">
        <Dropdown.Menu>
          <Dropdown.Item icon={Settings01} addon="⌘S">
            Settings
          </Dropdown.Item>
          <Dropdown.Section
            selectionMode="single"
            selectedKeys={selectedTheme}
            onSelectionChange={setSelectedTheme}
          >
            <Dropdown.Item
              id="dark-mode"
              icon={Moon01}
              selectionIndicator="toggle"
            >
              Dark mode
            </Dropdown.Item>
          </Dropdown.Section>

          <Dropdown.Separator />

          <Dropdown.Section
            selectionMode="single"
            selectedKeys={selectedAccount}
            onSelectionChange={setSelectedAccount}
          >
            <Dropdown.SectionHeader className="text-brand-secondary px-4 pt-1.5 pb-0.5 text-xs font-semibold">
              Switch Account
            </Dropdown.SectionHeader>

            <Dropdown.Item
              id="olivia"
              avatarUrl="https://www.untitledui.com/images/avatars/olivia-rhye?fm=webp&q=80"
              selectionIndicator="radio"
            >
              Olivia Rhye
            </Dropdown.Item>
            <Dropdown.Item
              id="sienna"
              avatarUrl="https://www.untitledui.com/images/avatars/sienna-hewitt?fm=webp&q=80"
              selectionIndicator="radio"
            >
              Sienna Hewitt
            </Dropdown.Item>
          </Dropdown.Section>

          <Dropdown.Item icon={Plus}>Add account</Dropdown.Item>

          <Dropdown.Separator />

          <SubmenuTrigger>
            <Dropdown.Item icon={LogOut01}>Sign out</Dropdown.Item>

            <Dropdown.Popover placement="right top" offset={-6}>
              <Dropdown.Menu>
                <Dropdown.Item>Current device</Dropdown.Item>
                <Dropdown.Item>All devices</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </SubmenuTrigger>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}
