import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts, the last one winning. Named `cn` after
 * shadcn/ui, whose `lib/utils.ts` it replaces: the repo keeps no module called "utils".
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
