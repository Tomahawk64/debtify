import React, { useState, useEffect } from 'react';
import { X, Tags, Plus, Loader, Pencil, Check, RotateCcw, Trash2 } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

// Main-org-admin-only management UI for the Lead Vendor options list —
// the controlled vocabulary Agent2 picks a "Lead Vendor" from when
// creating a lead, and the pool a Multi Vendor Admin's access is drawn from.
// Each vendor is paid either per lead (CPL: a % of enrolled debt) or per
// acquisition (CPA: a fixed rate for every sale whose call ran past the limit).

const selectCls = 'px-2.5 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all';

const isBlank = (v) => v === undefined || v === null || v === '';
const rateText = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ModelBadge = ({ model }) => (
  <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold align-middle ${
    model === 'CPA' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
  }`}>
    {model}
  </span>
);

const LeadVendorOptionsModal = ({ isOpen, onClose, onChanged }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('CPL');
  const [newRate, setNewRate] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingModel, setEditingModel] = useState('CPL');
  const [editingPct, setEditingPct] = useState('');
  const [editingRate, setEditingRate] = useState('');
  const [defaultPct, setDefaultPct] = useState(3);
  const [minSeconds, setMinSeconds] = useState(180);
  const [savingId, setSavingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const fetchOptions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/lead-vendor-options?all=true');
      if (res.data?.success) {
        setOptions(res.data.data || []);
        if (typeof res.data.defaultRevenuePercentage === 'number') setDefaultPct(res.data.defaultRevenuePercentage);
        if (typeof res.data.cpaMinCallSeconds === 'number') setMinSeconds(res.data.cpaMinCallSeconds);
      }
    } catch {
      toast.error('Failed to load lead vendor options');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchOptions();
    else {
      setNewName('');
      setNewModel('CPL');
      setNewRate('');
      setEditingId(null);
      setEditingName('');
      setEditingModel('CPL');
      setEditingPct('');
      setEditingRate('');
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  // Returns the parsed rate, or null (after showing a toast) when it is missing/invalid.
  const parseCpaRate = (text) => {
    const t = String(text).trim();
    if (t === '') { toast.error('Enter the CPA rate'); return null; }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) {
      toast.error('CPA rate must be a number of 0 or more');
      return null;
    }
    return n;
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Enter a name'); return; }
    const body = { name, paymentModel: newModel };
    if (newModel === 'CPA') {
      const rate = parseCpaRate(newRate);
      if (rate === null) return;
      body.cpaRate = rate;
    }
    setAdding(true);
    try {
      const res = await axios.post('/api/lead-vendor-options', body);
      if (res.data?.success) {
        toast.success('Lead vendor added');
        setNewName('');
        setNewModel('CPL');
        setNewRate('');
        await fetchOptions();
        onChanged?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add lead vendor');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (opt) => {
    setConfirmDeleteId(null);
    setEditingId(opt._id);
    setEditingName(opt.name);
    setEditingModel(opt.paymentModel === 'CPA' ? 'CPA' : 'CPL');
    setEditingPct(isBlank(opt.revenuePercentage) ? '' : String(opt.revenuePercentage));
    setEditingRate(isBlank(opt.cpaRate) ? '' : String(opt.cpaRate));
  };

  const saveEdit = async (id) => {
    const name = editingName.trim();
    if (!name) { toast.error('Name cannot be empty'); return; }

    const body = { name, paymentModel: editingModel };
    if (editingModel === 'CPA') {
      const rate = parseCpaRate(editingRate);
      if (rate === null) return;
      body.cpaRate = rate;
    } else {
      // blank = use the default percentage
      const pctText = editingPct.trim();
      const revenuePercentage = pctText === '' ? null : Number(pctText);
      if (revenuePercentage !== null && (!Number.isFinite(revenuePercentage) || revenuePercentage < 0 || revenuePercentage > 100)) {
        toast.error('Revenue % must be a number between 0 and 100');
        return;
      }
      body.revenuePercentage = revenuePercentage;
    }

    setSavingId(id);
    try {
      const res = await axios.patch(`/api/lead-vendor-options/${id}`, body);
      if (res.data?.success) {
        toast.success('Saved');
        setEditingId(null);
        await fetchOptions();
        onChanged?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (opt) => {
    setSavingId(opt._id);
    try {
      const res = await axios.patch(`/api/lead-vendor-options/${opt._id}`, { isActive: !opt.isActive });
      if (res.data?.success) {
        toast.success(opt.isActive ? 'Retired' : 'Reactivated');
        await fetchOptions();
        onChanged?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    } finally {
      setSavingId(null);
    }
  };

  const deleteOption = async (opt) => {
    setSavingId(opt._id);
    try {
      const res = await axios.delete(`/api/lead-vendor-options/${opt._id}`);
      if (res.data?.success) {
        toast.success('Lead vendor deleted');
        setConfirmDeleteId(null);
        await fetchOptions();
        onChanged?.();
      }
    } catch (err) {
      // e.g. the vendor still has leads / Multi Vendor accounts — the server explains and suggests retiring
      toast.error(err.response?.data?.message || 'Failed to delete lead vendor');
      setConfirmDeleteId(null);
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl">
              <Tags size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Manage Lead Vendors</h2>
              <p className="text-xs text-gray-500">Options Agent2 can pick when adding a lead, and how each vendor is paid (CPL % or CPA rate)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Add new */}
        <div className="px-6 pt-5 pb-3 shrink-0 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="e.g. Jake 1"
              className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-sm font-medium transition-all"
            />
            <button
              onClick={handleAdd}
              disabled={adding}
              className="px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-sky-600 rounded-xl hover:from-cyan-500 hover:to-sky-500 disabled:opacity-50 flex items-center gap-1.5 transition-all shrink-0"
            >
              {adding ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
              Add
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-gray-500" htmlFor="new-vendor-model">Payment type</label>
            <select
              id="new-vendor-model"
              value={newModel}
              onChange={e => setNewModel(e.target.value)}
              className={selectCls}
            >
              <option value="CPL">CPL (cost per lead)</option>
              <option value="CPA">CPA (cost per acquisition)</option>
            </select>
            {newModel === 'CPA' && (
              <div className="flex items-center gap-1" title={`Fixed amount paid to the vendor for each sale whose call lasted more than ${minSeconds} seconds`}>
                <span className="text-sm font-semibold text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Rate"
                  aria-label="CPA rate"
                  className="w-24 px-2 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-right focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />
              </div>
            )}
          </div>
          {newModel === 'CPA' && (
            <p className="text-[11px] text-gray-400">
              Paid a fixed rate per sale lead only when the call lasted more than {minSeconds} seconds.
            </p>
          )}
        </div>

        {/* List */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader size={20} className="animate-spin text-gray-400" /></div>
          ) : options.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No lead vendors yet — add one above.</p>
          ) : (
            <div className="space-y-2">
              {options.map(opt => {
                const model = opt.paymentModel === 'CPA' ? 'CPA' : 'CPL';
                const isEditing = editingId === opt._id;
                const isConfirming = confirmDeleteId === opt._id;
                return (
                  <div key={opt._id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${opt.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                    {isEditing ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(opt._id); }}
                          autoFocus
                          className="flex-1 min-w-[8rem] px-2.5 py-1.5 border-2 border-cyan-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                        />
                        <select
                          value={editingModel}
                          onChange={e => setEditingModel(e.target.value)}
                          aria-label="Payment type"
                          className="px-2 py-1.5 border-2 border-cyan-300 rounded-lg text-sm font-semibold text-gray-700 bg-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                        >
                          <option value="CPL">CPL</option>
                          <option value="CPA">CPA</option>
                        </select>
                        {editingModel === 'CPA' ? (
                          <div className="flex items-center gap-1 shrink-0" title={`Fixed amount paid for each sale whose call lasted more than ${minSeconds} seconds`}>
                            <span className="text-sm font-semibold text-gray-500">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingRate}
                              onChange={e => setEditingRate(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(opt._id); }}
                              placeholder="Rate"
                              aria-label="CPA rate"
                              className="w-24 px-2 py-1.5 border-2 border-cyan-300 rounded-lg text-sm font-medium text-right focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0" title={`Revenue % of enrolled debt. Leave blank for the default (${defaultPct}%).`}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={editingPct}
                              onChange={e => setEditingPct(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(opt._id); }}
                              placeholder={String(defaultPct)}
                              aria-label="Revenue percentage"
                              className="w-20 px-2 py-1.5 border-2 border-cyan-300 rounded-lg text-sm font-medium text-right focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                            />
                            <span className="text-sm font-semibold text-gray-500">%</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-semibold ${opt.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                          {opt.name}
                          <ModelBadge model={model} />
                        </span>
                        {model === 'CPA' ? (
                          <span className={`text-xs ${isBlank(opt.cpaRate) ? 'text-red-500' : 'text-emerald-600 font-semibold'}`}>
                            {isBlank(opt.cpaRate)
                              ? 'CPA rate missing'
                              : `$${rateText(opt.cpaRate)} per sale over ${minSeconds}s`}
                          </span>
                        ) : (
                          <span className={`text-xs ${isBlank(opt.revenuePercentage) ? 'text-gray-400' : 'text-emerald-600 font-semibold'}`}>
                            Revenue {isBlank(opt.revenuePercentage)
                              ? `${defaultPct}% (default)`
                              : `${opt.revenuePercentage}%`}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isConfirming ? (
                        <>
                          <span className="text-xs font-semibold text-gray-600 hidden sm:inline">Delete?</span>
                          <button onClick={() => deleteOption(opt)} disabled={savingId === opt._id}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
                            {savingId === opt._id ? <Loader size={12} className="animate-spin" /> : null}
                            Delete
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} disabled={savingId === opt._id}
                            className="px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {isEditing ? (
                            <button onClick={() => saveEdit(opt._id)} disabled={savingId === opt._id}
                              title="Save"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                              <Check size={15} />
                            </button>
                          ) : (
                            <button onClick={() => startEdit(opt)} title="Edit"
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                          <button onClick={() => toggleActive(opt)} disabled={savingId === opt._id}
                            title={opt.isActive ? 'Retire (hide from new leads)' : 'Reactivate'}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 ${
                              opt.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                            }`}>
                            {opt.isActive ? 'Retire' : <><RotateCcw size={12} /> Reactivate</>}
                          </button>
                          <button onClick={() => { setEditingId(null); setConfirmDeleteId(opt._id); }}
                            disabled={savingId === opt._id}
                            title="Delete permanently"
                            aria-label={`Delete ${opt.name}`}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadVendorOptionsModal;
