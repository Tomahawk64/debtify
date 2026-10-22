import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, ArrowLeft, Users, List, RefreshCw,
  AlertTriangle, Clock, ChevronRight
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FLAG_BADGE = {
  green:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  yellow: 'bg-amber-100 text-amber-800 ring-amber-200',
  red:    'bg-red-100 text-red-800 ring-red-200'
};

function fmtDuration(seconds) {
  const n = parseFloat(seconds);
  if (!Number.isFinite(n)) return '—';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}m ${s}s`;
}

// ─────────────────────────────────────────────────────────────────
const VendorLeadAudit = () => {
  const [view, setView] = useState('stats'); // 'stats' | 'lists' | 'runs' | 'records'
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState([]);
  const [orgAvgSaleRate, setOrgAvgSaleRate] = useState(0);

  const [selectedVendor, setSelectedVendor] = useState(null);
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [selectedList, setSelectedList] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const [selectedRun, setSelectedRun] = useState(null);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [flagFilter, setFlagFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, pages: 0 });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/vendor-audit/stats');
      if (res.data?.success) {
        setStats(res.data.data || []);
        setOrgAvgSaleRate(res.data.orgAvgSaleRate || 0);
        setForbidden(false);
      }
    } catch (err) {
      if (err.response?.status === 403) setForbidden(true);
      else toast.error('Failed to load vendor audit stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const goToLists = async (vendor) => {
    setSelectedVendor(vendor);
    setView('lists');
    setListsLoading(true);
    try {
      const res = await axios.get(`/api/vendor-audit/vendors/${vendor.vendorId}/lists`);
      if (res.data?.success) setLists(res.data.data || []);
    } catch { toast.error('Failed to load lists'); }
    finally { setListsLoading(false); }
  };

  const goToRuns = async (list) => {
    setSelectedList(list);
    setView('runs');
    setRunsLoading(true);
    try {
      const res = await axios.get(
        `/api/vendor-audit/vendors/${selectedVendor.vendorId}/lists/${encodeURIComponent(list.listName)}/runs`
      );
      if (res.data?.success) setRuns(res.data.data || []);
    } catch { toast.error('Failed to load runs'); }
    finally { setRunsLoading(false); }
  };

  const goToRecords = async (run, page = 1, flag = flagFilter) => {
    setSelectedRun(run);
    setView('records');
    setRecordsLoading(true);
    try {
      const params = { page, limit: 100 };
      if (flag) params.flagFilter = flag;
      const res = await axios.get(`/api/vendor-audit/runs/${run.runBatchId}/records`, { params });
      if (res.data?.success) {
        setRecords(res.data.data || []);
        setPagination(prev => ({ ...prev, ...res.data.pagination }));
      }
    } catch { toast.error('Failed to load records'); }
    finally { setRecordsLoading(false); }
  };

  const goBack = () => {
    if (view === 'records') { setView('runs'); setSelectedRun(null); setFlagFilter(''); }
    else if (view === 'runs') { setView('lists'); setSelectedList(null); }
    else if (view === 'lists') { setView('stats'); setSelectedVendor(null); }
  };

  if (loading) return <LoadingSpinner message="Loading vendor lead audit…" />;

  if (forbidden) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md">
          <ShieldAlert size={40} className="mx-auto text-red-400 mb-4" />
          <h2 className="text-lg font-bold text-gray-800 mb-1">Access Restricted</h2>
          <p className="text-sm text-gray-500">
            This audit view is only available to the main organization admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 sm:p-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl shadow-lg">
            <ShieldAlert size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Vendor Lead Audit</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Long non-sale calls &amp; statistical anomaly detection — visible only to you
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'stats' && (
            <button onClick={goBack}
              className="px-3 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center gap-1.5 transition-all">
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {view === 'stats' && (
            <button onClick={fetchStats}
              className="px-4 py-2.5 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-xl flex items-center gap-2 transition-all">
              <RefreshCw size={14} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* ── VIEW: STATS ─────────────────────────────────────────── */}
      {view === 'stats' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Per-Vendor Statistical Anomaly Summary</h2>
              <p className="text-xs text-slate-500 mt-0.5">Org average sale rate: <span className="font-bold text-slate-700">{fmtPct(orgAvgSaleRate)}</span></p>
            </div>
          </div>

          {stats.length === 0 ? (
            <div className="p-16 text-center">
              <Users size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No vendor lead data yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Leads</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sales</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sale Rate</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">Duration Flags</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flags</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.map(v => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => goToLists(v)}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{v.vendorName}</p>
                        <p className="text-xs text-slate-400">{v.vendorEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{v.totalLeads.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{v.totalSales.toLocaleString()}</td>
                      <td className={`px-4 py-3 text-right text-sm font-bold ${v.saleRate < orgAvgSaleRate * 0.5 ? 'text-red-600' : 'text-slate-700'}`}>
                        {fmtPct(v.saleRate)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {v.durationFlags.green > 0 && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.green}`}>
                              <Clock size={10} /> {v.durationFlags.green}
                            </span>
                          )}
                          {v.durationFlags.yellow > 0 && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.yellow}`}>
                              <Clock size={10} /> {v.durationFlags.yellow}
                            </span>
                          )}
                          {v.durationFlags.red > 0 && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.red}`}>
                              <Clock size={10} /> {v.durationFlags.red}
                            </span>
                          )}
                          {v.durationFlags.green === 0 && v.durationFlags.yellow === 0 && v.durationFlags.red === 0 && (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {v.flags.length === 0 ? (
                          <span className="text-xs text-slate-300">No anomalies</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {v.flags.map(f => (
                              <span key={f.type} title={f.detail}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 ring-1 ring-red-200">
                                <AlertTriangle size={10} /> {f.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={16} className="text-slate-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: LISTS ─────────────────────────────────────────── */}
      {view === 'lists' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{selectedVendor?.vendorName}'s Lists</h2>
          {listsLoading ? (
            <div className="flex items-center justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
          ) : lists.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No lists found for this vendor.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {lists.map(l => (
                <button key={l.listName} onClick={() => goToRuns(l)}
                  className="text-left bg-slate-50 hover:bg-slate-100 rounded-xl p-4 transition-colors border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <List size={14} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-800 truncate">{l.listName}</span>
                  </div>
                  <p className="text-xs text-slate-500">{l.totalRuns} run{l.totalRuns !== 1 ? 's' : ''} · {l.totalLeads.toLocaleString()} leads</p>
                  <p className="text-xs text-slate-400 mt-1">Last run: {fmtDate(l.lastRunDate)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: RUNS ──────────────────────────────────────────── */}
      {view === 'runs' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-slate-800">{selectedList?.listName}</h2>
          </div>
          {runsLoading ? (
            <div className="flex items-center justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No runs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Run</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Uploaded By</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Leads</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sales</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">Duration Flags</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.map(r => (
                    <tr key={r.runBatchId} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => goToRecords(r)}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">Run #{r.runNumber}{r.runLabel ? ` — ${r.runLabel}` : ''}</p>
                        <p className="text-xs text-slate-400">{fmtDate(r.runDate)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.uploadedByName || '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{r.totalLeads.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{r.totalSales.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {r.durationFlags.green > 0 && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.green}`}>{r.durationFlags.green}</span>}
                          {r.durationFlags.yellow > 0 && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.yellow}`}>{r.durationFlags.yellow}</span>}
                          {r.durationFlags.red > 0 && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${FLAG_BADGE.red}`}>{r.durationFlags.red}</span>}
                          {r.durationFlags.green === 0 && r.durationFlags.yellow === 0 && r.durationFlags.red === 0 && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right"><ChevronRight size={16} className="text-slate-300" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: RECORDS ───────────────────────────────────────── */}
      {view === 'records' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-bold text-slate-800">
              Run #{selectedRun?.runNumber}{selectedRun?.runLabel ? ` — ${selectedRun.runLabel}` : ''}
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 mr-1">Filter:</span>
              {['', 'green', 'yellow', 'red'].map(f => (
                <button key={f || 'all'}
                  onClick={() => { setFlagFilter(f); goToRecords(selectedRun, 1, f); }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    flagFilter === f
                      ? (f ? FLAG_BADGE[f] + ' ring-1' : 'bg-slate-700 text-white')
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
                </button>
              ))}
            </div>
          </div>

          {recordsLoading ? (
            <div className="flex items-center justify-center py-10"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No records match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((rec, i) => (
                    <tr key={rec._id || i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-slate-700">
                        {[rec.first_name, rec.last_name].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-600 font-mono">{rec.phone_number || '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{rec.status || '—'}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600 text-right">{fmtDuration(rec.duration)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {rec.durationFlag ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${FLAG_BADGE[rec.durationFlag]}`}>
                            <Clock size={10} /> {rec.durationFlag}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 font-medium">
                Page <span className="font-bold text-gray-700">{pagination.page}</span> of <span className="font-bold text-gray-700">{pagination.pages}</span>
                {' '}— {pagination.total.toLocaleString()} total
              </p>
              <div className="flex items-center gap-2">
                <button disabled={pagination.page <= 1}
                  onClick={() => goToRecords(selectedRun, pagination.page - 1)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-gray-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-all">
                  Previous
                </button>
                <button disabled={pagination.page >= pagination.pages}
                  onClick={() => goToRecords(selectedRun, pagination.page + 1)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-gray-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-all">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VendorLeadAudit;
