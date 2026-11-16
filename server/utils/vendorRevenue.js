const LeadVendorOption = require('../models/LeadVendorOption');

// Revenue % a Lead Vendor earns on enrolled debt when the main org admin has not
// set one for that vendor yet. (Data Vendors use their own fixed 2.5%.)
const DEFAULT_REVENUE_PERCENTAGE = 3;

const isValidPercentage = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;

// CPA vendors are only paid for a call that lasted MORE than this many seconds.
const CPA_MIN_CALL_SECONDS = 180;

const isValidCpaRate = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000000;

// Map of lead vendor name -> revenue percentage. Vendors missing from the map
// (never configured, or tagged with a name that no longer exists) use the default.
async function getRevenuePercentages() {
  const options = await LeadVendorOption.find({}).select('name revenuePercentage').lean();
  const map = new Map();
  for (const o of options) {
    map.set(o.name, isValidPercentage(o.revenuePercentage) ? o.revenuePercentage : DEFAULT_REVENUE_PERCENTAGE);
  }
  return map;
}

// Map of lead vendor name -> { model: 'CPL' | 'CPA', percentage, cpaRate }.
// Names missing from the map (never configured, or renamed/removed) are treated
// as CPL at the default percentage by callers.
async function getVendorPayoutConfigs() {
  const options = await LeadVendorOption.find({}).select('name revenuePercentage paymentModel cpaRate').lean();
  const map = new Map();
  for (const o of options) {
    map.set(o.name, {
      model: o.paymentModel === 'CPA' ? 'CPA' : 'CPL',
      percentage: isValidPercentage(o.revenuePercentage) ? o.revenuePercentage : DEFAULT_REVENUE_PERCENTAGE,
      cpaRate: isValidCpaRate(o.cpaRate) ? o.cpaRate : 0,
    });
  }
  return map;
}

module.exports = {
  DEFAULT_REVENUE_PERCENTAGE,
  CPA_MIN_CALL_SECONDS,
  isValidPercentage,
  isValidCpaRate,
  getRevenuePercentages,
  getVendorPayoutConfigs,
};
