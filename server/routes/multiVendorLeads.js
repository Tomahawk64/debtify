/**
 * Multi Vendor Admin Dashboard routes
 *
 * All routes require JWT auth + role multivendor_admin OR superadmin.
 * Data is scoped to the leads whose `leadVendor` tag is one of the
 * requesting user's `subLeadVendors` (e.g. "Jake" covering "Jake 1",
 * "Jake 2", "Jake 3"). Deliberately minimal projection — only the
 * fields a vendor needs to track their own leads.
 */
const express = require('express');
const { query } = require('express-validator');
const Lead = require('../models/Lead');
const LeadVendorOption = require('../models/LeadVendorOption');
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

module.exports = router;
