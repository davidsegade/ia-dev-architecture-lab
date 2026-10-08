import { shippingRate } from './rates.mjs';

export function quoteShipment(order) {
  return { orderId: order.id, cents: shippingRate(order.postalCode, order.weight) };
}
