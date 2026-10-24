'use client';

import { useState } from 'react';
import { FormErrors } from '@/components/ui/field';
import type { ActionResult } from '@/lib/errors';
import { resultMessages } from '@/lib/parse-input';
import { THEME_LABELS, THEMES, type Theme } from '@/lib/theme';

/** Three radios; a choice is saved at once and the layout re-renders with it. */
export function ThemePicker({
  current,
  onChange,
}: {
  current: Theme;
  onChange: (theme: Theme) => Promise<ActionResult<null>>;
}) {
  const [selected, setSelected] = useState(current);
  const [messages, setMessages] = useState<string[]>([]);

  async function choose(theme: Theme) {
    setSelected(theme);
    setMessages([]);
    const result = await onChange(theme);
    if (!result.ok) {
      setSelected(current);
      setMessages(resultMessages(result));
    }
  }

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 text-base font-bold">Tema</legend>
      <FormErrors messages={messages} />
      {THEMES.map((theme) => (
        <label key={theme} className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input
            type="radio"
            name="theme"
            value={theme}
            checked={selected === theme}
            onChange={() => choose(theme)}
            className="size-5 shrink-0"
          />
          <span>{THEME_LABELS[theme]}</span>
        </label>
      ))}
    </fieldset>
  );
}
