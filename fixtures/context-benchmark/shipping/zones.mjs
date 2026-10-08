export function zoneForPostalCode(postalCode) {
  const prefix = String(postalCode).slice(0, 2);
  return Number(prefix) < 30 ? 'near' : 'far';
}
