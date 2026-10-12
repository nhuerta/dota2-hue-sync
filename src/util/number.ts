export function getNumber(value: unknown, defaultValue: number = 0): number {
  return typeof value === 'number' ? value : defaultValue;
}
