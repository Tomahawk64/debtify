const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const LeadVendorOption = require('../models/LeadVendorOption');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const { DEFAULT_REVENUE_PERCENTAGE, isValidPercentage } = require('../utils/vendorRevenue');

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
    if (!isPrivileged) query.select('-revenuePercentage');
    const options = await query.lean();
    res.json({
      success: true,
      data: options,
      ...(isPrivileged ? { defaultRevenuePercentage: DEFAULT_REVENUE_PERCENTAGE } : {})
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
      .withMessage('Name must be between 1 and 100 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const name = req.body.name.trim();
      const existing = await LeadVendorOption.findOne({ name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A lead vendor option with this name already exists' });
      }
      const option = await LeadVendorOption.create({ name, createdBy: req.user._id });
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
      })
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
      await option.save();
      res.json({ success: true, message: 'Lead vendor option updated', data: option });
    } catch (err) {
      console.error('Error updating lead vendor option:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
