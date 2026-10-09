import { applyDiscount } from './discount.mjs';
import { addTax } from './tax.mjs';

export function invoiceAmount(subtotal, discountBps, taxBps) {
  return addTax(applyDiscount(subtotal, discountBps), taxBps);
}
