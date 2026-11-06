import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CreditCard, Search, RefreshCw, ChevronLeft, ChevronRight,
  Calendar, TrendingUp, Users
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { formatEasternTimeForDisplay } from '../utils/dateUtils';

// READ-ONLY payment status view for Multi Vendor Admins. The main org admin sets
// the values (Payment Status page → Multi Vendors tab). There is intentionally no
// download/export here.

const LIMIT = 50;

const STATUS_COLORS = {
  'Cleared':      'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Pending':      'bg-yellow-100 text-yellow-700 border border-yellow-200',
  'NSF':          'bg-rose-100 text-rose-700 border border-rose-200',
  'Cancellation': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Refunded':     'bg-purple-100 text-purple-700 border border-purple-200',
};

const STATUS_META = {
  'Cleared':      { label: 'Cleared',      bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  'Pending':      { label: 'Pending',      bg: 'bg-yellow-50',  border: 'border-yellow-200',  badge: 'bg-yellow-100 text-yellow-700',   dot: 'bg-yellow-400' },
  'NSF':          { label: 'NSF',          bg: 'bg-rose-50',    border: 'border-rose-200',    badge: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500' },
  'Cancellation': { label: 'Cancellation', bg: 'bg-orange-50',  border: 'border-orange-200',  badge: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500' },
  'Refunded':     { label: 'Refunded',     bg: 'bg-purple-50',  border: 'border-purple-200',  badge: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500' },
  '':             { label: 'Not Set',      bg: 'bg-slate-50',   border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
};
const STATUS_ORDER = ['Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded', ''];

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Draft dates / status-updated dates are date-only values stored at UTC midnight.
const formatUtcDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

const inputCls = 'border border-slate-200 text-sm rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400';
const labelCls = 'text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1';

const MultiVendorPaymentStatus = () => {
  const { user } = useAuth();

  const [subVendors, setSubVendors] = useState([]);
  const [vendor, setVendor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalEnrolledDebt, setTotalEnrolledDebt] = useState(0);
  const [statusBreakdown, setStatusBreakdown] = useState({});
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    axios.get('/api/multivendor/sub-vendors')
      .then((res) => { if (res.data?.success) setSubVendors(res.data.data || []); })
      .catch(() => {});
  }, []);

  const fetchRecords = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (vendor)                 params.vendor = vendor;
      if (search)                 params.search = search;
      if (startDate)              params.startDate = startDate;
      if (endDate)                params.endDate = endDate;
      if (paymentFilter !== '')   params.paymentStatusFilter = paymentFilter;

      const res = await axios.get('/api/multivendor/payment-status/sales', { params });
      if (myReq !== reqId.current) return; // a newer request superseded this one
      setRecords(res.data.data || []);
      setTotal(res.data.total || 0);
      setTotalEnrolledDebt(res.data.totalEnrolledDebt || 0);
      setStatusBreakdown(res.data.statusBreakdown || {});
    } catch (err) {
      if (myReq !== reqId.current) return;
      setRecords([]); setTotal(0); setTotalEnrolledDebt(0); setStatusBreakdown({});
      toast.error(err.response?.data?.message || 'Failed to load payment status records');
    } finally {
      if (myReq === reqId.current) setLoading(false);
    }
  }, [page, vendor, search, startDate, endDate, paymentFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const clearFilters = () => {
    setVendor(''); setStartDate(''); setEndDate(''); setPaymentFilter('');
    setSearchInput(''); setSearch(''); setPage(1);
  };

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); };

  const totalPages = Math.ceil(total / LIMIT);
  const activeStatuses = STATUS_ORDER.filter((s) => statusBreakdown[s]?.count > 0);
  const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}>
        <div className="absolute -top-16 -right-16 rounded-full opacity-10" style={{ width: 260, height: 260, background: '#06b6d4' }} />
        <div className="relative px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="rounded-xl p-2 flex-shrink-0" style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
              <img src="/debtify-logo.svg" alt="Debtify" style={{ height: 52, width: 'auto', filter: 'brightness(1.05)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Payment Status</h1>
              <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
                {subVendors.length > 0 ? subVendors.join(', ') : 'Your assigned lead vendors'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                <span className="font-semibold" style={{ color: '#67e8f9' }}>{total.toLocaleString()}</span> SALE records
                {user?.name && <>&nbsp;·&nbsp;Logged in as&nbsp;<span className="font-medium" style={{ color: '#cbd5e1' }}>{user.name}</span></>}
              </p>
            </div>
          </div>
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors self-start sm:self-auto"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className={labelCls}><Calendar size={11} /> Draft Date From</label>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Draft Date To</label>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={inputCls} />
            </div>
            {subVendors.length > 1 && (
              <div className="flex flex-col gap-1 min-w-[160px]">
                <label className={labelCls}><Users size={11} /> Sub Vendor</label>
                <select value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }} className={inputCls}>
                  <option value="">All ({subVendors.length})</option>
                  {subVendors.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className={labelCls}><CreditCard size={11} /> Payment Status</label>
              <select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }} className={inputCls}>
                <option value="">All Statuses</option>
                <option value="not_set">Not Set</option>
                <option value="Cleared">Cleared</option>
                <option value="Pending">Pending</option>
                <option value="NSF">NSF</option>
                <option value="Cancellation">Cancellation</option>
                <option value="Refunded">Refunded</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className={labelCls}><Search size={11} /> Search</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name, phone, lead ID, status…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
                  className={`flex-1 ${inputCls} placeholder-slate-400`}
                />
                <button onClick={applySearch}
                  className="px-5 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                  style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>
                  Go
                </button>
              </div>
            </div>
            <button onClick={clearFilters}
              className="px-5 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors self-end">
              Clear
            </button>
          </div>
        </div>

        {/* Summary */}
        {!loading && total > 0 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 max-w-md">
              <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow">
                <TrendingUp size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Enrolled Debt</p>
                <p className="text-xl font-extrabold text-slate-900">{money(totalEnrolledDebt)}</p>
                <p className="text-xs text-slate-400">{total} SALE records</p>
              </div>
            </div>

            {activeStatuses.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Revenue by Payment Status</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {activeStatuses.map((s) => {
                    const meta = STATUS_META[s];
                    const { count, revenue } = statusBreakdown[s];
                    return (
                      <div key={s || 'not_set'} className={`rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
                        </div>
                        <p className="text-base font-extrabold text-slate-800 leading-tight">{money(revenue)}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{count} lead{count !== 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats bar + top pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 font-medium">
            {loading ? 'Loading…' : (
              <>Showing <span className="font-bold text-slate-700">{records.length}</span> of <span className="font-bold text-slate-700">{total}</span> SALE records</>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-40 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-slate-500 font-medium">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-40 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3">
              <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#06b6d4 transparent #06b6d4 #06b6d4' }} />
              <p className="text-sm text-slate-400 font-medium">Loading…</p>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-2">
              <CreditCard size={40} className="text-slate-300" />
              <p className="text-base font-semibold text-slate-500">No SALE records found</p>
              <p className="text-sm text-slate-400">
                {startDate || endDate || vendor || search || paymentFilter ? 'Try adjusting your filters' : 'No sales tagged to your vendors yet'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: '#0f172a' }}>
                    {['Lead', 'Phone', 'Enrolled Debt', 'Revenue', 'Lead Vendor', 'Created At', 'Payment Status', 'Payment Type', 'Draft Date 1', 'Draft Date 2'].map((h) => (
                      <th key={h} className={th} style={{ color: '#94a3b8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, idx) => (
                    <tr key={rec._id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }} className="hover:bg-cyan-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{rec.name || '—'}</div>
                        {rec.leadId && <div className="text-[10px] text-slate-400 font-mono">{rec.leadId}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-slate-600 text-xs">{rec.phone || '—'}</span></td>
                      <td className="px-4 py-3">
                        {rec.enrolledDebt > 0
                          ? <span className="text-emerald-600 font-bold text-xs">${Number(rec.enrolledDebt).toLocaleString()}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {rec.revenue > 0
                          ? <span className="text-violet-600 font-bold text-xs">{money(rec.revenue)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-50 text-cyan-700">{rec.leadVendor || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {rec.createdAt ? formatEasternTimeForDisplay(rec.createdAt, { includeTime: false }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[rec.paymentStatus] || 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                          {rec.paymentStatus || 'Not Set'}
                        </span>
                        {rec.paymentStatusUpdatedAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{formatUtcDate(rec.paymentStatusUpdatedAt)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rec.paymentType
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{rec.paymentType}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatUtcDate(rec.draftDate1)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatUtcDate(rec.draftDate2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl disabled:opacity-40 transition-colors text-sm font-medium">
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl disabled:opacity-40 transition-colors text-sm font-medium">
              Next <ChevronRight size={15} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2 pb-4 opacity-40">
          <img src="/debtify-logo.svg" alt="Debtify" style={{ height: 18, width: 'auto' }} />
          <span className="text-xs text-slate-400 font-medium tracking-widest uppercase">Vendor Portal</span>
        </div>
      </div>
    </div>
  );
};

export default MultiVendorPaymentStatus;
