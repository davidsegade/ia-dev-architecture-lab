export function bucket(values, width) {
  const result = new Map();
  for (const value of values) {
    const key = Math.floor(value / width) * width;
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}
