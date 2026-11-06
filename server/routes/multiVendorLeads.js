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
    res.json({ success: true, data: vendors });
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
const REVENUE_RATE     = 0.03; // Multi Vendor revenue is 3% of enrolled debt (Data Vendors stay at 2.5%)
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
];

const buildPaymentFilter = (q, vendorMatch, dateMode) => {
  const filter = { leadProgressStatus: { $in: SALE_STATUSES }, leadVendor: vendorMatch };
  const and = [];

  if (q.paymentStatusFilter === 'not_set') {
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
    and.push({ $or: [{ name: re }, { phone: re }, { leadId: re }, { leadVendor: re }, { paymentStatus: re }] });
  }

  if (and.length) filter.$and = and;
  return filter;
};

const listPaymentSales = async (req, res, { vendorMatch, dateMode, includeEmail }) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 50);
  const filter = buildPaymentFilter(req.query, vendorMatch, dateMode);

  const projection = {
    name: 1, phone: 1, leadId: 1, leadVendor: 1, createdAt: 1, leadProgressStatus: 1,
    conversionValue: 1, totalDebtAmount: 1,
    paymentStatus: 1, paymentType: 1, draftDate1: 1, draftDate2: 1, paymentStatusUpdatedAt: 1,
    ...(includeEmail ? { email: 1 } : {}),
  };

  const [total, leads, breakdownAgg] = await Promise.all([
    Lead.countDocuments(filter),
    Lead.find(filter, projection).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Lead.aggregate([
      { $match: filter },
      { $group: { _id: { $ifNull: ['$paymentStatus', ''] }, count: { $sum: 1 }, enrolledDebt: { $sum: enrolledDebtExpr } } },
    ]),
  ]);

  const data = leads.map(({ conversionValue, totalDebtAmount, ...rest }) => {
    const enrolledDebt = enrolledDebtOf({ conversionValue, totalDebtAmount });
    return { ...rest, enrolledDebt, revenue: round2(enrolledDebt * REVENUE_RATE) };
  });

  const statusBreakdown = {};
  let totalEnrolledDebt = 0;
  for (const g of breakdownAgg) {
    const enrolledDebt = round2(g.enrolledDebt);
    totalEnrolledDebt += enrolledDebt;
    statusBreakdown[g._id || ''] = { count: g.count, enrolledDebt, revenue: round2(enrolledDebt * REVENUE_RATE) };
  }
  totalEnrolledDebt = round2(totalEnrolledDebt);

  res.json({
    success: true,
    data,
    total,
    page,
    limit,
    totalEnrolledDebt,
    totalRevenue: round2(totalEnrolledDebt * REVENUE_RATE),
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
      await listPaymentSales(req, res, { vendorMatch: { $in: allowedVendors }, dateMode: 'draft', includeEmail: false });
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
      await listPaymentSales(req, res, { vendorMatch, dateMode: 'created', includeEmail: true });
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
    res.json({ success: true, data: names.filter(Boolean).sort((a, b) => a.localeCompare(b)) });
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
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: 'No payment fields provided' });
    }

    // Only a vendor-tagged SALE lead can carry payment data; timestamps:false so
    // payment bookkeeping never alters the lead's own "last updated" metadata.
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, leadProgressStatus: { $in: SALE_STATUSES }, leadVendor: { $nin: [null, ''] } },
      { $set: { ...set, paymentStatusUpdatedBy: req.user._id, paymentStatusUpdatedAt: new Date() } },
      { new: true, runValidators: true, timestamps: false }
    ).select('paymentStatus paymentType draftDate1 draftDate2 paymentStatusUpdatedAt').lean();

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
