const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const DataVendorUpload = require('../models/DataVendorUpload');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// Data Vendor Lead Audit — READ-ONLY fraud-detection view.
// Restricted to the main organization admin (+ superadmin), same
// convention used throughout the codebase (routes/auth.js,
// utils/notificationHelper.js).
// ─────────────────────────────────────────────────────────────────
const MAIN_ORG_NAME = (process.env.MAIN_ORG_NAME || 'DEBTIFY').trim().toUpperCase();

const isMainOrgAdminUser = async (user) => {
  if (user.role !== 'admin' || !user.organization) return false;
  try {
    const org = await Organization.findById(user.organization).lean();
    return !!(org && org.name.trim().toUpperCase() === MAIN_ORG_NAME);
  } catch {
    return false;
  }
};

async function requireMainOrgAdmin(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  const allowed = await isMainOrgAdminUser(req.user);
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this route' });
  }
  next();
}

// Duration-flag thresholds (seconds). Only applies to NON-sale calls —
// a long call that didn't close is the suspicious pattern this flags.
const DURATION_GREEN_MIN  = 15 * 60; // 900
const DURATION_YELLOW_MIN = 20 * 60; // 1200
const DURATION_RED_MIN    = 30 * 60; // 1800

function getDurationFlag(status, durationRaw) {
  const statusUpper = (status || '').toUpperCase().trim();
  if (statusUpper === 'SALE') return null;
  const seconds = parseFloat(durationRaw);
  if (!Number.isFinite(seconds) || seconds < DURATION_GREEN_MIN) return null;
  if (seconds >= DURATION_RED_MIN) return 'red';
  if (seconds >= DURATION_YELLOW_MIN) return 'yellow';
  return 'green';
}

// ─────────────────────────────────────────────────────────────────
// GET /api/vendor-audit/vendors
// All data vendors (for the vendor picker)
// ─────────────────────────────────────────────────────────────────
router.get('/vendors', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    const vendors = await User.find({ role: 'data_vendor' }).select('name email').sort('name').lean();
    res.json({ success: true, data: vendors });
  } catch (err) {
    console.error('Error fetching vendors for audit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/vendor-audit/stats
// Org-wide per-vendor statistical anomaly summary
// ─────────────────────────────────────────────────────────────────
router.get('/stats', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    const numify = (field) => ({ $convert: { input: field, to: 'double', onError: 0, onNull: 0 } });
    const numifyOrNull = (field) => ({ $convert: { input: field, to: 'double', onError: null, onNull: null } });

    // ── Per-vendor totals ──────────────────────────────────────
    const totals = await DataVendorUpload.aggregate([
      {
        $addFields: {
          statusUpper: { $toUpper: { $ifNull: ['$status', ''] } },
          debtNum: numify('$debt'),
          durationNum: numifyOrNull('$duration')
        }
      },
      {
        $group: {
          _id: '$sharedWith',
          totalLeads:     { $sum: 1 },
          totalSales:     { $sum: { $cond: [{ $eq: ['$statusUpper', 'SALE'] }, 1, 0] } },
          saleDebtSum:    { $sum: { $cond: [{ $eq: ['$statusUpper', 'SALE'] }, '$debtNum', 0] } },
          nonSaleCount:   { $sum: { $cond: [{ $ne: ['$statusUpper', 'SALE'] }, 1, 0] } },
          nonSaleDebtSum: { $sum: { $cond: [{ $ne: ['$statusUpper', 'SALE'] }, '$debtNum', 0] } },
          greenFlags: {
            $sum: {
              $cond: [{ $and: [
                { $ne: ['$statusUpper', 'SALE'] },
                { $gte: ['$durationNum', DURATION_GREEN_MIN] },
                { $lt:  ['$durationNum', DURATION_YELLOW_MIN] }
              ] }, 1, 0]
            }
          },
          yellowFlags: {
            $sum: {
              $cond: [{ $and: [
                { $ne: ['$statusUpper', 'SALE'] },
                { $gte: ['$durationNum', DURATION_YELLOW_MIN] },
                { $lt:  ['$durationNum', DURATION_RED_MIN] }
              ] }, 1, 0]
            }
          },
          redFlags: {
            $sum: {
              $cond: [{ $and: [
                { $ne: ['$statusUpper', 'SALE'] },
                { $gte: ['$durationNum', DURATION_RED_MIN] }
              ] }, 1, 0]
            }
          }
        }
      }
    ]);

    // ── Per-vendor, per-run breakdown (for the "recent drop" trend check) ──
    const perRun = await DataVendorUpload.aggregate([
      {
        $addFields: { statusUpper: { $toUpper: { $ifNull: ['$status', ''] } } }
      },
      {
        $group: {
          _id: { vendor: '$sharedWith', runBatchId: '$runBatchId' },
          totalLeads: { $sum: 1 },
          totalSales: { $sum: { $cond: [{ $eq: ['$statusUpper', 'SALE'] }, 1, 0] } },
          runNumber:  { $first: '$runNumber' },
          runDate:    { $first: '$runDate' }
        }
      },
      { $sort: { '_id.vendor': 1, runNumber: 1 } }
    ]);

    const runsByVendor = new Map();
    perRun.forEach(r => {
      const key = r._id.vendor.toString();
      if (!runsByVendor.has(key)) runsByVendor.set(key, []);
      runsByVendor.get(key).push(r);
    });

    // Organization-wide pooled average (sum of sales / sum of leads), not
    // an average-of-rates, so large and small vendors are weighted fairly.
    const orgTotalLeads = totals.reduce((s, v) => s + v.totalLeads, 0);
    const orgTotalSales = totals.reduce((s, v) => s + v.totalSales, 0);
    const orgAvgSaleRate = orgTotalLeads > 0 ? orgTotalSales / orgTotalLeads : 0;

    const vendorIds = totals.map(v => v._id).filter(Boolean);
    const vendorUsers = await User.find({ _id: { $in: vendorIds } }).select('name email').lean();
    const vendorMap = new Map(vendorUsers.map(u => [u._id.toString(), u]));

    const MIN_SAMPLE = 20; // avoid flagging on tiny sample sizes

    const data = totals.map(v => {
      const key = (v._id || '').toString();
      const vendor = vendorMap.get(key);
      const saleRate = v.totalLeads > 0 ? v.totalSales / v.totalLeads : 0;
      const avgSaleDebt = v.totalSales > 0 ? v.saleDebtSum / v.totalSales : 0;
      const avgNonSaleDebt = v.nonSaleCount > 0 ? v.nonSaleDebtSum / v.nonSaleCount : 0;

      const flags = [];

      // Low conversion vs org average
      if (v.totalLeads >= MIN_SAMPLE && orgAvgSaleRate > 0 && saleRate < orgAvgSaleRate * 0.5) {
        flags.push({
          type: 'low_conversion',
          label: 'Low Conversion',
          detail: `Sale rate ${(saleRate * 100).toFixed(1)}% is less than half the org average (${(orgAvgSaleRate * 100).toFixed(1)}%).`
        });
      }

      // High-value leads disproportionately marked non-sale
      if (v.nonSaleCount >= 10 && v.totalSales >= 5 && avgNonSaleDebt > avgSaleDebt * 1.2) {
        flags.push({
          type: 'high_value_non_sale',
          label: 'High-Value Leads Marked Non-Sale',
          detail: `Avg debt on non-sale leads ($${avgNonSaleDebt.toFixed(0)}) is notably higher than on sale leads ($${avgSaleDebt.toFixed(0)}).`
        });
      }

      // Recent-run drop vs this vendor's own history
      const runs = runsByVendor.get(key) || [];
      if (runs.length >= 2) {
        const lastRun = runs[runs.length - 1];
        const priorRuns = runs.slice(0, -1);
        const priorLeads = priorRuns.reduce((s, r) => s + r.totalLeads, 0);
        const priorSales = priorRuns.reduce((s, r) => s + r.totalSales, 0);
        const priorRate = priorLeads > 0 ? priorSales / priorLeads : 0;
        const lastRate = lastRun.totalLeads > 0 ? lastRun.totalSales / lastRun.totalLeads : 0;
        if (priorLeads >= MIN_SAMPLE && lastRun.totalLeads >= 10 && priorRate > 0 && lastRate < priorRate * 0.5) {
          flags.push({
            type: 'recent_drop',
            label: 'Recent Drop in Sales',
            detail: `Latest run's sale rate (${(lastRate * 100).toFixed(1)}%) is less than half this vendor's own historical average (${(priorRate * 100).toFixed(1)}%).`
          });
        }
      }

      // Long non-sale calls (duration flags)
      if (v.redFlags > 0) {
        flags.push({
          type: 'long_non_sale_calls',
          label: `${v.redFlags} Long Non-Sale Call${v.redFlags !== 1 ? 's' : ''} (30min+)`,
          detail: `${v.redFlags} call${v.redFlags !== 1 ? 's' : ''} lasted 30+ minutes but weren't marked as a sale.`
        });
      }

      return {
        vendorId: key,
        vendorName: vendor?.name || 'Unknown Vendor',
        vendorEmail: vendor?.email || '',
        totalLeads: v.totalLeads,
        totalSales: v.totalSales,
        saleRate,
        avgSaleDebt,
        avgNonSaleDebt,
        durationFlags: { green: v.greenFlags, yellow: v.yellowFlags, red: v.redFlags },
        flags
      };
    }).sort((a, b) => b.flags.length - a.flags.length || b.totalLeads - a.totalLeads);

    res.json({ success: true, data, orgAvgSaleRate, orgTotalLeads, orgTotalSales });
  } catch (err) {
    console.error('Error computing vendor audit stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/vendor-audit/vendors/:vendorId/lists
// ─────────────────────────────────────────────────────────────────
router.get('/vendors/:vendorId/lists', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const lists = await DataVendorUpload.aggregate([
      { $match: { sharedWith: new mongoose.Types.ObjectId(vendorId) } },
      {
        $group: {
          _id: '$listName',
          totalLeads:  { $sum: 1 },
          runBatchIds: { $addToSet: '$runBatchId' },
          lastRunDate: { $max: '$runDate' }
        }
      },
      {
        $project: {
          _id: 0,
          listName: '$_id',
          totalLeads: 1,
          totalRuns: { $size: '$runBatchIds' },
          lastRunDate: 1
        }
      },
      { $sort: { listName: 1 } }
    ]);
    res.json({ success: true, data: lists });
  } catch (err) {
    console.error('Error fetching vendor lists for audit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/vendor-audit/vendors/:vendorId/lists/:listName/runs
// ─────────────────────────────────────────────────────────────────
router.get('/vendors/:vendorId/lists/:listName/runs', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    const { vendorId } = req.params;
    const listName = decodeURIComponent(req.params.listName);

    const runs = await DataVendorUpload.aggregate([
      { $match: { sharedWith: new mongoose.Types.ObjectId(vendorId), listName } },
      {
        $addFields: {
          statusUpper: { $toUpper: { $ifNull: ['$status', ''] } },
          durationNum: { $convert: { input: '$duration', to: 'double', onError: null, onNull: null } }
        }
      },
      {
        $group: {
          _id: '$runBatchId',
          runNumber:  { $first: '$runNumber' },
          runDate:    { $first: '$runDate' },
          runLabel:   { $first: '$runLabel' },
          uploadedBy: { $first: '$uploadedBy' },
          totalLeads: { $sum: 1 },
          totalSales: { $sum: { $cond: [{ $eq: ['$statusUpper', 'SALE'] }, 1, 0] } },
          greenFlags: {
            $sum: { $cond: [{ $and: [
              { $ne: ['$statusUpper', 'SALE'] },
              { $gte: ['$durationNum', DURATION_GREEN_MIN] },
              { $lt:  ['$durationNum', DURATION_YELLOW_MIN] }
            ] }, 1, 0] }
          },
          yellowFlags: {
            $sum: { $cond: [{ $and: [
              { $ne: ['$statusUpper', 'SALE'] },
              { $gte: ['$durationNum', DURATION_YELLOW_MIN] },
              { $lt:  ['$durationNum', DURATION_RED_MIN] }
            ] }, 1, 0] }
          },
          redFlags: {
            $sum: { $cond: [{ $and: [
              { $ne: ['$statusUpper', 'SALE'] },
              { $gte: ['$durationNum', DURATION_RED_MIN] }
            ] }, 1, 0] }
          }
        }
      },
      { $sort: { runNumber: 1 } }
    ]);

    const uploaderIds = [...new Set(runs.map(r => r.uploadedBy?.toString()).filter(Boolean))];
    const uploaders = uploaderIds.length
      ? await User.find({ _id: { $in: uploaderIds } }).select('name role').lean()
      : [];
    const uploaderMap = new Map(uploaders.map(u => [u._id.toString(), u]));

    const data = runs.map(r => {
      const uploader = r.uploadedBy ? uploaderMap.get(r.uploadedBy.toString()) : null;
      return {
        runBatchId: r._id,
        runNumber: r.runNumber,
        runDate: r.runDate,
        runLabel: r.runLabel,
        totalLeads: r.totalLeads,
        totalSales: r.totalSales,
        durationFlags: { green: r.greenFlags, yellow: r.yellowFlags, red: r.redFlags },
        uploadedByName: uploader
          ? (uploader.role === 'data_vendor' ? `${uploader.name} (self-uploaded)` : uploader.name)
          : null
      };
    });

    res.json({ success: true, data, listName });
  } catch (err) {
    console.error('Error fetching vendor runs for audit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/vendor-audit/runs/:runBatchId/records
// Paginated records for a run, with a computed durationFlag per record
// ─────────────────────────────────────────────────────────────────
router.get('/runs/:runBatchId/records', protect, requireMainOrgAdmin, async (req, res) => {
  try {
    const { runBatchId } = req.params;
    const { page = 1, limit = 100, flagFilter } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    const records = await DataVendorUpload.find({ runBatchId })
      .select('-__v -entryDateParsed -sharedWith -uploadedBy -organization')
      .lean();

    const withFlags = records.map(r => ({ ...r, durationFlag: getDurationFlag(r.status, r.duration) }));
    const filtered = flagFilter
      ? withFlags.filter(r => r.durationFlag === flagFilter)
      : withFlags;

    const total = filtered.length;
    const start = (pageNum - 1) * limitNum;
    const pageData = filtered.slice(start, start + limitNum);

    res.json({
      success: true,
      data: pageData,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('Error fetching run records for audit:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
