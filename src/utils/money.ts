export type MoneyValue = number | string | null | undefined;

export function moneyToCents(value: MoneyValue): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function centsToYuan(cents: number): number {
  return cents / 100;
}

export function addMoney(left: MoneyValue, right: MoneyValue): number {
  return centsToYuan(moneyToCents(left) + moneyToCents(right));
}

export function sumMoney(values: Iterable<MoneyValue>): number {
  let cents = 0;
  for (const value of values) cents += moneyToCents(value);
  return centsToYuan(cents);
}
