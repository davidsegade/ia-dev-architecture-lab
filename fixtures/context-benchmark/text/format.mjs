export function sentence(values) {
  return values.filter(Boolean).join(', ');
}
