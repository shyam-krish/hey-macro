import { useState, useCallback, useMemo } from 'react';
import { MacroTargets } from '../types';

// Caloric constants
const PROTEIN_CALS_PER_GRAM = 4;
const CARBS_CALS_PER_GRAM = 4;
const FAT_CALS_PER_GRAM = 9;

type MacroField = 'calories' | 'protein' | 'carbs' | 'fat';

interface MacroValues {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

interface UseMacroCalculatorReturn {
  values: MacroValues;
  calculatedField: MacroField | null;
  setCalories: (value: string) => void;
  setProtein: (value: string) => void;
  setCarbs: (value: string) => void;
  setFat: (value: string) => void;
  reset: (targets: MacroTargets) => void;
  isValid: boolean;
  error: string | null;
  getFinalValues: () => {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  } | null;
}

function parseValue(value: string): number | null {
  if (value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function countSetFields(values: MacroValues): number {
  let count = 0;
  if (values.calories !== '') count++;
  if (values.protein !== '') count++;
  if (values.carbs !== '') count++;
  if (values.fat !== '') count++;
  return count;
}

function getMissingField(values: MacroValues): MacroField | null {
  if (values.calories === '') return 'calories';
  if (values.protein === '') return 'protein';
  if (values.carbs === '') return 'carbs';
  if (values.fat === '') return 'fat';
  return null;
}

export function useMacroCalculator(
  initialTargets: MacroTargets
): UseMacroCalculatorReturn {
  const [values, setValues] = useState<MacroValues>({
    calories: String(initialTargets.calories),
    protein: String(initialTargets.protein),
    carbs: String(initialTargets.carbs),
    fat: String(initialTargets.fat),
  });

  const [calculatedField, setCalculatedField] = useState<MacroField | null>(
    null
  );

  // Calculate the 4th field when 3 are set
  const calculateMissingField = useCallback(
    (newValues: MacroValues): { values: MacroValues; field: MacroField | null } => {
      const setCount = countSetFields(newValues);

      // Need exactly 3 fields set to auto-calculate the 4th
      if (setCount !== 3) {
        return { values: newValues, field: null };
      }

      const missing = getMissingField(newValues);
      if (!missing) {
        return { values: newValues, field: null };
      }

      const calories = parseValue(newValues.calories);
      const protein = parseValue(newValues.protein);
      const carbs = parseValue(newValues.carbs);
      const fat = parseValue(newValues.fat);

      let calculatedValue: number;

      switch (missing) {
        case 'calories':
          // calories = protein*4 + carbs*4 + fat*9
          calculatedValue =
            protein! * PROTEIN_CALS_PER_GRAM +
            carbs! * CARBS_CALS_PER_GRAM +
            fat! * FAT_CALS_PER_GRAM;
          break;

        case 'protein':
          // protein = (calories - carbs*4 - fat*9) / 4
          calculatedValue =
            (calories! - carbs! * CARBS_CALS_PER_GRAM - fat! * FAT_CALS_PER_GRAM) /
            PROTEIN_CALS_PER_GRAM;
          break;

        case 'carbs':
          // carbs = (calories - protein*4 - fat*9) / 4
          calculatedValue =
            (calories! - protein! * PROTEIN_CALS_PER_GRAM - fat! * FAT_CALS_PER_GRAM) /
            CARBS_CALS_PER_GRAM;
          break;

        case 'fat':
          // fat = (calories - protein*4 - carbs*4) / 9
          calculatedValue =
            (calories! - protein! * PROTEIN_CALS_PER_GRAM - carbs! * CARBS_CALS_PER_GRAM) /
            FAT_CALS_PER_GRAM;
          break;
      }

      // Round to nearest integer
      calculatedValue = Math.round(calculatedValue);

      return {
        values: {
          ...newValues,
          [missing]: String(calculatedValue),
        },
        field: missing,
      };
    },
    []
  );

  const setCalories = useCallback(
    (value: string) => {
      // When calories changes, clear the other fields
      const newValues: MacroValues = {
        calories: value,
        protein: '',
        carbs: '',
        fat: '',
      };
      setValues(newValues);
      setCalculatedField(null);
    },
    []
  );

  const setProtein = useCallback(
    (value: string) => {
      setValues((prev) => {
        // If this field was the calculated one, clear it so user can set manually
        const newValues = {
          ...prev,
          protein: value,
        };

        // Clear the calculated field if user is editing it
        if (calculatedField === 'protein') {
          setCalculatedField(null);
          return newValues;
        }

        // Try to calculate a missing field
        const result = calculateMissingField(newValues);
        setCalculatedField(result.field);
        return result.values;
      });
    },
    [calculatedField, calculateMissingField]
  );

  const setCarbs = useCallback(
    (value: string) => {
      setValues((prev) => {
        const newValues = {
          ...prev,
          carbs: value,
        };

        if (calculatedField === 'carbs') {
          setCalculatedField(null);
          return newValues;
        }

        const result = calculateMissingField(newValues);
        setCalculatedField(result.field);
        return result.values;
      });
    },
    [calculatedField, calculateMissingField]
  );

  const setFat = useCallback(
    (value: string) => {
      setValues((prev) => {
        const newValues = {
          ...prev,
          fat: value,
        };

        if (calculatedField === 'fat') {
          setCalculatedField(null);
          return newValues;
        }

        const result = calculateMissingField(newValues);
        setCalculatedField(result.field);
        return result.values;
      });
    },
    [calculatedField, calculateMissingField]
  );

  const reset = useCallback((targets: MacroTargets) => {
    setValues({
      calories: String(targets.calories),
      protein: String(targets.protein),
      carbs: String(targets.carbs),
      fat: String(targets.fat),
    });
    setCalculatedField(null);
  }, []);

  // Validation
  const validation = useMemo(() => {
    const calories = parseValue(values.calories);
    const protein = parseValue(values.protein);
    const carbs = parseValue(values.carbs);
    const fat = parseValue(values.fat);

    // Check if all fields are filled
    if (
      calories === null ||
      protein === null ||
      carbs === null ||
      fat === null
    ) {
      return { isValid: false, error: null };
    }

    // Check for negative values
    if (calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
      return { isValid: false, error: 'Values cannot be negative' };
    }

    // Check if calories is 0
    if (calories === 0) {
      return { isValid: false, error: 'Calories must be greater than 0' };
    }

    return { isValid: true, error: null };
  }, [values]);

  const getFinalValues = useCallback(() => {
    const calories = parseValue(values.calories);
    const protein = parseValue(values.protein);
    const carbs = parseValue(values.carbs);
    const fat = parseValue(values.fat);

    if (
      calories === null ||
      protein === null ||
      carbs === null ||
      fat === null
    ) {
      return null;
    }

    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    };
  }, [values]);

  return {
    values,
    calculatedField,
    setCalories,
    setProtein,
    setCarbs,
    setFat,
    reset,
    isValid: validation.isValid,
    error: validation.error,
    getFinalValues,
  };
}
