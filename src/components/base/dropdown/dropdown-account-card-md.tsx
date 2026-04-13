'use client'

import { useState } from 'react'
import {
  ChevronSelectorVertical,
  HelpCircle,
  LogOut01,
  Moon01,
  Plus,
  Settings01,
  User01,
} from '@untitledui/icons'
import type { Selection } from 'react-aria-components'
import { Button as AriaButton, SubmenuTrigger } from 'react-aria-components'
import { Dropdown } from '@/components/base/dropdown/dropdown'
import { cx } from '@/utils/cx'
import { AvatarLabelGroup } from '../avatar/avatar-label-group'

export const DropdownAccountCardMD = () => {
  const [selectedAccount, setSelectedAccount] = useState<Selection>(
    new Set(['untitledui'])
  )
  const [selectedTheme, setSelectedTheme] = useState<Selection>(
    new Set(['light-mode'])
  )

  return (
    <Dropdown.Root>
      <AriaButton
        className={({ isPressed, isFocusVisible }) =>
          cx(
            'bg-primary_alt inset-ring-border-secondary outline-focus-ring relative w-60 cursor-pointer rounded-lg p-2 text-left inset-ring-1 outline-offset-2',
            (isPressed || isFocusVisible) && 'outline-2'
          )
        }
      >
        <AvatarLabelGroup
          size="md"
          src="https://www.untitledui.com/images/avatars/olivia-rhye?fm=webp&q=80"
          status="online"
          title="Olivia Rhye"
          subtitle="olivia@untitledui.com"
        />

        <div className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md">
          <ChevronSelectorVertical className="text-fg-quaternary size-4 shrink-0 stroke-[2.25px]" />
        </div>
      </AriaButton>

      <Dropdown.Popover className="w-60">
        <div className="border-secondary flex flex-col border-b px-4 py-3">
          <p className="text-primary text-sm font-semibold">PRO account</p>
          <p className="text-tertiary text-sm">Renews 10 August 2028</p>
        </div>
        <Dropdown.Menu>
          <Dropdown.Item icon={User01} addon="⌘K->P">
            View profile
          </Dropdown.Item>
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

          <SubmenuTrigger>
            <Dropdown.Item icon={HelpCircle}>Support</Dropdown.Item>

            <Dropdown.Popover placement="right top" offset={-6}>
              <Dropdown.Menu>
                <Dropdown.Item>Help center</Dropdown.Item>
                <Dropdown.Item>Contact support</Dropdown.Item>
                <Dropdown.Item>Send feedback</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </SubmenuTrigger>

          <Dropdown.Separator />

          <Dropdown.Section
            selectionMode="single"
            selectedKeys={selectedAccount}
            onSelectionChange={setSelectedAccount}
          >
            <Dropdown.SectionHeader className="text-brand-secondary px-4 pt-1.5 pb-0.5 text-xs font-semibold">
              Company
            </Dropdown.SectionHeader>

            <Dropdown.Item id="untitledui">Untitled UI</Dropdown.Item>
            <Dropdown.Item id="sisyphus">Sisyphus Ventures</Dropdown.Item>
          </Dropdown.Section>

          <Dropdown.Item icon={Plus}>New company</Dropdown.Item>

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
        <div className="border-secondary flex justify-between border-t px-4 py-3">
          <span className="text-quaternary truncate text-sm">
            &copy; Untitled UI
          </span>
          <span className="text-quaternary text-sm">v12.6.8</span>
        </div>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}
