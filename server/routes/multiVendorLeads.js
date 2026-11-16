/**
 * Multi Vendor Admin Dashboard routes
 *
 * Lead routes require JWT auth + role multivendor_admin OR superadmin.
 * (The /payment-status/admin/* and PATCH /payment-status/:id routes at the
 * bottom are for the main org admin / superadmin only — see below.)
 * Data is scoped to the leads whose `leadVendor` tag is one of the
 * requesting user's `subLeadVendors` (e.g. "Jake" covering "Jake 1",
 * "Jake 2", "Jake 3"). Deliberately minimal projection — only the
 * fields a vendor needs to track their own leads.
 */
const express = require('express');
const { query } = require('express-validator');
const Lead = require('../models/Lead');
const LeadVendorOption = require('../models/LeadVendorOption');
const Organization = require('../models/Organization');
const { protect, authorize } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const { formatEasternTime } = require('../utils/timeFilters');
const { escapeRegex } = require('../utils/regexUtils');
const { DEFAULT_REVENUE_PERCENTAGE, CPA_MIN_CALL_SECONDS, getVendorPayoutConfigs } = require('../utils/vendorRevenue');

const router = express.Router();

// ─── Minimal projection — only what a vendor needs to track leads ────────────
const PROJECTION = {
  leadId: 1,
  createdAt: 1,
  name: 1,
  phone: 1,
  leadVendor: 1,
  leadProgressStatus: 1,
  status: 1,
};

/**
 * Resolve which leadVendor values this request is allowed to see.
 * - multivendor_admin: always their own assigned subLeadVendors (narrowed
 *   further by ?vendor= if it's one of their own values).
 * - superadmin: all active lead vendor option names, narrowed by ?vendor=
 *   if given (for oversight/testing — not restricted to any one account).
 */
const resolveAllowedVendors = async (user, requestedVendor) => {
  if (user.role === 'multivendor_admin') {
    const assigned = Array.isArray(user.subLeadVendors) ? user.subLeadVendors : [];
    if (requestedVendor && assigned.includes(requestedVendor)) {
      return [requestedVendor];
    }
    return assigned;
  }
  // superadmin
  if (requestedVendor) return [requestedVendor];
  const allOptions = await LeadVendorOption.find({}).select('name').lean();
  return allOptions.map(o => o.name);
};

const buildDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate + 'T00:00:00Z');
  if (endDate)   filter.$lte = new Date(endDate   + 'T23:59:59.999Z');
  return Object.keys(filter).length ? { createdAt: filter } : {};
};

const dateQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be 1-500'),
  query('startDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('startDate must be YYYY-MM-DD'),
  query('endDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('endDate must be YYYY-MM-DD'),
  query('vendor').optional().trim().isLength({ max: 100 }),
  query('search').optional().trim().isLength({ max: 100 }),
];

// ─────────────────────────────────────────────────────────────────
// GET /api/multivendor/sub-vendors
// Returns the vendor names this account can filter by (for the UI's
// sub-vendor dropdown).
// ─────────────────────────────────────────────────────────────────
router.get('/sub-vendors', protect, authorize('multivendor_admin', 'superadmin'), async (req, res) => {
  try {
    const vendors = await resolveAllowedVendors(req.user, null);
    // Which payout model (CPL / CPA) each vendor uses, so the Payment Status page
    // knows which view(s) to offer. The rate itself is never exposed here.
    const configs = await getVendorPayoutConfigs();
    const vendorModels = {};
    for (const v of vendors) vendorModels[v] = configs.has(v) ? configs.get(v).model : 'CPL';
    res.json({ success: true, data: vendors, vendorModels });
  } catch (err) {
    console.error('[MultiVendor] sub-vendors fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/multivendor/leads
// ─────────────────────────────────────────────────────────────────
router.get(
  '/leads',
  protect,
  authorize('multivendor_admin', 'superadmin'),
  dateQueryValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page)  || 1);
      const limit = Math.min(500, parseInt(req.query.limit) || 100);
      const skip  = (page - 1) * limit;

      const allowedVendors = await resolveAllowedVendors(req.user, req.query.vendor);
      if (allowedVendors.length === 0) {
        return res.json({ success: true, data: { leads: [], pagination: { page, limit, total: 0, pages: 0 } } });
      }

      const filter = {
        leadVendor: { $in: allowedVendors },
        ...buildDateFilter(req.query.startDate, req.query.endDate),
      };

      if (req.query.search) {
        const re = { $regex: escapeRegex(req.query.search), $options: 'i' };
        filter.$or = [{ name: re }, { phone: re }];
      }

      const [leads, total] = await Promise.all([
        Lead.find(filter, PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Lead.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: { leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
      });
    } catch (err) {
      console.error('[MultiVendor] leads fetch error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// GET /api/multivendor/leads/export
// ─────────────────────────────────────────────────────────────────
router.get(
  '/leads/export',
  protect,
  authorize('multivendor_admin', 'superadmin'),
  dateQueryValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Export is opt-in per multivendor_admin account (superadmin always
      // allowed — same as every other export in the app).
      if (req.user.role === 'multivendor_admin' && !req.user.canExportLeads) {
        return res.status(403).json({ success: false, message: 'Export access is not enabled for this account' });
      }

      const allowedVendors = await resolveAllowedVendors(req.user, req.query.vendor);
      const filter = {
        leadVendor: { $in: allowedVendors },
        ...buildDateFilter(req.query.startDate, req.query.endDate),
      };
      if (req.query.search) {
        const re = { $regex: escapeRegex(req.query.search), $options: 'i' };
        filter.$or = [{ name: re }, { phone: re }];
      }

      const leads = await Lead.find(filter, PROJECTION).sort({ createdAt: -1 }).lean();

      const esc = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmt = (date) => (date ? formatEasternTime(new Date(date)) : '');

      const header = ['Lead Created At', 'Customer Name', 'Phone', 'Lead Vendor', 'Status'].join(',');
      const rows = leads.map(l => [
        esc(fmt(l.createdAt)),
        esc(l.name || ''),
        esc(l.phone || ''),
        esc(l.leadVendor || ''),
        esc(l.leadProgressStatus || l.status || ''),
      ].join(','));

      const csv = [header, ...rows].join('\n');
      const ts  = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="multivendor_leads_${ts}.csv"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.status(200).send(csv);
    } catch (err) {
      console.error('[MultiVendor] export error:', err);
      res.status(500).json({ success: false, message: 'Export failed' });
    }
  }
);

// ═════════════════════════════════════════════════════════════════
// Payment Status for SALE leads — mirrors the Data Vendor Payment Status.
//   • multivendor_admin: READ-ONLY view of the SALE leads tagged to their own
//     lead vendors. There is deliberately no CSV/download route for them.
//   • main org admin / superadmin: list + update payment fields.
// ═════════════════════════════════════════════════════════════════
const SALE_STATUSES    = ['SALE', 'Sale Long Play', 'Immediate Enrollment'];
const PAYMENT_STATUSES = ['', 'Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded'];
const PAYMENT_TYPES    = ['', 'Monthly', 'Semi Monthly'];
const MAIN_ORG_NAME    = (process.env.MAIN_ORG_NAME || 'DEBTIFY').trim().toUpperCase();

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Enrolled debt of a SALE lead = the conversion value the agent entered at sale
// time, falling back to the lead's total debt amount when that was left blank.
const enrolledDebtOf = (lead) => {
  const cv = Number(lead.conversionValue);
  const td = Number(lead.totalDebtAmount);
  return (cv > 0 ? cv : td) || 0;
};
const enrolledDebtExpr = {
  $let: {
    vars: { cv: { $ifNull: ['$conversionValue', 0] }, td: { $ifNull: ['$totalDebtAmount', 0] } },
    in: { $cond: [{ $gt: ['$$cv', 0] }, '$$cv', '$$td'] },
  },
};

const isMainOrgAdminUser = async (user) => {
  if (user.role !== 'admin' || !user.organization) return false;
  try {
    const org = await Organization.findById(user.organization).select('name').lean();
    return !!(org && String(org.name || '').trim().toUpperCase() === MAIN_ORG_NAME);
  } catch {
    return false;
  }
};

// Only superadmin or the MAIN org admin may view/edit payment data for all vendors.
const requirePaymentAdmin = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin' || (await isMainOrgAdminUser(req.user))) return next();
    return res.status(403).json({ success: false, message: 'Only the main organization admin can manage payment status' });
  } catch (err) {
    console.error('[MultiVendor] payment access check error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const paymentListValidation = [
  ...dateQueryValidation,
  query('paymentStatusFilter')
    .optional()
    .isIn(['', 'not_set', ...PAYMENT_STATUSES.filter(Boolean)])
    .withMessage('Invalid paymentStatusFilter'),
  query('model').optional().isIn(['CPL', 'CPA']).withMessage('model must be CPL or CPA'),
];

const buildPaymentFilter = (q, vendorMatch, dateMode, model = 'CPL') => {
  const filter = { leadProgressStatus: { $in: SALE_STATUSES }, leadVendor: vendorMatch };
  const and = [];

  // CPA views don't show payment status, so it is neither filterable nor searchable there.
  if (model === 'CPA') {
    // (no payment status condition)
  } else if (q.paymentStatusFilter === 'not_set') {
    and.push({ $or: [{ paymentStatus: '' }, { paymentStatus: null }] }); // null also matches "field missing"
  } else if (q.paymentStatusFilter) {
    filter.paymentStatus = q.paymentStatusFilter;
  }

  if (q.startDate || q.endDate) {
    if (dateMode === 'draft') {
      // Multi Vendor view: Draft Date From/To, matching either draft date
      const cond = {};
      if (q.startDate) cond.$gte = new Date(q.startDate + 'T00:00:00.000Z');
      if (q.endDate)   cond.$lte = new Date(q.endDate   + 'T23:59:59.999Z');
      and.push({ $or: [{ draftDate1: cond }, { draftDate2: cond }] });
    } else {
      // Admin view: From/To on the lead's created date
      Object.assign(filter, buildDateFilter(q.startDate, q.endDate));
    }
  }

  if (q.search) {
    const re = { $regex: escapeRegex(q.search), $options: 'i' };
    and.push({
      $or: [{ name: re }, { phone: re }, { leadId: re }, { leadVendor: re }, ...(model === 'CPA' ? [] : [{ paymentStatus: re }])]
    });
  }

  if (and.length) filter.$and = and;
  return filter;
};

// Lists the SALE leads of one payout model.
//   CPL — enrolled debt × the vendor's revenue %, with payment status / type / draft dates.
//   CPA — the vendor's fixed rate for each lead whose (admin-entered) call lasted
//         more than CPA_MIN_CALL_SECONDS, otherwise $0. No payment-status fields.
// `model` comes from ?model= and defaults to CPL, so older clients keep working.
const listPaymentSales = async (req, res, { vendorMatch, dateMode, includeEmail, includeRate }) => {
  const model = req.query.model === 'CPA' ? 'CPA' : 'CPL';
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 50);

  const configs = await getVendorPayoutConfigs();
  const cpaNames = [];
  for (const [name, c] of configs) if (c.model === 'CPA') cpaNames.push(name);

  // Keep only vendors on this payout model. Vendor names with no option (renamed /
  // removed) count as CPL, matching how they were always treated before.
  const filter = buildPaymentFilter(req.query, vendorMatch, dateMode, model);
  filter.$and = [
    ...(filter.$and || []),
    { leadVendor: model === 'CPA' ? { $in: cpaNames } : { $nin: cpaNames } },
  ];

  const cfgOf = (vendor) => configs.get(vendor) || { model: 'CPL', percentage: DEFAULT_REVENUE_PERCENTAGE, cpaRate: 0 };
  const percentageOf = (vendor) => cfgOf(vendor).percentage;

  if (model === 'CPA') {
    const projection = {
      name: 1, phone: 1, leadId: 1, leadVendor: 1, createdAt: 1,
      conversionValue: 1, totalDebtAmount: 1,
      callDuration: 1, // select:false in the schema — requested explicitly
      ...(includeEmail ? { email: 1 } : {}),
    };
    const qualifies = (d) => Number.isFinite(Number(d)) && d !== null && Number(d) > CPA_MIN_CALL_SECONDS;

    const [total, leads, groupAgg] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter, projection).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Lead.aggregate([
        { $match: filter },
        { $group: {
          _id: '$leadVendor',
          count: { $sum: 1 },
          enrolledDebt: { $sum: enrolledDebtExpr },
          qualified: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$callDuration', 0] }, CPA_MIN_CALL_SECONDS] }, 1, 0] } },
        } },
      ]),
    ]);

    const data = leads.map(({ conversionValue, totalDebtAmount, callDuration, ...rest }) => {
      const rate = cfgOf(rest.leadVendor).cpaRate;
      return {
        ...rest,
        enrolledDebt: enrolledDebtOf({ conversionValue, totalDebtAmount }),
        revenue: qualifies(callDuration) ? round2(rate) : 0,
        // call length / rate are for the main org admin's editor only
        ...(includeRate ? { callDuration: callDuration === undefined || callDuration === null ? null : callDuration, cpaRate: rate } : {}),
      };
    });

    let totalEnrolledDebt = 0;
    let totalRevenue = 0;
    let qualifiedCount = 0;
    for (const g of groupAgg) {
      totalEnrolledDebt += Number(g.enrolledDebt) || 0;
      totalRevenue += (Number(g.qualified) || 0) * cfgOf(g._id).cpaRate;
      qualifiedCount += Number(g.qualified) || 0;
    }

    return res.json({
      success: true,
      model,
      data,
      total,
      page,
      limit,
      totalEnrolledDebt: round2(totalEnrolledDebt),
      totalRevenue: round2(totalRevenue),
      statusBreakdown: {},
      ...(includeRate ? { qualifiedCount, cpaMinCallSeconds: CPA_MIN_CALL_SECONDS } : {}),
    });
  }

  const projection = {
    name: 1, phone: 1, leadId: 1, leadVendor: 1, createdAt: 1, leadProgressStatus: 1,
    conversionValue: 1, totalDebtAmount: 1,
    paymentStatus: 1, paymentType: 1, draftDate1: 1, draftDate2: 1, paymentStatusUpdatedAt: 1,
    ...(includeEmail ? { email: 1 } : {}),
  };

  const [total, leads, groupAgg] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.find(filter, projection).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    // grouped by payment status AND lead vendor, because each vendor has its own revenue %
    Lead.aggregate([
      { $match: filter },
      { $group: {
        _id: { status: { $ifNull: ['$paymentStatus', ''] }, vendor: '$leadVendor' },
        count: { $sum: 1 },
        enrolledDebt: { $sum: enrolledDebtExpr },
      } },
    ]),
  ]);

  const data = leads.map(({ conversionValue, totalDebtAmount, ...rest }) => {
    const enrolledDebt = enrolledDebtOf({ conversionValue, totalDebtAmount });
    const pct = percentageOf(rest.leadVendor);
    return {
      ...rest,
      enrolledDebt,
      revenue: round2((enrolledDebt * pct) / 100),
      ...(includeRate ? { revenuePercentage: pct } : {}),
    };
  });

  const breakdown = {};
  let totalEnrolledDebt = 0;
  let totalRevenue = 0;
  for (const g of groupAgg) {
    const status = g._id.status || '';
    const enrolled = Number(g.enrolledDebt) || 0;
    const revenue = (enrolled * percentageOf(g._id.vendor)) / 100;
    if (!breakdown[status]) breakdown[status] = { count: 0, enrolledDebt: 0, revenue: 0 };
    breakdown[status].count += g.count;
    breakdown[status].enrolledDebt += enrolled;
    breakdown[status].revenue += revenue;
    totalEnrolledDebt += enrolled;
    totalRevenue += revenue;
  }
  const statusBreakdown = {};
  for (const [status, b] of Object.entries(breakdown)) {
    statusBreakdown[status] = { count: b.count, enrolledDebt: round2(b.enrolledDebt), revenue: round2(b.revenue) };
  }

  res.json({
    success: true,
    model,
    data,
    total,
    page,
    limit,
    totalEnrolledDebt: round2(totalEnrolledDebt),
    totalRevenue: round2(totalRevenue),
    statusBreakdown,
  });
};

// GET /api/multivendor/payment-status/sales  (read-only, own vendors only)
router.get(
  '/payment-status/sales',
  protect,
  authorize('multivendor_admin', 'superadmin'),
  paymentListValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const allowedVendors = await resolveAllowedVendors(req.user, req.query.vendor);
      if (allowedVendors.length === 0) {
        return res.json({
          success: true, data: [], total: 0,
          page: Math.max(1, parseInt(req.query.page) || 1),
          limit: Math.min(500, parseInt(req.query.limit) || 50),
          totalEnrolledDebt: 0, totalRevenue: 0, statusBreakdown: {},
        });
      }
      // CPA rows have no draft dates, so their date filter runs on the created date.
      const dateMode = req.query.model === 'CPA' ? 'created' : 'draft';
      await listPaymentSales(req, res, { vendorMatch: { $in: allowedVendors }, dateMode, includeEmail: false });
    } catch (err) {
      console.error('[MultiVendor] payment status list error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/multivendor/payment-status/admin/sales  (main org admin / superadmin)
router.get(
  '/payment-status/admin/sales',
  protect,
  requirePaymentAdmin,
  paymentListValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const vendorMatch = req.query.vendor ? req.query.vendor : { $nin: [null, ''] };
      await listPaymentSales(req, res, { vendorMatch, dateMode: 'created', includeEmail: true, includeRate: true });
    } catch (err) {
      console.error('[MultiVendor] admin payment status list error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/multivendor/payment-status/admin/vendors  (lead vendor names that have SALE leads)
router.get('/payment-status/admin/vendors', protect, requirePaymentAdmin, async (req, res) => {
  try {
    const names = await Lead.distinct('leadVendor', {
      leadProgressStatus: { $in: SALE_STATUSES },
      leadVendor: { $nin: [null, ''] },
    });
    const sorted = names.filter(Boolean).sort((a, b) => a.localeCompare(b));
    const configs = await getVendorPayoutConfigs();
    const vendorModels = {};
    for (const v of sorted) vendorModels[v] = configs.has(v) ? configs.get(v).model : 'CPL';
    res.json({ success: true, data: sorted, vendorModels });
  } catch (err) {
    console.error('[MultiVendor] payment vendors error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Returns a Date (UTC midnight), null (clear), or undefined (invalid input).
const parseDraftDate = (value) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(value + 'T00:00:00.000Z');
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? undefined : d;
};

// PATCH /api/multivendor/payment-status/:id  (main org admin / superadmin)
router.patch('/payment-status/:id', protect, requirePaymentAdmin, async (req, res) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID' });
    }

    const body = req.body || {};
    const set = {};

    if (body.paymentStatus !== undefined) {
      if (typeof body.paymentStatus !== 'string' || !PAYMENT_STATUSES.includes(body.paymentStatus)) {
        return res.status(400).json({ success: false, message: 'Invalid paymentStatus value' });
      }
      set.paymentStatus = body.paymentStatus;
    }
    if (body.paymentType !== undefined) {
      if (typeof body.paymentType !== 'string' || !PAYMENT_TYPES.includes(body.paymentType)) {
        return res.status(400).json({ success: false, message: 'Invalid paymentType value' });
      }
      set.paymentType = body.paymentType;
    }
    for (const field of ['draftDate1', 'draftDate2']) {
      if (body[field] !== undefined) {
        const parsed = parseDraftDate(body[field]);
        if (parsed === undefined) {
          return res.status(400).json({ success: false, message: `Invalid ${field} (expected YYYY-MM-DD)` });
        }
        set[field] = parsed;
      }
    }
    // Call length (seconds) for CPA vendors' leads; null / '' clears it.
    let clearCallDuration = false;
    const touchesPayment = Object.keys(set).length > 0; // status / type / draft dates
    if (body.callDuration !== undefined) {
      const v = body.callDuration;
      if (v === null || v === '') {
        clearCallDuration = true;
      } else {
        const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
        if (!Number.isInteger(n) || n < 0 || n > 86400) {
          return res.status(400).json({ success: false, message: 'Call duration must be a whole number of seconds between 0 and 86400' });
        }
        set.callDuration = n;
      }
    }
    if (Object.keys(set).length === 0 && !clearCallDuration) {
      return res.status(400).json({ success: false, message: 'No payment fields provided' });
    }

    // Only a vendor-tagged SALE lead can carry payment data; timestamps:false so
    // payment bookkeeping never alters the lead's own "last updated" metadata.
    // Entering a call duration alone is not a payment-status change, so it does not
    // stamp "status updated by/at".
    const update = {
      $set: {
        ...set,
        ...(touchesPayment ? { paymentStatusUpdatedBy: req.user._id, paymentStatusUpdatedAt: new Date() } : {}),
      },
    };
    if (clearCallDuration) update.$unset = { callDuration: '' };
    if (Object.keys(update.$set).length === 0) delete update.$set;

    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, leadProgressStatus: { $in: SALE_STATUSES }, leadVendor: { $nin: [null, ''] } },
      update,
      { new: true, runValidators: true, timestamps: false }
    ).select('paymentStatus paymentType draftDate1 draftDate2 paymentStatusUpdatedAt callDuration').lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: 'SALE lead not found' });
    }
    res.json({ success: true, data: lead });
  } catch (err) {
    console.error('[MultiVendor] payment status update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
