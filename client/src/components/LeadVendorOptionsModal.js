import React, { useState, useEffect } from 'react';
import { X, Tags, Plus, Loader, Pencil, Check, RotateCcw } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';

// Main-org-admin-only management UI for the Lead Vendor options list —
// the controlled vocabulary Agent2 picks a "Lead Vendor" from when
// creating a lead, and the pool a Multi Vendor Admin's access is drawn from.
const LeadVendorOptionsModal = ({ isOpen, onClose, onChanged }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingPct, setEditingPct] = useState('');
  const [defaultPct, setDefaultPct] = useState(3);
  const [savingId, setSavingId] = useState(null);

  const fetchOptions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/lead-vendor-options?all=true');
      if (res.data?.success) {
        setOptions(res.data.data || []);
        if (typeof res.data.defaultRevenuePercentage === 'number') setDefaultPct(res.data.defaultRevenuePercentage);
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
      setEditingId(null);
      setEditingName('');
      setEditingPct('');
    }
  }, [isOpen]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Enter a name'); return; }
    setAdding(true);
    try {
      const res = await axios.post('/api/lead-vendor-options', { name });
      if (res.data?.success) {
        toast.success('Lead vendor added');
        setNewName('');
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
    setEditingId(opt._id);
    setEditingName(opt.name);
    setEditingPct(opt.revenuePercentage === undefined || opt.revenuePercentage === null ? '' : String(opt.revenuePercentage));
  };

  const saveEdit = async (id) => {
    const name = editingName.trim();
    if (!name) { toast.error('Name cannot be empty'); return; }

    // blank = use the default percentage
    const pctText = editingPct.trim();
    const revenuePercentage = pctText === '' ? null : Number(pctText);
    if (revenuePercentage !== null && (!Number.isFinite(revenuePercentage) || revenuePercentage < 0 || revenuePercentage > 100)) {
      toast.error('Revenue % must be a number between 0 and 100');
      return;
    }

    setSavingId(id);
    try {
      const res = await axios.patch(`/api/lead-vendor-options/${id}`, { name, revenuePercentage });
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
              <p className="text-xs text-gray-500">Options Agent2 can pick when adding a lead, and each vendor&apos;s revenue %</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Add new */}
        <div className="px-6 pt-5 pb-3 shrink-0">
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
        </div>

        {/* List */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader size={20} className="animate-spin text-gray-400" /></div>
          ) : options.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No lead vendors yet — add one above.</p>
          ) : (
            <div className="space-y-2">
              {options.map(opt => (
                <div key={opt._id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${opt.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                  {editingId === opt._id ? (
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(opt._id); }}
                        autoFocus
                        className="flex-1 min-w-0 px-2.5 py-1.5 border-2 border-cyan-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                      />
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
                    </div>
                  ) : (
                    <div className="flex flex-col min-w-0">
                      <span className={`text-sm font-semibold ${opt.isActive ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                        {opt.name}
                      </span>
                      <span className={`text-xs ${opt.revenuePercentage === undefined || opt.revenuePercentage === null ? 'text-gray-400' : 'text-emerald-600 font-semibold'}`}>
                        Revenue {opt.revenuePercentage === undefined || opt.revenuePercentage === null
                          ? `${defaultPct}% (default)`
                          : `${opt.revenuePercentage}%`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 shrink-0">
                    {editingId === opt._id ? (
                      <button onClick={() => saveEdit(opt._id)} disabled={savingId === opt._id}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                        <Check size={15} />
                      </button>
                    ) : (
                      <button onClick={() => startEdit(opt)}
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadVendorOptionsModal;
