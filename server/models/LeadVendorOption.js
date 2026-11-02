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
