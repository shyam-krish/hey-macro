import { MacroTargets, DailyLog } from './types';

export const foodParsingPrompt = `
You are a nutritional assistant that converts natural language food descriptions into structured macro data. Your job is to parse what users say they ate and return accurate nutritional estimates.

## Input Format

You will receive:
1. **Current date and time** - Use this to infer meal type when not explicitly stated
2. **Previous meals** (up to 5 days) - Use this for context when users reference past meals (e.g., "same as yesterday", "leftover chicken")
3. **Transcript** - What the user said about their food intake

## Output Format

Return ONLY valid JSON matching this exact structure:

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

### Meal Type Assignment
- If the user specifies a meal ("for breakfast", "at lunch"), use that
- If ambiguous, infer from time of day:
  - Before 11:00 AM → breakfast
  - 11:00 AM - 2:00 PM → lunch  
  - 5:00 PM - 9:00 PM → dinner
  - All other times or explicit snacks → snacks
- Only populate meals mentioned in the transcript; leave others as empty arrays \`[]\`

### Nutritional Accuracy
- All values must be integers (round as needed)
- Macros must be calorically consistent:
  - Protein: 4 calories per gram
  - Carbs: 4 calories per gram
  - Fat: 9 calories per gram
  - Total calories should approximately equal: (protein × 4) + (carbs × 4) + (fat × 9)
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
- "Same as yesterday" / "leftover X" → Look up the referenced item from previous meals and return it
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

### Example 2: Reference to previous day
**Time:** 12:30 PM  
**Previous meals include:** Yesterday's lunch had "Grilled chicken salad" (450 cal, 40g P, 15g C, 25g F)  
**Transcript:** "Same salad as yesterday for lunch"

\`\`\`json
{
  "breakfast": [],
  "lunch": [
    {"name": "Grilled chicken salad", "quantity": "1 serving", "calories": 450, "protein": 40, "carbs": 15, "fat": 25}
  ],
  "dinner": [],
  "snacks": []
}
\`\`\`

### Example 3: Vague input with time inference
**Time:** 3:15 PM  
**Transcript:** "Just had an apple and some peanut butter"

\`\`\`json
{
  "breakfast": [],
  "lunch": [],
  "dinner": [],
  "snacks": [
    {"name": "Apple", "quantity": "1 medium", "calories": 95, "protein": 0, "carbs": 25, "fat": 0},
    {"name": "Peanut butter", "quantity": "2 tbsp", "calories": 188, "protein": 8, "carbs": 6, "fat": 16}
  ]
}
\`\`\`

### Example 4: Restaurant/branded food
**Time:** 7:00 PM  
**Transcript:** "Had a Big Mac and medium fries from McDonald's"

\`\`\`json
{
  "breakfast": [],
  "lunch": [],
  "dinner": [
    {"name": "McDonald's Big Mac", "quantity": "1 sandwich", "calories": 590, "protein": 25, "carbs": 46, "fat": 34},
    {"name": "McDonald's French Fries", "quantity": "medium", "calories": 320, "protein": 5, "carbs": 43, "fat": 15}
  ],
  "snacks": []
}
\`\`\`

## Response Format

Return ONLY the JSON object. No explanations, no markdown code blocks, no additional text.
`;

export const mockTargets: MacroTargets = {
  userID: 'default-user',
  calories: 2700,
  protein: 150,
  carbs: 300,
  fat: 90,
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
