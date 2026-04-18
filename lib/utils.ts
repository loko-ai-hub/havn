import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Title-cases a string: capitalizes the first letter of each word.
 * Preserves all-caps abbreviations (HOA, LLC, COA, etc.).
 */
export function toTitleCase(str: string): string {
  return str.replace(/\b\w+/g, (word) =>
    word.toUpperCase() === word && word.length > 1
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}
