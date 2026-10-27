/** Which sky lights the scene at an hour of the day. */
export function skyFor(hour: number): 'night' | 'dusk' | 'day' {
  if (hour >= 20 || hour < 5) return 'night';
  if (hour < 8 || hour >= 18) return 'dusk';
  return 'day';
}
