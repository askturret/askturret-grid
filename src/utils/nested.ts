/**
 * Helper to get nested values from objects using dot notation paths.
 * Example: getNestedValue(obj, "user.name") returns obj.user.name
 */
export function getNestedValue<T>(obj: T, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object' && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj as unknown);
}
