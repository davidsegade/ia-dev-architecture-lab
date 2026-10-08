const transitions = { draft: ['submitted'], submitted: ['paid', 'cancelled'], paid: ['shipped'], shipped: [] };

export function canTransition(from, to) {
  return Boolean(transitions[from]?.includes(to));
}
