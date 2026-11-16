const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const LeadVendorOption = require('../models/LeadVendorOption');
const Organization = require('../models/Organization');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const {
  DEFAULT_REVENUE_PERCENTAGE,
  CPA_MIN_CALL_SECONDS,
  isValidPercentage,
  isValidCpaRate
} = require('../utils/vendorRevenue');

const PAYMENT_MODELS = ['CPL', 'CPA'];

// Validators shared by create + update. cpaRate: a number >= 0, or null/'' to clear.
const paymentModelValidator = body('paymentModel')
  .optional()
  .custom((v) => {
    if (!PAYMENT_MODELS.includes(v)) throw new Error('paymentModel must be CPL or CPA');
    return true;
  });
const cpaRateValidator = body('cpaRate')
  .optional({ nullable: true, checkFalsy: false })
  .custom((v) => {
    if (v === null || v === '') return true;
    if (typeof v !== 'number' && typeof v !== 'string') throw new Error('cpaRate must be a number');
    if (!isValidCpaRate(Number(v))) throw new Error('cpaRate must be a number between 0 and 1,000,000');
    return true;
  });

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// ─────────────────────────────────────────────────────────────────
// Lead Vendor Options — the managed list Agent2 picks a "Lead Vendor"
// from when creating a lead, and the pool a Multi Vendor Admin's
// subLeadVendors are drawn from. Only the main org admin / superadmin
// may add, rename, or retire entries.
// ─────────────────────────────────────────────────────────────────

const isMainOrgAdmin = async (user) => {
  if (user.role !== 'admin' || !user.organization) return false;
  try {
    const org = await Organization.findById(user.organization).lean();
    return !!(org && org.name === 'DEBTIFY');
  } catch { return false; }
};

async function requireMainOrgAdmin(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  if (await isMainOrgAdmin(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: 'Only the main organization admin can manage lead vendor options'
  });
}

// ─────────────────────────────────────────────────────────────────
// GET /api/lead-vendor-options
// Any authenticated user may read the list (Agent2's dropdown, the
// admin edit dropdowns, and the "create Multi Vendor Admin" multiselect
// all need it). Pass ?all=true to include retired entries — admin-only.
// ─────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const isPrivileged = req.user.role === 'superadmin' || (await isMainOrgAdmin(req.user));
    if (includeInactive && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Not authorized to view retired options' });
    }
    const filter = includeInactive ? {} : { isActive: true };
    // Revenue percentages are commercial data: only the main org admin /
    // superadmin ever receive them (this list is readable by every logged-in user).
    const query = LeadVendorOption.find(filter).sort({ name: 1 });
    if (!isPrivileged) query.select('-revenuePercentage -paymentModel -cpaRate');
    const options = await query.lean();
    res.json({
      success: true,
      // entries created before paymentModel existed have no value => CPL
      data: isPrivileged ? options.map((o) => ({ ...o, paymentModel: o.paymentModel === 'CPA' ? 'CPA' : 'CPL' })) : options,
      ...(isPrivileged
        ? { defaultRevenuePercentage: DEFAULT_REVENUE_PERCENTAGE, cpaMinCallSeconds: CPA_MIN_CALL_SECONDS }
        : {})
    });
  } catch (err) {
    console.error('Error fetching lead vendor options:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/lead-vendor-options — create a new option
// ─────────────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  requireMainOrgAdmin,
  [
    body('name')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    paymentModelValidator,
    cpaRateValidator
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const name = req.body.name.trim();
      const paymentModel = req.body.paymentModel === 'CPA' ? 'CPA' : 'CPL';
      const hasRate = req.body.cpaRate !== undefined && req.body.cpaRate !== null && req.body.cpaRate !== '';
      if (paymentModel === 'CPA' && !hasRate) {
        return res.status(400).json({ success: false, message: 'A CPA rate is required for CPA lead vendors' });
      }
      const existing = await LeadVendorOption.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A lead vendor option with this name already exists' });
      }
      const option = await LeadVendorOption.create({
        name,
        paymentModel,
        ...(paymentModel === 'CPA' ? { cpaRate: round2(req.body.cpaRate) } : {}),
        createdBy: req.user._id
      });
      res.status(201).json({ success: true, message: 'Lead vendor option created', data: option });
    } catch (err) {
      console.error('Error creating lead vendor option:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/lead-vendor-options/:id — rename, toggle active, and/or set revenue %
// ─────────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  protect,
  requireMainOrgAdmin,
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    // number 0-100, or null/'' to go back to the default percentage
    body('revenuePercentage')
      .optional({ nullable: true, checkFalsy: false })
      .custom((v) => {
        if (v === null || v === '') return true;
        if (typeof v !== 'number' && typeof v !== 'string') throw new Error('revenuePercentage must be a number');
        const n = Number(v);
        if (!isValidPercentage(n)) throw new Error('revenuePercentage must be between 0 and 100');
        return true;
      }),
    paymentModelValidator,
    cpaRateValidator
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const option = await LeadVendorOption.findById(req.params.id);
      if (!option) {
        return res.status(404).json({ success: false, message: 'Lead vendor option not found' });
      }
      if (req.body.name !== undefined) {
        const name = req.body.name.trim();
        const dup = await LeadVendorOption.findOne({
          _id: { $ne: option._id },
          name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (dup) {
          return res.status(400).json({ success: false, message: 'A lead vendor option with this name already exists' });
        }
        option.name = name;
      }
      if (req.body.isActive !== undefined) {
        option.isActive = req.body.isActive;
      }
      if (req.body.revenuePercentage !== undefined) {
        const v = req.body.revenuePercentage;
        // null/'' clears the custom rate so the vendor falls back to the default
        option.revenuePercentage = (v === null || v === '') ? undefined : Math.round(Number(v) * 100) / 100;
      }
      if (req.body.paymentModel !== undefined) {
        option.paymentModel = req.body.paymentModel;
      }
      if (req.body.cpaRate !== undefined) {
        const v = req.body.cpaRate;
        option.cpaRate = (v === null || v === '') ? undefined : round2(v);
      }
      // A CPA vendor can't exist without a rate (it would silently pay $0).
      // The stored rate is kept when switching back to CPL so it isn't lost.
      if (option.paymentModel === 'CPA' && !isValidCpaRate(option.cpaRate)) {
        return res.status(400).json({ success: false, message: 'A CPA rate is required for CPA lead vendors' });
      }
      await option.save();
      res.json({ success: true, message: 'Lead vendor option updated', data: option });
    } catch (err) {
      console.error('Error updating lead vendor option:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// DELETE /api/lead-vendor-options/:id — permanently remove an option
// Refused while any lead is tagged with the name or any Multi Vendor Admin
// still has it in scope: deleting would drop the vendor's payout settings
// (CPL % / CPA rate) and silently change what historic sales are worth.
// Those vendors should be retired instead.
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid lead vendor option id' });
    }
    const option = await LeadVendorOption.findById(req.params.id);
    if (!option) {
      return res.status(404).json({ success: false, message: 'Lead vendor option not found' });
    }

    const [leadCount, accountCount] = await Promise.all([
      Lead.countDocuments({ leadVendor: option.name }),
      User.countDocuments({ subLeadVendors: option.name })
    ]);
    if (leadCount > 0 || accountCount > 0) {
      const parts = [];
      if (leadCount > 0) parts.push(`${leadCount} lead${leadCount === 1 ? '' : 's'}`);
      if (accountCount > 0) parts.push(`${accountCount} Multi Vendor account${accountCount === 1 ? '' : 's'}`);
      return res.status(409).json({
        success: false,
        message: `"${option.name}" is still used by ${parts.join(' and ')}, so it can't be deleted. Retire it instead.`
      });
    }

    await option.deleteOne();
    res.json({ success: true, message: 'Lead vendor option deleted' });
  } catch (err) {
    console.error('Error deleting lead vendor option:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
