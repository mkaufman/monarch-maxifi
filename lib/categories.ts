export type Bucket = 'fixed' | 'discretionary' | 'excluded';
export type ForecastModel =
  | 'run_rate'
  | 'known_monthly'
  | 'known_annual'
  | 'adjusted_run_rate'
  | 'no_further_spend';

export type MaxiFiSubcategory =
  | 'housing'
  | 'medicare_part_b'
  | 'life_premium'
  | 'person1_retirement'
  | 'person2_retirement'
  | 'taxes'
  | 'hsa_contributions'
  | 'other_expenses'; // COBRA, medical OOP, etc. — compared against MaxiFi Special Expenses, not a fixed-subcategory budget

export interface DefaultCategoryConfig {
  bucket: Bucket;
  forecastModel: ForecastModel;
  maxifiSubcategory?: MaxiFiSubcategory;
  maxifiGroup?: string;
}

// Default bucket and forecast model assignments per category name
export const DEFAULT_CATEGORY_CONFIG: Record<string, DefaultCategoryConfig> = {
  // Fixed — Housing subcategory
  Mortgage: { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'mortgage' },
  'Home Improvement': { bucket: 'fixed', forecastModel: 'adjusted_run_rate', maxifiSubcategory: 'housing', maxifiGroup: 'maintenance' },
  "Homeowner's Insurance": { bucket: 'fixed', forecastModel: 'known_annual', maxifiSubcategory: 'housing', maxifiGroup: 'insurance' },
  'Property Taxes': { bucket: 'fixed', forecastModel: 'known_annual', maxifiSubcategory: 'housing', maxifiGroup: 'taxes' },
  'HOA Dues': { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'hoa' },
  // Fixed — Housing / Utilities subcategory
  'Gas & Electric': { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'utilities' },
  'Internet & Cable': { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'utilities' },
  Phone: { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'utilities' },
  'Home Alarm Service': { bucket: 'fixed', forecastModel: 'known_monthly', maxifiSubcategory: 'housing', maxifiGroup: 'utilities' },
  // Fixed — Taxes subcategory
  Taxes: { bucket: 'fixed', forecastModel: 'known_annual', maxifiSubcategory: 'taxes' },
  // Fixed — Medical (not mapped to a MaxiFi subcategory; tracked in Monarch but not in MaxiFi's Other Expenses)
  Medical: { bucket: 'fixed', forecastModel: 'adjusted_run_rate' },
  // Fixed — COBRA premium (maps to MaxiFi's COBRA special expense). Fixed monthly obligation, so
  // known_annual. Set the annual override amount in Settings — defaults don't carry amounts.
  'COBRA Premium': { bucket: 'fixed', forecastModel: 'known_annual' },

  // Discretionary
  Groceries: { bucket: 'discretionary', forecastModel: 'run_rate' },
  Pets: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Restaurants & Bars': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Financial & Legal Services': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Electronics: { bucket: 'discretionary', forecastModel: 'run_rate' },
  Vices: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Travel & Vacation': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Auto Maintenance': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Entertainment & Recreation': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Supplements: { bucket: 'discretionary', forecastModel: 'run_rate' },
  Personal: { bucket: 'discretionary', forecastModel: 'run_rate' },
  Shopping: { bucket: 'discretionary', forecastModel: 'run_rate' },
  Clothing: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Advertising & Promotion': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Gifts: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Parking & Tolls': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Business Utilities & Communication': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Gas: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Taxi & Ride Shares': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Public Transit': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Cash & ATM': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Postage & Shipping': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Business License': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Education: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Furniture & Housewares': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Charity: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Coffee Shops': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Financial Fees': { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Software Services': { bucket: 'discretionary', forecastModel: 'run_rate' },
  Insurance: { bucket: 'discretionary', forecastModel: 'run_rate' },
  'Auto Insurance': { bucket: 'discretionary', forecastModel: 'known_annual' },

  // Excluded — transfers and uncategorized
  Transfer: { bucket: 'excluded', forecastModel: 'run_rate' },
  'Credit Card Payment': { bucket: 'excluded', forecastModel: 'run_rate' },
  'Balance Adjustments': { bucket: 'excluded', forecastModel: 'run_rate' },
  Uncategorized: { bucket: 'excluded', forecastModel: 'run_rate' },
  uncategorized: { bucket: 'excluded', forecastModel: 'run_rate' },
};

// Infer a default forecast model from Monarch's budget_variability field
export function defaultModelFromVariability(
  variability: 'fixed' | 'flexible' | 'non_monthly' | null
): ForecastModel {
  switch (variability) {
    case 'fixed':
      return 'known_monthly';
    case 'non_monthly':
      return 'known_annual';
    case 'flexible':
    default:
      return 'run_rate';
  }
}
