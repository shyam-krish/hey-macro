# Hey Macro

Voice-first iOS macro tracking app built with React Native/Expo.

## What This App Does

Users speak or type what they ate, the app sends it to an LLM for nutritional analysis, and logs the macros against daily targets. Tracks calories, protein, carbs, and fat, organized by meal (breakfast, lunch, dinner, snacks).

## Tech Stack

- **Framework**: React Native with Expo (blank-typescript template)
- **Storage**: expo-sqlite (local only, no backend)
- **Voice**: @react-native-voice/voice (local speech-to-text)
- **LLM Providers**: OpenAI (default) and Google Gemini
- **Schema Validation**: Zod
- **Language**: TypeScript
- **Package Manager**: Yarn

## External Libraries
Always use context7 when I need code generation for a library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

## Directory Structure

```
hey-macro/
├── App.tsx                    # Main entry point, all UI starts here
├── types.ts                   # TypeScript interfaces
├── constants.ts               # System prompts and mock data
├── app.json
├── package.json
├── hooks/
│   ├── useAppData.ts          # Main app data hook
│   ├── useVoiceInput.ts       # Voice recording hook
│   └── useVoiceFoodLogger.ts  # Voice + LLM integration
├── services/
│   ├── llmTypes.ts            # Common LLM types and Zod schemas
│   ├── openai.ts              # OpenAI Responses API provider
│   ├── gemini.ts              # Google Gemini provider
│   ├── llm.ts                 # Unified LLM interface
│   └── storage.ts             # SQLite operations
└── .claude/
    └── CLAUDE.md
```

Structure has emerged organically - hooks for React state, services for business logic.

## UI Layout

```
┌─────────────────────────────────────────┐
│                                         │
│   ┌───────┐    Protein      130/150 ━━━ │
│   │ 2500  │    Carbs        220/300 ━━━ │
│   │ /2700 │    Fat           50/90  ━━━ │
│   └───────┘                             │
│      ○ (ring)                           │
│                                         │
│  Food                                   │
│  ─────────────────────────────────────  │
│  Breakfast                              │
│  ┌─────────────────────────┬──────────┐ │
│  │ - 3 eggs                │ 400 cal  │ │
│  │ - 1 slice toast         │ 30g P    │ │
│  │ - 1 cappuccino          │ 30g C    │ │
│  │                         │ 7g F     │ │
│  └─────────────────────────┴──────────┘ │
│                                         │
│  Lunch                                  │
│  ┌─────────────────────────┬──────────┐ │
│  │ - ...                   │ ...      │ │
│  └─────────────────────────┴──────────┘ │
│                                         │
│  Dinner                                 │
│  ┌─────────────────────────┬──────────┐ │
│  │ - ...                   │ ...      │ │
│  └─────────────────────────┴──────────┘ │
│                                         │
│  Snacks                                 │
│  ┌─────────────────────────┬──────────┐ │
│  │ - ...                   │ ...      │ │
│  └─────────────────────────┴──────────┘ │
│                                         │
│   ┌─────┐                   ┌─────┐    │
│   │ Aa  │                   │ 🎤  │    │
│   └─────┘                   └─────┘    │
│   (text)                    (voice)    │
└─────────────────────────────────────────┘
```

### UI Components

1. **Macro Summary (top)**
   - Calorie ring: circular progress showing current/target
   - Three horizontal progress bars: protein, carbs, fat with current/target labels

2. **Food Section (scrollable)**
   - Grouped by meal: Breakfast, Lunch, Dinner, Snacks
   - Each meal card shows:
     - Left: list of food items with quantity
     - Right: total macros for that meal (cal, P, C, F)
   - Empty meals can be hidden or show "No items"

3. **Floating Action Buttons (bottom)**
   - Left: Text input button (Aa) - opens text entry modal
   - Right: Microphone button (M) - starts voice recording
   - Fixed position, always visible

## Data Models

```typescript
export interface BaseEntity {
  createdAt: string;
  updatedAt: string;
}

export interface User extends BaseEntity {
  userID: string;
  firstName: string;
  lastName: string;
}

export interface MacroTargets extends BaseEntity {
  userID: string;
  calories: number;
  protein: number;   // grams
  carbs: number;     // grams
  fat: number;       // grams
}

export interface FoodEntry extends BaseEntity, FoodItem {
  foodEntryID: string;
  userID: string;
}

export interface FoodItem {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DailyLog extends BaseEntity {
  dailyLogID: string;
  userID: string;
  date: string;           // YYYY-MM-DD
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  breakfast: FoodEntry[];
  lunch: FoodEntry[];
  dinner: FoodEntry[];
  snacks: FoodEntry[];
}

export interface LLMResponse {
  breakfast: FoodItem[];
  lunch: FoodItem[];
  dinner: FoodItem[];
  snacks: FoodItem[];
}
```

## Database Schema (SQLite)

```sql
-- User (single user for now, but future-proofed)
CREATE TABLE users (
  userID TEXT PRIMARY KEY,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Macro targets
CREATE TABLE macro_targets (
  userID TEXT PRIMARY KEY,
  calories INTEGER NOT NULL,
  protein INTEGER NOT NULL,
  carbs INTEGER NOT NULL,
  fat INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userID) REFERENCES users(userID)
);

-- Daily logs
CREATE TABLE daily_logs (
  dailyLogID TEXT PRIMARY KEY,
  userID TEXT NOT NULL,
  date TEXT NOT NULL,
  totalCalories INTEGER DEFAULT 0,
  totalProtein INTEGER DEFAULT 0,
  totalCarbs INTEGER DEFAULT 0,
  totalFat INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userID) REFERENCES users(userID)
);

CREATE UNIQUE INDEX idx_daily_logs_user_date ON daily_logs(userID, date);

-- Food entries
CREATE TABLE food_entries (
  foodEntryID TEXT PRIMARY KEY,
  userID TEXT NOT NULL,
  dailyLogID TEXT NOT NULL,
  mealType TEXT NOT NULL,       -- 'breakfast' | 'lunch' | 'dinner' | 'snacks'
  name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein INTEGER NOT NULL,
  carbs INTEGER NOT NULL,
  fat INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userID) REFERENCES users(userID),
  FOREIGN KEY (dailyLogID) REFERENCES daily_logs(dailyLogID)
);

CREATE INDEX idx_food_entries_daily_log ON food_entries(dailyLogID);
```

## Core User Flows

### Voice Input Flow
```
Tap mic button
    ↓
Recording starts (visual feedback)
    ↓
User speaks: "I had 3 eggs and toast for breakfast"
    ↓
Tap again to stop (or auto-stop on silence)
    ↓
Speech-to-text transcription
    ↓
Send to LLM with context (previous entries, time of day)
    ↓
LLM returns structured FoodItems + inferred meal type
    ↓
Save to database, update UI
```

### Text Input Flow
```
Tap text button
    ↓
Modal/sheet opens with text input
    ↓
User types: "chicken salad for lunch, about 400 cal"
    ↓
Submit to LLM
    ↓
Same flow as voice from here
```

## LLM Integration

### Architecture

The app uses a **model-agnostic architecture** with support for multiple LLM providers:

**Providers:**
- **OpenAI** (default) - `gpt-5.4-mini-2026-03-17` via Responses API
  - ✅ Web search tool (`web_search_preview`)
  - ✅ Structured JSON schema with Zod
  - ✅ Reasoning capability
- **Gemini** - `gemini-2.5-flash` / `gemini-3-flash-preview` via generateContent
  - ✅ Structured JSON schema
  - ✅ Thinking/reasoning capability
  - ⚠️ Web search + structured output can be unreliable on preview models

**Schema Validation:**
Uses Zod schemas for type-safe parsing:
```typescript
const FoodItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const LLMResponseSchema = z.object({
  breakfast: z.array(FoodItemSchema),
  lunch: z.array(FoodItemSchema),
  dinner: z.array(FoodItemSchema),
  snacks: z.array(FoodItemSchema),
});
```

**Input:**
- User's transcript (voice or text)
- Current time (to help infer meal type)
- Previous day's logs (for "leftovers" context)
- System prompt with detailed instructions

**Output:**
Structured JSON guaranteed to match the schema:
```json
{
  "breakfast": [
    { "name": "eggs", "quantity": "3 large", "calories": 210, "protein": 18, "carbs": 1, "fat": 15 }
  ],
  "lunch": [],
  "dinner": [],
  "snacks": []
}
```

**Features:**
- Parse natural language into structured food items
- Estimate macros (using web search for OpenAI)
- Infer meal type from context/time if not explicit
- Handle references like "same as yesterday" or "leftover chicken"
- Low-effort reasoning for better nutritional estimates

## Implementation Order

1. **Types & Storage** - Define types.ts, set up SQLite in storage.ts
2. **Static UI** - Build the layout with hardcoded data
3. **Wire Storage** - Load/save real data, show actual state
4. **Text Input** - Add the text input flow (simpler than voice)
5. **LLM Integration** - Connect text input to LLM, parse response
6. **Voice Input** - Add recording and speech-to-text
7. **Polish** - Edit/delete entries, error handling, design tweaks

## Conventions

- Single user assumed (no auth), userID can be hardcoded "default-user"
- Dates stored as ISO strings (YYYY-MM-DD for date, full ISO for timestamps)
- All macros stored as integers (round as needed)
- IDs generated with uuid v4
- Meal types: 'breakfast' | 'lunch' | 'dinner' | 'snacks'

## Environment Variables

Required API keys:
```
EXPO_PUBLIC_OPENAI_API_KEY=sk-...      # For OpenAI (default provider)
EXPO_PUBLIC_GEMINI_API_KEY=...         # For Gemini (optional)
```

## Running the App

```bash
yarn start              # Start Expo dev server
yarn start --tunnel     # Use if local network issues
```

Press `i` for iOS simulator or scan QR with Expo Go app.

## Not In Scope (MVP)

- User authentication / multiple users
- Cloud sync / backend
- History trends / charts
- Meal planning
- Barcode scanning
- Settings screen for targets (hardcode initially)