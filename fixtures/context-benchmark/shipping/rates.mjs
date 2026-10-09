import { zoneForPostalCode } from './zones.mjs';

export function shippingRate(postalCode, weight) {
  const base = zoneForPostalCode(postalCode) === 'near' ? 500 : 900;
  return base + Math.max(0, Math.ceil(weight - 1)) * 125;
}
