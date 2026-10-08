export function tokenize(value) {
  return String(value).trim().split(/\s+/).filter(Boolean);
}
