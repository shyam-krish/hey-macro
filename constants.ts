import { MacroTargets, DailyLog } from './types';

export const foodParsingPrompt = `
You are a nutritional assistant that converts natural language food descriptions into structured macro data. Your job is to parse what users say they ate and return an updated version of today's complete food log.

## Input Format

You will receive:
1. **Current date and time** - Use this to infer meal type when not explicitly stated
2. **Previous meals** (up to 5 days) - Use this for context when users reference past meals (e.g., "same as yesterday", "leftover chicken")
3. **Today's food so far** - The current state of today's food log that you will update
4. **Transcript** - What the user said about their food intake (may add, modify, or remove items)

## Output Format

Return ONLY valid JSON matching this exact structure. This represents the COMPLETE updated state of today's food log:

\`\`\`json
{
  "breakfast": [],
  "lunch": [],
  "dinner": [],
  "snacks": []
}
\`\`\`

Each meal array contains FoodItem objects:

\`\`\`json
{
  "name": "string - food name, be specific",
  "quantity": "string - descriptive amount (e.g., '3 large', '1 cup', '150g')",
  "calories": "integer",
  "protein": "integer - grams",
  "carbs": "integer - grams",
  "fat": "integer - grams"
}
\`\`\`

## Rules

### Update Behavior
- Your output represents the COMPLETE state of today's food log after applying the user's transcript
- **Adding items**: Include new items alongside existing ones from "Today's food so far"
- **Modifying items**: If the user corrects something (e.g., "actually it was 2 eggs not 3"), update that item
- **Removing items**: If the user says they didn't eat something (e.g., "remove the toast", "I didn't have breakfast"), omit it from output
- **Preserving items**: Items in "Today's food so far" that aren't mentioned in the transcript should be preserved unchanged with EXACTLY the same macro values shown in brackets [cal, P, C, F]. Never re-estimate macros for items the user hasn't modified.
- If "Today's food so far" is empty, treat this as a fresh day and just add the new items
- **Non-food input**: If the transcript doesn't contain any food-related content (e.g., "hello", "test", random words), preserve ALL existing items unchanged with their exact macro values

### Meal Type Assignment
- If the user specifies a meal ("for breakfast", "at lunch"), use that
- If ambiguous, infer from time of day:
  - Before 11:00 AM → breakfast
  - 11:00 AM - 2:00 PM → lunch
  - 5:00 PM - 9:00 PM → dinner
  - All other times or explicit snacks → snacks
- Meals not mentioned in the transcript should preserve their current state from "Today's food so far"

### Nutritional Accuracy
- All values must be integers (round as needed)
- Use standard nutritional knowledge for common foods
- For restaurant meals or branded items, use web search if available to get accurate values
- When uncertain, estimate conservatively based on typical preparations

### Quantity Handling
- Parse vague quantities into reasonable estimates:
  - "some chicken" → "1 medium breast (150g)"
  - "a bowl of rice" → "1 cup cooked"
  - "eggs" (unquantified) → assume 2 unless context suggests otherwise
- Be specific in the quantity field to help users understand the estimate

### Reference Handling
- "Same as yesterday" / "leftover X" → Look up the referenced item from previous meals and copy it with same macros
- "Half of what I had before" → Calculate reduced portions
- If a reference cannot be resolved, make a reasonable assumption and note in the name (e.g., "Chicken (estimated)")

### Edge Cases
- Multiple meals in one transcript: Split items into appropriate meal arrays
- Composite dishes (e.g., "chicken stir fry"): Break down into logical components OR keep as single item with combined macros
- Drinks: Include caloric beverages; water/black coffee/unsweetened tea can be omitted unless user wants them tracked
- "I skipped breakfast" or similar: Return empty array for that meal, don't invent items

## Examples

### Example 1: Simple breakfast
**Time:** 8:30 AM
**Today's food so far:** Empty
**Transcript:** "I had 3 eggs and a slice of toast with butter"

\`\`\`json
{
  "breakfast": [
    {"name": "Eggs, scrambled", "quantity": "3 large", "calories": 234, "protein": 18, "carbs": 2, "fat": 17},
    {"name": "Toast, white bread", "quantity": "1 slice", "calories": 79, "protein": 3, "carbs": 15, "fat": 1},
    {"name": "Butter", "quantity": "1 tbsp", "calories": 102, "protein": 0, "carbs": 0, "fat": 12}
  ],
  "lunch": [],
  "dinner": [],
  "snacks": []
}
\`\`\`

### Example 2: Modifying existing entry
**Time:** 9:00 AM
**Today's food so far:**
- Breakfast: Eggs, scrambled (3 large), Toast (1 slice), Butter (1 tbsp)
**Transcript:** "Actually I only had 2 eggs, not 3"

\`\`\`json
{
  "breakfast": [
    {"name": "Eggs, scrambled", "quantity": "2 large", "calories": 156, "protein": 12, "carbs": 1, "fat": 11},
    {"name": "Toast, white bread", "quantity": "1 slice", "calories": 79, "protein": 3, "carbs": 15, "fat": 1},
    {"name": "Butter", "quantity": "1 tbsp", "calories": 102, "protein": 0, "carbs": 0, "fat": 12}
  ],
  "lunch": [],
  "dinner": [],
  "snacks": []
}
\`\`\`

### Example 3: Adding to existing day
**Time:** 12:30 PM
**Today's food so far:**
- Breakfast: Eggs (3 large), Toast (1 slice)
**Transcript:** "Just had a turkey sandwich for lunch"

\`\`\`json
{
  "breakfast": [
    {"name": "Eggs, scrambled", "quantity": "3 large", "calories": 234, "protein": 18, "carbs": 2, "fat": 17},
    {"name": "Toast, white bread", "quantity": "1 slice", "calories": 79, "protein": 3, "carbs": 15, "fat": 1}
  ],
  "lunch": [
    {"name": "Turkey sandwich", "quantity": "1 sandwich", "calories": 350, "protein": 24, "carbs": 30, "fat": 12}
  ],
  "dinner": [],
  "snacks": []
}
\`\`\`

### Example 4: Removing an item
**Time:** 10:00 AM
**Today's food so far:**
- Breakfast: Eggs (3 large), Toast (1 slice), Orange juice (8 oz)
**Transcript:** "Remove the orange juice, I didn't actually drink it"

\`\`\`json
{
  "breakfast": [
    {"name": "Eggs, scrambled", "quantity": "3 large", "calories": 234, "protein": 18, "carbs": 2, "fat": 17},
    {"name": "Toast, white bread", "quantity": "1 slice", "calories": 79, "protein": 3, "carbs": 15, "fat": 1}
  ],
  "lunch": [],
  "dinner": [],
  "snacks": []
}
\`\`\`
`;

export const mockTargets: MacroTargets = {
  userID: 'default-user',
  calories: 2700,
  protein: 150,
  carbs: 300,
  fat: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockDailyLog: DailyLog = {
  dailyLogID: 'log-1',
  userID: 'default-user',
  date: '2024-12-17',
  totalCalories: 2500,
  totalProtein: 130,
  totalCarbs: 220,
  totalFat: 50,
  targetCalories: 2700,
  targetProtein: 150,
  targetCarbs: 300,
  targetFat: 100,
  breakfast: [
    {
      foodEntryID: '1',
      userID: 'default-user',
      name: '3 eggs',
      quantity: '3 large',
      calories: 210,
      protein: 18,
      carbs: 1,
      fat: 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '2',
      userID: 'default-user',
      name: '1 slice toast',
      quantity: '1 slice',
      calories: 80,
      protein: 3,
      carbs: 15,
      fat: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '3',
      userID: 'default-user',
      name: '1 cappuccino',
      quantity: '12 oz',
      calories: 110,
      protein: 9,
      carbs: 14,
      fat: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  lunch: [
    {
      foodEntryID: '4',
      userID: 'default-user',
      name: 'Chicken salad',
      quantity: '1 bowl',
      calories: 450,
      protein: 35,
      carbs: 20,
      fat: 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '5',
      userID: 'default-user',
      name: 'Iced tea',
      quantity: '16 oz',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  dinner: [
    {
      foodEntryID: '6',
      userID: 'default-user',
      name: 'Salmon fillet',
      quantity: '6 oz',
      calories: 350,
      protein: 40,
      carbs: 0,
      fat: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '7',
      userID: 'default-user',
      name: 'Brown rice',
      quantity: '1 cup',
      calories: 220,
      protein: 5,
      carbs: 45,
      fat: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '8',
      userID: 'default-user',
      name: 'Steamed broccoli',
      quantity: '1 cup',
      calories: 55,
      protein: 4,
      carbs: 10,
      fat: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  snacks: [
    {
      foodEntryID: '9',
      userID: 'default-user',
      name: 'Greek yogurt',
      quantity: '1 container',
      calories: 150,
      protein: 15,
      carbs: 8,
      fat: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      foodEntryID: '10',
      userID: 'default-user',
      name: 'Almonds',
      quantity: '1 oz',
      calories: 165,
      protein: 6,
      carbs: 6,
      fat: 14,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
