import React, { useState } from 'react';
import { X, CalendarClock, Loader, AlertTriangle } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

const DEBT_TYPES_BY_CATEGORY = {
  secured: [
    'Mortgage Loans',
    'Auto Loans',
    'Secured Personal Loans',
    'Home Equity Loans',
    'Title Loans'
  ],
  unsecured: [
    'Credit Cards',
    'Instalment Loans (Unsecured)',
    'Medical Bills',
    'Utility Bills',
    'Payday Loans',
    'Student Loans (private loan)',
    'Store/Charge Cards',
    'Overdraft Balances',
    'Business Loans (unsecured)',
    'Collection Accounts'
  ]
};

const CREDIT_SCORE_RANGES = ['300-549', '550-649', '650-699', '700-749', '750-850'];

const todayISO = () => new Date().toISOString().slice(0, 10);

const INITIAL_FORM = {
  entryDate: '',
  name: '',
  email: '',
  phone: '',
  alternatePhone: '',
  debtCategory: 'unsecured',
  debtTypes: [],
  totalDebtAmount: '',
  numberOfCreditors: '',
  monthlyDebtPayment: '',
  creditScore: '',
  creditScoreRange: '',
  address: '',
  city: '',
  state: '',
  zipcode: '',
  notes: ''
};

// Admin-only: record a lead dated in the past (e.g. importing historical
// records). The backend independently enforces that only the main
// organization admin (or superadmin) may set entryDate — this modal is
// only ever rendered for that same gate, but the real check lives server-side.
const BackdatedLeadModal = ({ isOpen, onClose, onCreated }) => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetAndClose = () => {
    setFormData(INITIAL_FORM);
    setError('');
    onClose();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (e) => {
    const debtCategory = e.target.value;
    setFormData(prev => ({ ...prev, debtCategory, debtTypes: [] }));
  };

  const toggleDebtType = (type) => {
    setFormData(prev => ({
      ...prev,
      debtTypes: prev.debtTypes.includes(type)
        ? prev.debtTypes.filter(t => t !== type)
        : [...prev.debtTypes, type]
    }));
  };

  const handleSubmit = async () => {
    setError('');

    if (!formData.entryDate) {
      setError('Entry date is required for a backdated lead.');
      return;
    }
    if (formData.entryDate > todayISO()) {
      setError('Entry date cannot be in the future.');
      return;
    }
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    if (formData.phone && !/^(\+1)?\d{10}$/.test(formData.phone.replace(/[\s\-()]/g, ''))) {
      setError('Phone number must be 10 digits (optional +1 prefix).');
      return;
    }
    if (formData.alternatePhone && !/^(\+1)?\d{10}$/.test(formData.alternatePhone.replace(/[\s\-()]/g, ''))) {
      setError('Alternate phone number must be 10 digits (optional +1 prefix).');
      return;
    }

    const payload = {
      // dd/mm/yyyy, matching the format the backend's date parser expects
      entryDate: (() => {
        const [y, m, d] = formData.entryDate.split('-');
        return `${d}/${m}/${y}`;
      })(),
      name: formData.name.trim()
    };

    if (formData.email.trim()) payload.email = formData.email.trim();
    if (formData.phone.trim()) payload.phone = formData.phone.trim();
    if (formData.alternatePhone.trim()) payload.alternatePhone = formData.alternatePhone.trim();
    if (formData.debtCategory) payload.debtCategory = formData.debtCategory;
    if (formData.debtTypes.length > 0) payload.debtTypes = formData.debtTypes;
    if (formData.totalDebtAmount !== '' && !isNaN(formData.totalDebtAmount)) payload.totalDebtAmount = parseFloat(formData.totalDebtAmount);
    if (formData.numberOfCreditors !== '' && !isNaN(formData.numberOfCreditors)) payload.numberOfCreditors = parseInt(formData.numberOfCreditors, 10);
    if (formData.monthlyDebtPayment !== '' && !isNaN(formData.monthlyDebtPayment)) payload.monthlyDebtPayment = parseFloat(formData.monthlyDebtPayment);
    if (formData.creditScore !== '' && !isNaN(formData.creditScore)) payload.creditScore = parseInt(formData.creditScore, 10);
    if (formData.creditScoreRange) payload.creditScoreRange = formData.creditScoreRange;
    if (formData.address.trim()) payload.address = formData.address.trim();
    if (formData.city.trim()) payload.city = formData.city.trim();
    if (formData.state.trim()) payload.state = formData.state.trim();
    if (formData.zipcode.trim()) payload.zipcode = formData.zipcode.trim();
    if (formData.notes.trim()) payload.notes = formData.notes.trim();

    setSubmitting(true);
    try {
      const res = await axios.post('/api/leads', payload);
      if (res.data?.success) {
        toast.success(res.data.message || 'Backdated lead created');
        onCreated?.();
        resetAndClose();
      }
    } catch (err) {
      const msg = err.response?.data?.message
        || err.response?.data?.errors?.[0]?.msg
        || 'Failed to create lead';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const debtTypeOptions = DEBT_TYPES_BY_CATEGORY[formData.debtCategory] || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl">
              <CalendarClock size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Add Backdated Lead</h2>
              <p className="text-xs text-gray-500">Record a lead dated in the past</p>
            </div>
          </div>
          <button onClick={resetAndClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Entry Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <CalendarClock size={14} className="inline mr-1.5 text-amber-500" />
              Entry Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="entryDate"
              value={formData.entryDate}
              max={todayISO()}
              onChange={handleChange}
              className="w-full px-3 py-2.5 border-2 border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm font-medium transition-all"
            />
            <p className="text-xs text-gray-500 mt-1">The lead will be recorded as if created on this date — it will show up under this date in reports and filters.</p>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleChange}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
          </div>

          {/* Email / Phone / Alt Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} placeholder="10 digits"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Alternate Phone</label>
              <input type="text" name="alternatePhone" value={formData.alternatePhone} onChange={handleChange} placeholder="10 digits"
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
          </div>

          {/* Debt Category + Types */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Debt Category</label>
            <select name="debtCategory" value={formData.debtCategory} onChange={handleCategoryChange}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all mb-3">
              <option value="unsecured">Unsecured</option>
              <option value="secured">Secured</option>
            </select>
            <div className="flex flex-wrap gap-2">
              {debtTypeOptions.map(type => (
                <button key={type} type="button" onClick={() => toggleDebtType(type)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all ${
                    formData.debtTypes.includes(type)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Financial details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Total Debt ($)</label>
              <input type="number" name="totalDebtAmount" value={formData.totalDebtAmount} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5"># Creditors</label>
              <input type="number" name="numberOfCreditors" value={formData.numberOfCreditors} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Monthly Payment ($)</label>
              <input type="number" name="monthlyDebtPayment" value={formData.monthlyDebtPayment} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Credit Score</label>
              <input type="number" name="creditScore" value={formData.creditScore} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Credit Score Range</label>
            <select name="creditScoreRange" value={formData.creditScoreRange} onChange={handleChange}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all">
              <option value="">Select a range…</option>
              {CREDIT_SCORE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Address</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">City</label>
              <input type="text" name="city" value={formData.city} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">State</label>
              <input type="text" name="state" value={formData.state} onChange={handleChange}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Zipcode</label>
            <input type="text" name="zipcode" value={formData.zipcode} onChange={handleChange}
              className="w-full sm:w-1/4 px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm transition-all" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={resetAndClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl hover:from-amber-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/25">
            {submitting ? <><Loader size={15} className="animate-spin" /> Creating…</> : <><CalendarClock size={15} /> Create Backdated Lead</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackdatedLeadModal;
