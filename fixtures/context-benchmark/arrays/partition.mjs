export function partition(values, predicate) {
  const yes = [], no = [];
  for (const value of values) (predicate(value) ? yes : no).push(value);
  return [yes, no];
}
