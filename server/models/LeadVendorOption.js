const mongoose = require('mongoose');

// Managed list of "Lead Vendor" names Agent2 can tag a manually-created lead
// with (e.g. "Jake 1", "Jake 2"). Only the main organization admin / superadmin
// may add or retire entries — see routes/leadVendorOptions.js.
const leadVendorOptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Lead vendor name is required'],
    trim: true,
    maxlength: [100, 'Lead vendor name cannot exceed 100 characters'],
    unique: true
  },
  // Retired entries are kept (not deleted) so historical leads that already
  // reference this name still resolve correctly — just hidden from new picks.
  isActive: {
    type: Boolean,
    default: true
  },
  // Revenue % (of enrolled debt) shown for this vendor's SALE leads in Multi
  // Vendor Payment Status. Set by the main org admin; when unset the default in
  // utils/vendorRevenue.js applies. Deliberately NOT returned to non-admin users.
  revenuePercentage: {
    type: Number,
    min: [0, 'Revenue percentage cannot be negative'],
    max: [100, 'Revenue percentage cannot exceed 100']
  },
  // How this vendor is paid in Payment Status:
  //   CPL — cost per lead: revenue = revenuePercentage % of enrolled debt.
  //   CPA — cost per acquisition: a fixed cpaRate ($) per SALE lead whose call
  //         lasted more than CPA_MIN_CALL_SECONDS (see utils/vendorRevenue.js).
  // Entries created before this field existed have no value and behave as CPL.
  // Like revenuePercentage, never returned to non-admin users.
  paymentModel: {
    type: String,
    enum: ['CPL', 'CPA'],
    default: 'CPL'
  },
  cpaRate: {
    type: Number,
    min: [0, 'CPA rate cannot be negative'],
    max: [1000000, 'CPA rate is too large']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

leadVendorOptionSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('LeadVendorOption', leadVendorOptionSchema);
