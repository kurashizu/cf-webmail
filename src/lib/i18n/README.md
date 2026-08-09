# Internationalization

Hand-rolled, SSR-safe i18n for the KRSZ Mail web client. Five locales:
**English** (default), **简体中文**, **繁體中文**, **日本語**, **한국어**.

## Architecture

```
src/lib/i18n/
├── locale.ts          # Locale type, BCP-47 mapping, Accept-Language parser
├── index.ts           # Client store, t(), setLocale(), initLocale()
└── messages/
    ├── index.ts       # MESSAGES table, MessageKey type, dev-mode coverage log
    ├── en.ts          # English — source of truth (all keys live here)
    ├── zh-CN.ts       # Simplified Chinese — Partial<typeof en>
    ├── zh-TW.ts       # Traditional Chinese — Partial<typeof en>
    ├── ja.ts          # Japanese — Partial<typeof en>
    └── ko.ts          # Korean — Partial<typeof en>
```

The `t()` function takes an explicit locale parameter (no global state),
so SSR and client rendering always agree.

```ts
import { t, type Locale } from '$lib/i18n';

t('zh-CN' as Locale, 'landing.heading1');
// → "为你而生的"

t('en' as Locale, 'inbox.unreadCount', { count: 5 });
// → "5 messages"

t('en' as Locale, 'inbox.unreadCount', { count: 1 });
// → "1 message"  (uses inbox.unreadCount_one)
```

## Locale detection

Precedence (in `hooks.server.ts`):

1. **`krsz-lang` cookie** — explicit user choice from the language picker.
2. **`Accept-Language` header** — browser preference, parsed via the
   `negotiateLocale()` helper in `locale.ts`. Generic `zh` falls back
   to Simplified; explicit `zh-TW` / `zh-HK` / `zh-Hant` go to Traditional.
3. **Default** — `en`.

The chosen locale is set on `event.locals.locale`, returned from each
`+layout.server.ts`, and re-applied on the client by `initLocale()`.

## Adding a new locale

1. Add the BCP-47 code to `LOCALES` in `locale.ts`.
2. Add a `LOCALE_LABELS` and `LOCALE_BCP47` entry.
3. Create `messages/<bcp47>.ts` with `Partial<typeof en>` — copy the
   header comment from one of the existing files and fill in keys.
4. Import + register it in `messages/index.ts` (one import, one entry
   in `MESSAGES`).
5. Add the locale to the picker component's option list
   (`src/lib/components/LanguagePicker.svelte`).

## Adding a new message key

1. Add the key to `en.ts` first — this is the source of truth.
   Use the `<area>.<element>[.<variant>]` naming pattern. Group by
   area; the comment dividers in `en.ts` show the conventions.
2. Optionally add translations in other locale files. Untranslated
   keys fall back to the English string at runtime, so partial
   translations work fine.
3. The dev-mode console log in `messages/index.ts` will report
   `<locale> is missing N/M translations (XX% coverage)` whenever a
   translated page is rendered with gaps — useful while iterating.

### English plurals

Suffix the key with `_one` for the singular override:

```ts
'inbox.unreadCount':         '{count} messages',  // default (count !== 1)
'inbox.unreadCount_one':     '{count} message',   // count === 1
```

`t()` checks `params.count === 1` and prefers the `_one` variant.
CJK languages do **not** need plural variants — they use a single
form regardless of count.

### Variables

Use `{name}` placeholders. Pass `{ name: value }` as the second
argument to `t()`:

```ts
t(locale, 'storage.banner.bodyHigh', { bytesPercent: 92 });
// en: "You are using 92% of your storage quota. ..."
// zh-CN: "你已使用存储配额的 92%。..."
```

### What NOT to translate

- Brand name `KRSZ Mail`
- Domain `krsz.in`
- Technical terms: `API`, `JSON`, `HTML`, `URL`, `MB`
- Email addresses and URLs
- Code samples
- Field names shown in code blocks (`to`, `subject`, etc.)

## Maintenance workflow

- **Coverage audit**: open the browser DevTools console on any page
  with translations missing; the i18n module logs coverage per locale.
- **Type safety**: TypeScript will flag any misspelled key in a
  translation file because each file is typed as
  `Partial<typeof en>`. Renaming a key in `en.ts` will produce
  compile errors in every translation file that uses the old name.
- **Adding formatters later**: if you need Intl plurals or relative
  time, add them as helpers alongside `t()` rather than as another
  library — keeps the bundle zero-dependency.
