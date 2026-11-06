import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard, Search, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, Users, CheckCircle2, XCircle, Clock, TrendingUp
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { formatEasternTimeForDisplay } from '../utils/dateUtils';

// Admin (main org) editor for Multi Vendor SALE-lead payment status. Mirrors the
// Data Vendor panel in PaymentStatus.js; vendors are identified by Lead Vendor name.

const STATUS_OPTIONS = ['', 'Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded'];

const STATUS_BADGE = {
  'Cleared':      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Pending':      'bg-yellow-100 text-yellow-700 border border-yellow-200',
  'NSF':          'bg-rose-100 text-rose-700 border border-rose-200',
  'Cancellation': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Refunded':     'bg-purple-100 text-purple-700 border border-purple-200',
  '':             'bg-gray-100 text-gray-500 border border-gray-200',
};

const STATUS_ICON = {
  'Cleared':      <CheckCircle2 size={12} />,
  'Pending':      <Clock size={12} />,
  'NSF':          <XCircle size={12} />,
  'Cancellation': <XCircle size={12} />,
  'Refunded':     <RefreshCw size={12} />,
  '':             <Clock size={12} />,
};

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Draft dates / status-updated dates are date-only values stored at UTC midnight.
const formatUtcDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const LIMIT = 50;
const selectCls = 'bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
const cellSelectCls = 'bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50';

// Controlled date cell: only saves when the value actually changed, and reverts on failure.
function DraftDateInput({ value, disabled, onCommit }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      type="date"
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={async () => {
        if (v === value) return;
        const ok = await onCommit(v);
        if (!ok) setV(value);
      }}
      className="bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
    />
  );
}

export default function MultiVendorPaymentPanel() {
  const [vendors, setVendors] = useState([]);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState('');

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalEnrolledDebt, setTotalEnrolledDebt] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const reqId = useRef(0);

  useEffect(() => {
    axios.get('/api/multivendor/payment-status/admin/vendors')
      .then((res) => setVendors(res.data?.data || []))
      .catch(() => toast.error('Failed to load lead vendors'))
      .finally(() => setVendorLoading(false));
  }, []);

  const fetchRecords = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (selectedVendor)             params.vendor = selectedVendor;
      if (search)                     params.search = search;
      if (startDate)                  params.startDate = startDate;
      if (endDate)                    params.endDate = endDate;
      if (paymentStatusFilter !== '') params.paymentStatusFilter = paymentStatusFilter;

      const res = await axios.get('/api/multivendor/payment-status/admin/sales', { params });
      if (myReq !== reqId.current) return; // a newer request superseded this one
      setRecords(res.data.data || []);
      setTotal(res.data.total || 0);
      setTotalEnrolledDebt(res.data.totalEnrolledDebt || 0);
      setTotalRevenue(res.data.totalRevenue || 0);
    } catch (err) {
      if (myReq !== reqId.current) return;
      setRecords([]); setTotal(0); setTotalEnrolledDebt(0); setTotalRevenue(0);
      toast.error(err.response?.data?.message || 'Failed to load SALE records');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [selectedVendor, search, startDate, endDate, paymentStatusFilter, page]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Returns true on success so callers (date inputs) can revert on failure.
  const handleFieldChange = async (record, field, value) => {
    setUpdatingId(record._id);
    try {
      const res = await axios.patch(`/api/multivendor/payment-status/${record._id}`, { [field]: value });
      setRecords((prev) => prev.map((r) => (r._id === record._id ? { ...r, ...res.data.data } : r)));
      toast.success('Updated');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setStartDate(''); setEndDate('');
    setSelectedVendor(''); setPaymentStatusFilter('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const th = 'px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider';

  return (
    <div>
      {/* Filters card */}
      <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-5 mb-5 shadow-xl">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Users size={11} /> Lead Vendor
            </label>
            {vendorLoading ? (
              <div className="h-9 bg-slate-700/50 rounded-lg animate-pulse" />
            ) : (
              <select value={selectedVendor} onChange={(e) => { setSelectedVendor(e.target.value); setPage(1); }} className={selectCls}>
                <option value="">All Lead Vendors</option>
                {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={11} /> From
            </label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={selectCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={selectCls} />
          </div>

          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CreditCard size={11} /> Payment Status
            </label>
            <select value={paymentStatusFilter} onChange={(e) => { setPaymentStatusFilter(e.target.value); setPage(1); }} className={selectCls}>
              <option value="">All Statuses</option>
              <option value="not_set">Not Set</option>
              <option value="Cleared">Cleared</option>
              <option value="Pending">Pending</option>
              <option value="NSF">NSF</option>
              <option value="Cancellation">Cancellation</option>
              <option value="Refunded">Refunded</option>
            </select>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Search size={11} /> Search
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name, phone, lead ID, vendor, status…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                Go
              </button>
            </div>
          </form>

          <button onClick={clearFilters}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors self-end">
            Clear
          </button>
          <button onClick={fetchRecords} disabled={loading} title="Refresh"
            className="px-3 py-2 text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors self-end disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-xl p-4 flex items-center gap-4 shadow">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow">
              <TrendingUp size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Enrolled Debt</p>
              <p className="text-xl font-bold text-white">{money(totalEnrolledDebt)}</p>
              <p className="text-xs text-slate-500">{total} SALE records</p>
            </div>
          </div>
          <div className="bg-slate-800/60 backdrop-blur border border-emerald-700/40 rounded-xl p-4 flex items-center gap-4 shadow">
            <div className="p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg shadow">
              <CreditCard size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
              <p className="text-xl font-bold text-emerald-400">{money(totalRevenue)}</p>
              <p className="text-xs text-slate-500">Across all matching records</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">
          {loading ? 'Loading…' : (
            <>Showing <span className="text-white font-semibold">{records.length}</span> of <span className="text-white font-semibold">{total}</span> SALE records</>
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-slate-400 text-sm">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw size={28} className="animate-spin text-indigo-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <CreditCard size={40} className="text-slate-600" />
            <p className="text-slate-500 text-sm">No SALE records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className={th}>Lead</th>
                  <th className={th}>Phone</th>
                  <th className={th}>Enrolled Debt</th>
                  <th className={th}>Revenue</th>
                  <th className={th}>Lead Vendor</th>
                  <th className={th}>Created At</th>
                  <th className={th}>Payment Status</th>
                  <th className={th}>Payment Type</th>
                  <th className={th}>Draft Date 1</th>
                  <th className={th}>Draft Date 2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {records.map((rec) => {
                  const busy = updatingId === rec._id;
                  return (
                    <tr key={rec._id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{rec.name || '—'}</div>
                        {rec.email && <div className="text-xs text-slate-500 truncate max-w-[160px]">{rec.email}</div>}
                        {rec.leadId && <div className="text-[10px] text-slate-600 font-mono">{rec.leadId}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{rec.phone || '—'}</td>
                      <td className="px-4 py-3">
                        {rec.enrolledDebt > 0
                          ? <span className="text-emerald-400 font-semibold">${Number(rec.enrolledDebt).toLocaleString()}</span>
                          : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {rec.revenue > 0
                          ? <span className="text-violet-400 font-semibold">{money(rec.revenue)}</span>
                          : <span className="text-slate-500">—</span>}
                        {rec.revenuePercentage !== undefined && (
                          <div className="text-[10px] text-slate-500 whitespace-nowrap">@ {rec.revenuePercentage}%</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {rec.leadVendor || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {rec.createdAt ? formatEasternTimeForDisplay(rec.createdAt, { includeTime: false }) : '—'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          {busy ? (
                            <RefreshCw size={14} className="animate-spin text-indigo-400" />
                          ) : (
                            <>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[rec.paymentStatus || '']}`}>
                                {STATUS_ICON[rec.paymentStatus || '']}
                                {rec.paymentStatus || 'Not Set'}
                              </span>
                              <select
                                value={rec.paymentStatus || ''}
                                onChange={(e) => handleFieldChange(rec, 'paymentStatus', e.target.value)}
                                className={cellSelectCls}
                              >
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt === '' ? 'Not Set' : opt}</option>
                                ))}
                              </select>
                            </>
                          )}
                          {rec.paymentStatusUpdatedAt && (
                            <span className="text-[10px] text-slate-600 whitespace-nowrap">{formatUtcDate(rec.paymentStatusUpdatedAt)}</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          value={rec.paymentType || ''}
                          onChange={(e) => handleFieldChange(rec, 'paymentType', e.target.value)}
                          disabled={busy}
                          className={`${cellSelectCls} min-w-[120px]`}
                        >
                          <option value="">Not Set</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Semi Monthly">Semi Monthly</option>
                        </select>
                      </td>

                      <td className="px-4 py-3">
                        <DraftDateInput
                          value={rec.draftDate1 ? rec.draftDate1.slice(0, 10) : ''}
                          disabled={busy}
                          onCommit={(v) => handleFieldChange(rec, 'draftDate1', v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <DraftDateInput
                          value={rec.draftDate2 ? rec.draftDate2.slice(0, 10) : ''}
                          disabled={busy}
                          onCommit={(v) => handleFieldChange(rec, 'draftDate2', v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg disabled:opacity-40 transition-colors text-sm">
            <ChevronLeft size={15} /> Prev
          </button>
          <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg disabled:opacity-40 transition-colors text-sm">
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
