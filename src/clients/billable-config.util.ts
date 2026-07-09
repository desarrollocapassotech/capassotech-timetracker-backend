import { BillableBaseFactorStrategy } from '../database/entities';
import { BillableHoursCalculationConfig, DEFAULT_BILLABLE_CONFIG } from '../database/entities/client.entity';

// Espejo exacto de lib/utils.ts -> normalizeBillableConfig/parseNumericField del
// frontend, para que la validación de la configuración de facturación se comporte
// igual estando en el backend.

export function parseNumericField(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function clampPositiveNumber(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN)) return null;
  const normalized = Number(value);
  return normalized > 0 ? normalized : null;
}

export function normalizeBillableConfig(config: unknown): BillableHoursCalculationConfig {
  if (!config || typeof config !== 'object') {
    return { ...DEFAULT_BILLABLE_CONFIG };
  }

  const raw = config as Partial<Record<string, unknown>>;

  const strategy =
    raw.baseFactorStrategy === BillableBaseFactorStrategy.CUSTOM ||
    raw.baseFactorStrategy === BillableBaseFactorStrategy.RATE_RATIO
      ? (raw.baseFactorStrategy as BillableBaseFactorStrategy)
      : DEFAULT_BILLABLE_CONFIG.baseFactorStrategy;

  const customBaseFactor = clampPositiveNumber(parseNumericField(raw.customBaseFactor ?? null));

  const markup = parseNumericField(raw.markupMultiplier ?? null);
  const safeMarkup = markup !== null && markup > 0 ? markup : DEFAULT_BILLABLE_CONFIG.markupMultiplier;

  const internalBugMarkup = parseNumericField(raw.internalBugMarkupMultiplier ?? null);
  const safeInternalBugMarkup = internalBugMarkup !== null && internalBugMarkup > 0 ? internalBugMarkup : null;

  const additional = parseNumericField(raw.additionalFixedHours ?? null);
  const safeAdditional = additional !== null && Number.isFinite(additional) ? additional : 0;

  const minimum = clampPositiveNumber(parseNumericField(raw.minimumBillableHours ?? null));

  const overrides: Record<string, number> = {};
  if (raw.collaboratorOverrides && typeof raw.collaboratorOverrides === 'object') {
    Object.entries(raw.collaboratorOverrides as Record<string, unknown>).forEach(([collaboratorId, value]) => {
      const parsed = clampPositiveNumber(parseNumericField(value));
      if (parsed !== null) {
        overrides[collaboratorId] = parsed;
      }
    });
  }

  return {
    baseFactorStrategy: strategy,
    customBaseFactor: strategy === BillableBaseFactorStrategy.CUSTOM ? customBaseFactor : null,
    markupMultiplier: safeMarkup,
    internalBugMarkupMultiplier: safeInternalBugMarkup,
    additionalFixedHours: safeAdditional,
    minimumBillableHours: minimum,
    collaboratorOverrides: overrides,
  };
}
