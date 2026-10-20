import {
  adjustCustomerBalanceSnapshot,
  createCustomer,
  recordDebtPayment,
  updateCustomer,
  type DebtPaymentInput,
} from '@/db/repositories/customersRepo';
import { enqueue, enqueueCustomer } from '@/db/repositories/outboxRepo';
import { createSale, type CreateSaleInput } from '@/db/repositories/salesRepo';
import type { ActingUser, Customer, SaleWithDetails } from '@/db/types';
import { getDeviceId } from '@/lib/device';
import { newId } from '@/lib/id';

import { useClientStore } from './clientStore';
import { isCashierDevice } from './deviceMode';
import type {
  CustomerPushPayload,
  DebtPaymentPushPayload,
  SalePushPayload,
} from './protocol';

/**
 * The single entry point the sell/customer screens use to record money.
 *
 * On a standalone or admin phone this is a straight call into the repositories.
 * On a cashier phone it also writes the operation to the outbox (keyed by the
 * shared UUID, so replays are idempotent) and tries to deliver it immediately.
 * The sale is recorded locally either way, so a receipt can be printed offline.
 *
 * Ordering rule: anything that references a customer pushes the queue first, so
 * the customer always reaches the admin ahead of the sale or payment.
 */

function customerPayload(customer: Customer): CustomerPushPayload {
  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone ?? null,
    notes: customer.notes ?? null,
    updatedAt: customer.updatedAt,
  };
}

/** Create a customer, queueing it for the admin when this is a cashier phone. */
export async function submitCustomer(
  actor: ActingUser,
  input: { name: string; phone?: string | null; notes?: string | null },
): Promise<Customer> {
  const customer = await createCustomer(actor, input);
  if (isCashierDevice()) {
    await enqueueCustomer({ id: customer.id, payload: JSON.stringify(customerPayload(customer)) });
    void useClientStore.getState().flushOutbox();
  }
  return customer;
}

/** Save edits to a customer, queueing them for the admin on a cashier phone. */
export async function submitCustomerUpdate(
  actor: ActingUser,
  id: string,
  input: { name: string; phone?: string | null; notes?: string | null },
): Promise<Customer> {
  const customer = await updateCustomer(actor, id, input);
  if (isCashierDevice()) {
    await enqueueCustomer({ id: customer.id, payload: JSON.stringify(customerPayload(customer)) });
    void useClientStore.getState().flushOutbox();
  }
  return customer;
}

export async function submitSale(actor: ActingUser, input: CreateSaleInput): Promise<SaleWithDetails> {
  if (!isCashierDevice()) return createSale(actor, input);

  // A customer created on this phone does not exist on the admin yet, so drain
  // the queue (customers first) before recording a sale that references them.
  if (input.customerId) await useClientStore.getState().flushOutbox();

  const deviceId = await getDeviceId();
  const saleId = input.id ?? newId();
  const sale = await createSale(actor, { ...input, id: saleId, deviceId, skipStockMovements: true });

  // The mirrored balance on this phone cannot derive credit this device has
  // not synced yet, so nudge it now instead of waiting for the next catalog pull.
  if (sale.customerId) {
    const credit = sale.payments
      .filter((payment) => payment.method === 'credit')
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (credit > 0) await adjustCustomerBalanceSnapshot(sale.customerId, credit);
  }

  const payload: SalePushPayload = {
    saleId,
    deviceId,
    soldAt: sale.soldAt,
    customerId: sale.customerId,
    discount: sale.discount,
    lines: input.lines.map((line) => ({
      itemId: line.itemId,
      unitId: line.unitId,
      quantity: line.quantity,
    })),
    payments: input.payments.map((payment) => ({
      method: payment.method,
      amount: Math.round(payment.amount),
    })),
  };

  await enqueue({ id: saleId, kind: 'sale', payload: JSON.stringify(payload) });
  void useClientStore.getState().flushOutbox();
  return sale;
}

export async function submitDebtPayment(actor: ActingUser, input: DebtPaymentInput): Promise<void> {
  if (!isCashierDevice()) {
    await recordDebtPayment(actor, input);
    return;
  }

  await useClientStore.getState().flushOutbox();

  const deviceId = await getDeviceId();
  const paymentId = input.id ?? newId();
  await recordDebtPayment(actor, { ...input, id: paymentId, deviceId });

  const payload: DebtPaymentPushPayload = {
    paymentId,
    deviceId,
    customerId: input.customerId,
    amount: Math.round(input.amount),
    method: input.method,
    paidAt: input.paidAt ?? Date.now(),
    note: input.note?.trim() || null,
  };

  await enqueue({ id: paymentId, kind: 'debt_payment', payload: JSON.stringify(payload) });
  void useClientStore.getState().flushOutbox();
}
