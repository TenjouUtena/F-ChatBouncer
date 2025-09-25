/**
 * Gender-based color scheme for character names
 * Based on F-List 3.0 standards as specified in the FAQ
 */

export type Gender = 'None' | 'Female' | 'Male' | 'Herm' | 'Male-Herm' | 'Shemale' | 'Cunt-Boy' | 'Transgender';

export interface GenderColorScheme {
  textColor: string;
  backgroundColor?: string;
  borderColor?: string;
}

/**
 * F-List 3.0 gender color mapping
 * Cream = None (3.0 standard)
 * Mauve = None (legacy)
 */
export const genderColorMap: Record<Gender, GenderColorScheme> = {
  'None': {
    textColor: '#F5F5DC', // Cream (3.0 standard)
  },
  'Female': {
    textColor: '#FFB6C1', // Pink
  },
  'Male': {
    textColor: '#ADD8E6', // Light Blue
  },
  'Herm': {
    textColor: '#8B008B', // Dark Purple
  },
  'Male-Herm': {
    textColor: '#00008B', // Dark Blue
  },
  'Shemale': {
    textColor: '#DDA0DD', // Light Purple
  },
  'Cunt-Boy': {
    textColor: '#90EE90', // Green
  },
  'Transgender': {
    textColor: '#FFA500', // Orange
  },
};

/**
 * Get the color scheme for a given gender
 */
export function getGenderColorScheme(gender: string): GenderColorScheme {
  const normalizedGender = (gender || 'None') as Gender;
  return genderColorMap[normalizedGender] || genderColorMap['None'];
}

/**
 * Get the text color for a character's gender
 */
export function getCharacterColor(gender: string): string {
  return getGenderColorScheme(gender).textColor;
}

/**
 * Generate inline style for character name based on gender
 */
export function getCharacterNameStyle(gender: string): React.CSSProperties {
  const colorScheme = getGenderColorScheme(gender);
  return {
    color: colorScheme.textColor,
    fontWeight: 'bold',
  };
}

/**
 * Generate CSS class names for character styling
 */
export function getCharacterClassName(gender: string): string {
  const normalizedGender = (gender || 'None').toLowerCase().replace(/[^a-z]/g, '');
  return `character-gender-${normalizedGender}`;
}

/**
 * Get the gender display name
 */
export function getGenderDisplayName(gender: string): string {
  const normalizedGender = (gender || 'None') as Gender;
  if (genderColorMap[normalizedGender]) {
    return normalizedGender;
  }
  return 'None';
}