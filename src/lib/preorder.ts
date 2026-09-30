/**
 * Preorders: an administrator marks a product as available for preorder and sets the deposit
 * customers pay at checkout — either a fixed amount per unit or a percentage of the price.
 * The remaining balance is due when the product ships.
 */
export type DepositType = "fixed" | "percent";

export interface PreorderConfig {
  depositType: DepositType;
  /** EUR per unit for "fixed", 1–100 for "percent". */
  depositValue: number;
  /** Expected shipping date (YYYY-MM-DD), optional. */
  releaseDate: string | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Deposit charged per unit at checkout; never more than the unit price. */
export const depositPerUnit = (unitPrice: number, config: PreorderConfig): number => {
  const raw =
    config.depositType === "percent"
      ? (unitPrice * Math.min(Math.max(config.depositValue, 0), 100)) / 100
      : config.depositValue;
  return round2(Math.min(Math.max(raw, 0), unitPrice));
};

/** Validation shared by the admin form; returns an error message or null. */
export const validatePreorder = (config: PreorderConfig, unitPrice: number): string | null => {
  if (!(config.depositValue > 0)) return "Enter a deposit greater than 0";
  if (config.depositType === "percent" && config.depositValue > 100) return "A percentage deposit cannot exceed 100%";
  if (config.depositType === "fixed" && config.depositValue > unitPrice)
    return "The deposit cannot be higher than the product price";
  if (config.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(config.releaseDate)) return "Enter a valid shipping date";
  return null;
};

/** Localized long date for "expected to ship" notes. */
export const formatReleaseDate = (date: string, lang: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(lang === "vi" ? "vi-VN" : lang === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
