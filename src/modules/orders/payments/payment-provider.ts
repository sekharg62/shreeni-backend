import { randomUUID } from 'node:crypto';
import type { PaymentMethod } from '../../../generated/prisma/enums.js';

/*
 * Payment gateways plug in here. The order flow only talks to this interface:
 *   1. the order is saved as PENDING with a CREATED payment and its stock reserved,
 *   2. `start` asks the gateway to collect the money,
 *   3. PAID → OrdersService.confirmPayment (stock is taken, order CONFIRMED);
 *      PENDING → the gateway's webhook/redirect calls confirmPayment later;
 *      FAILED → the order stays PENDING and can be retried or cancelled.
 * Adding Razorpay/UPI/COD later = a new provider + its webhook route; nothing else changes.
 */

export type PaymentStartResult = {
  status: 'PAID' | 'PENDING' | 'FAILED';
  gatewayOrderId?: string;
  gatewayTxnId?: string;
  /** For redirect-style gateways: where to send the shopper. */
  redirectUrl?: string;
};

export interface PaymentProvider {
  /** Stored on Payment.provider, e.g. "test", "razorpay". */
  readonly name: string;
  readonly method: PaymentMethod;
  /** Shown at checkout. */
  readonly label: string;
  start(payment: { orderNumber: string; amount: number }): Promise<PaymentStartResult>;
  /** Give the money back (cancelled/returned paid orders). true = refunded. */
  refund(payment: { gatewayTxnId: string | null; amount: number }): Promise<boolean>;
}

/** Placeholder until a real gateway is connected: "pays" instantly and charges nothing. */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';
  readonly method = 'PREPAID' as const;
  readonly label = 'Test payment (no money is charged)';

  start(): Promise<PaymentStartResult> {
    return Promise.resolve({ status: 'PAID', gatewayTxnId: `test_${randomUUID()}` });
  }

  refund(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Methods the storefront may send with "Place order". */
export const PAYMENT_OPTIONS = ['TEST'] as const;
export type PaymentOption = (typeof PAYMENT_OPTIONS)[number];

const PROVIDERS: Record<PaymentOption, PaymentProvider> = { TEST: new TestPaymentProvider() };
const BY_NAME = new Map(Object.values(PROVIDERS).map((p) => [p.name, p]));

export const paymentProvider = (option: PaymentOption): PaymentProvider => PROVIDERS[option];
/** The provider that took a stored payment (for refunds); undefined for unknown/legacy names. */
export const providerByName = (name: string): PaymentProvider | undefined => BY_NAME.get(name);
