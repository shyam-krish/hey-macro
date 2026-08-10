# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Hey Macro

Voice-first iOS macro tracking app (React Native + Expo, TypeScript). Users speak or type what they ate; an LLM parses it into structured macros and logs them against daily targets, organized by meal. Local-only — no backend; the only network calls are to LLM APIs.

## Commands

```bash
yarn install            # Install dependencies
cp .env.example .env    # Then fill in API keys (see Environment Variables)

yarn start              # Expo dev server (note: this runs `expo start --tunnel`)
yarn ios                # Build + run on iOS simulator/device (expo run:ios)
yarn android            # Build + run on Android (expo run:android)
yarn clean              # expo prebuild --clean (regenerate native ios/ android/ dirs)

yarn build              # eas build --platform ios
yarn deploy             # eas submit --platform ios (TestFlight)

npx tsc --noEmit        # Type-check (tsconfig extends expo/tsconfig.base, strict: true)
```

There is **no test suite and no linter configured** — don't look for `yarn test`/`yarn lint`. `npx tsc --noEmit` is the only static check. Verify behavior by running the app.

For library/API docs (Expo, React Navigation, Zod, OpenAI/Gemini SDKs, expo-sqlite), use the Context7 MCP tools automatically rather than relying on memory.

## Architecture

### Data flow & single source of truth

`App.tsx` calls `useAppData()` **exactly once**, then distributes the result through `AppDataProvider` (React context). Every screen reads app state via `useAppDataContext()` — **do not call `useAppData()` again** in screens/components, or you'll create a second, unsynced store. The provider (`contexts/AppDataContext.tsx`) exposes: `user`, `targets`, `dailyLog`, `selectedDate`/`changeDate`/`isToday`, weight state, and mutators (`updateTargets`, `updateUser`, `saveWeight`, `refresh`, `invalidateCache`).

Navigation is a React Navigation native stack (`App.tsx`) with three screens: `Home`, `Profile`, `Trends` (types in `navigation/types.ts`, headers hidden, black background).

### The in-memory day cache (important gotcha)

`hooks/useAppData.ts` keeps a `Map<date, DailyLog>` and **prefetches ±`PREFETCH_DAYS` (7) surrounding days** so date switching is instant. Consequence: **after any DB mutation for a date, that date's cache is stale.** The pattern used throughout is `invalidateCache(date)` then `refresh()` (or `changeDate`). If you add a new write path and the UI doesn't update, a missing cache invalidation is the usual cause.

### Per-day target snapshots

Daily targets aren't purely global. When a `daily_logs` row is created, the current macro targets are **snapshotted** into `targetCalories/targetProtein/targetCarbs/targetFat` columns (`getOrCreateDailyLog`). `updateMacroTargets` updates the global row **and today's log only** — past days keep the targets they were logged under. Trends and the calendar read these per-day snapshots, so changing targets never retroactively rewrites history.

### LLM layer (`services/`)

Model-agnostic. `services/llm.ts` is the only entry point callers use; it selects a provider and builds prompts:

- **`parseFoodInput()`** — food logging. Given the transcript, current time, today's log, and previous days, returns an `LLMResponse` (`{breakfast, lunch, dinner, snacks}`). **This is a replace-all model:** the prompt instructs the LLM to return the *entire updated day*, and `replaceDailyFoodEntries()` deletes all of the day's `food_entries` and re-inserts the returned set inside one transaction. It is **not** an append — the "today's food so far" context is what preserves existing items.
- **`getRecommendation()`** — nutrition Q&A chat. Returns `{isValid, answer}`; `isValid=false` gates off-topic questions. Strips markdown/citation links from the answer before display.

Provider abstraction: `LLMProvider` interface (`services/llmTypes.ts`) with `openaiProvider` and `geminiProvider`. `ProviderType` is `'openai' | 'gemini' | 'gemini3'` (the two Gemini values share `geminiProvider`, different models). **`DEFAULT_PROVIDER` in `llm.ts` is `'openai'`** (`gpt-5.4-mini-2026-03-17`) despite the README describing Gemini as default — trust the code. Gemini models: `gemini-2.5-flash`, `gemini-3-flash-preview`.

Structured output is enforced with **Zod schemas** (`llmTypes.ts`): OpenAI uses the Responses API `responses.parse` + `zodTextFormat`; Gemini has a hand-rolled `zodToGeminiSchema` converter, `responseSchema`, then `schema.parse` validation, plus retry-with-backoff and a 5-min timeout. Web search grounding (`web_search_preview` / `googleSearch`) is on for OpenAI and Gemini 3 but **unsupported on Gemini 2.5** (`supportsWebSearch = provider !== 'gemini'`). System prompts live in `constants.ts` (`foodParsingPrompt`, `recommendationPrompt`).

### Voice pipeline

`hooks/useVoiceInput.ts` wraps `@react-native-voice/voice` (on-device STT; resolves the final transcript on `onSpeechEnd` with a 500ms timeout fallback, and silently ignores "no speech detected"). `hooks/useVoiceFoodLogger.ts` composes it with `parseFoodInput` + save, and flags requests that failed because the app was backgrounded mid-processing.

### Storage (`services/storage.ts`)

Single SQLite DB `heymacro.db` (expo-sqlite, WAL mode). `initDatabase()` creates tables and runs `runMigrations()` — schema changes are **additive and idempotent** (checks `PRAGMA table_info`, `CREATE TABLE IF NOT EXISTS`), so extend the schema by adding a migration step there rather than editing the base `CREATE`. Tables: `users`, `macro_targets`, `daily_logs`, `food_entries`, `weight_logs`. All types are in `types.ts`.

### Screens & components

- `screens/HomeScreen.tsx` (large) — calorie ring, macro bars, per-meal cards, the text/voice `InputBar`, and the recommendation chat. Contains most sub-components inline.
- `screens/ProfileScreen.tsx` — edit user + macro targets. Uses `useMacroCalculator` (enter any 3 of calories/protein/carbs/fat, it derives the 4th via 4/4/9 cal-per-gram).
- `screens/TrendsScreen.tsx` — calories-vs-target and weight charts (`getTrendData`) plus per-meal averages (`getMealAverages`); uses `react-native-svg`.
- `components/` — `TopBar`, `CalendarDropdown` (month calorie/weight rings via `getMonthCalorieData`/`getMonthWeightData`), `MealDetailSheet` (view/edit/delete a meal's items), `WeightInputSheet`.

## Conventions & gotchas

- **Single user**, hardcoded `userID = 'default-user'`. No auth.
- **Dates are local `YYYY-MM-DD`, never UTC.** Both `storage.ts` and `useAppData.ts` have their own local-date formatter specifically to avoid the UTC off-by-one; use those helpers, don't reach for `toISOString().split('T')[0]`.
- All macros stored as **integers** (round on the way in — `validateFoodItem` and DB inserts assume this).
- IDs are **uuid v4**; `import 'react-native-get-random-values'` must load **before** `uuid` (see top of `storage.ts`).
- Meal types are exactly `'breakfast' | 'lunch' | 'dinner' | 'snacks'`.
- `constants.ts` `mockTargets`/`mockDailyLog` are the initial state rendered before the DB finishes loading — not test fixtures.

## Environment Variables

```
EXPO_PUBLIC_OPENAI_API_KEY=sk-...   # default provider
EXPO_PUBLIC_GEMINI_API_KEY=...      # for gemini / gemini3 providers
```

At least one key is required (the OpenAI key for the default config). `EXPO_PUBLIC_` prefix is required for Expo to expose them to the client at build time.

## Native iOS rewrite (`HeyMacroNative/`)

The app is being rewritten as a **fully native SwiftUI app** in `HeyMacroNative/` (iOS 26+, Liquid Glass, `SpeechAnalyzer` STT, GRDB). The RN app above stays in place as the **reference spec** until the native app ships; when both exist, feature semantics are defined by the RN code and visual/behavior deltas are deliberate only if noted below. See `HeyMacroNative/README.md` for the full build/verify loop and release checklist.

### Working on it

```bash
cd HeyMacroNative
xcodegen generate       # REQUIRED after adding/removing files or editing project.yml —
                        # HeyMacro.xcodeproj is gitignored and regenerated (never edit it)
xcodebuild build -project HeyMacro.xcodeproj -scheme HeyMacro \
  -destination 'platform=iOS Simulator,name=HeyMacro-Dev,OS=26.3.1'
xcodebuild test  -project HeyMacro.xcodeproj -scheme HeyMacro \
  -destination 'platform=iOS Simulator,name=HeyMacro-Dev,OS=26.3.1'   # unit tests (Swift Testing)
xcrun simctl launch HeyMacro-Dev com.anonymous.hey-macro -seedDemoData  # wipes DB, seeds ~6 weeks of demo data
```

Secrets: `Config/Secrets.xcconfig` (gitignored; copy `Secrets.example.xcconfig`) → injected via Info.plist → read by `Services/Secrets.swift`. Keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LLM_PROVIDER`, `DEVELOPMENT_TEAM`. GRDB is the only package dependency.

### Non-negotiable constraints

- **Bundle ID stays `com.anonymous.hey-macro`** — the native app ships as an update to the existing App Store Connect record so the sandbox persists, and `Database/DatabaseAdoption.swift` migrates the RN expo-sqlite DB (`Documents/SQLite/heymacro.db`, WAL checkpoint → atomic move to `Application Support/Database/`) on first launch. Changing the bundle ID silently orphans every user's data.
- **`Services/LLM/Prompts.swift` is a verbatim port of `constants.ts`** with exactly two sanctioned fixes: timestamps are sent as *local* ISO8601 (the prompt's meal-time rules are wall-clock) and "up to 5 days" → 7. The bracket item format `[N cal, Ng P, Ng C, Ng F]` and the `"Empty"` literal in `PromptFormatter.swift` are load-bearing for the replace-all model — golden tests in `PromptFormatterTests` guard them. If a prompt changes in either codebase, port the change to the other.
- **`Database/DataStore.swift` is a 1:1 port of `storage.ts`** — same schema, same semantics (replace-all save in one transaction, lazy total reconciliation on read, `updateMacroTargets` rewrites *today's* snapshot only). Schema changes go through GRDB migrations in `AppDatabase.swift`, mirrored additively in the RN `runMigrations()` while both apps exist.
- **Voice cannot run on the simulator** (`SpeechTranscriber` model install fails with "not subscribed to transcription.en"). DEBUG simulator builds fake a transcript (`Services/Speech/VoiceInput.swift`); real STT is device-only.

### Deliberate divergences from the RN app

- No ±7-day prefetch cache (GRDB is fast enough; `DayModel` loads per date change).
- Midnight rollover handling added (`.NSCalendarDayChanged` + scenePhase) — the RN app lacks it.
- Haptics added throughout; RN had none.
- Draft input text survives the "?" ask-mode toggle (RN wiped it); red trash icon in the meal editor (RN grey).
- Ring/summary numbers render with locale grouping ("1,249" vs RN's "1249").
- Liquid Glass on chrome only (input bar, top-bar buttons, status card, popovers); meal/weight/stat cards stay flat `#1a1a1a`.
