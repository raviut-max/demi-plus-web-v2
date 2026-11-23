// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 23 พฤศจิกายน 2569 — แก้ syntax error ทั้งหมด
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  getAccessibleHospitalIds,
  isSuperAdmin,
  getUserHospitalInfo,
  logout,
} from '@/lib/supabase/queries';
import {
  Users, CalendarCheck, CalendarX, TrendingUp, TrendingDown,
  AlertTriangle, Repeat, HelpCircle, ArrowRight, Loader2, Eye,
  UserCheck, Hospital, Building2, LogOut, Calendar, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarPlus,
} from 'lucide-react';

interface WatchlistPatient {
  id: string; hospital_number: string; first_name: string; last_name: string;
  pam_level: string; hospital_id: string; hospital_name: string;
  coach_id: string | null; coach_name: string | null;
  last_followup: string | null; days_overdue: number; next_appointment: string | null;
}
interface UpcomingAppointment {
  appointment_id: string; patient_id: string; appointment_date: string;
  appointment_type: string; status: string; hospital_number: string;
  first_name: string; last_name: string; pam_level: string;
  hospital_id: string; hospital_name: string;
  coach_id: string | null; coach_name: string | null; days_until: number;
}

const PAGE_SIZE = 10;

function applyScope(query: any, userData: any, currentScope: 'all' | 'mine', hIds: string[], isSuper: boolean) {
  if (currentScope === 'mine') return query.eq('coach_id', userData.id);
  if (!isSuper && hIds.length > 0) return query.in('hospital_id', hIds);
  return query;
}

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [stats, setStats] = useState({
    total_patients: 0, on_time_count: 0, overdue_count: 0,
    pam_increased: 0, pam_decreased: 0,
    active_recorders: 0, repeat_recorders: 0,
    obstacles_count: 0, opportunities_count: 0, other_count: 0,
  });
  const [overduePatients, setOverduePatients] = useState<WatchlistPatient[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [overduePage, setOverduePage] = useState(0);
  const overdueTotalPages = Math.max(1, Math.ceil(overdueTotal / PAGE_SIZE));
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingTotal / PAGE_SIZE));
  const [selectedDays, setSelectedDays] = useState<number>(3);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [hospitalIds, setHospitalIds] = useState<string[]>([]);
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    const initialScope = ['doctor', 'helper', 'osm'].includes(userData.role) ? 'mine' : 'all';
    setScope(initialScope);
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try { const info = await getUserHospitalInfo(userId); setUserHospital(info); }
    catch (e) { console.error('❌ [loadUserHospital]', e); }
  };

  const handleLogout = () => { logout(); router.push('/admin/login'); };

  const loadStatsAndCounts = useCallback(async (userData: any, currentScope: 'all' | 'mine', hIds: string[], superFlag: boolean) => {
    const [statsRes, totalRes, overdueRes] = await Promise.all([
      supabase.from('v_care_pathway_stats').select('*').single(),
      applyScope(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true), userData, currentScope, hIds, superFlag),
      applyScope(supabase.from('v_overdue_patients').select('*', { count: 'exact', head: true }), userData, currentScope, hIds, superFlag),
    ]);
    const total = totalRes.count || 0;
    const overdue = overdueRes.count || 0;
    const v = statsRes.data || {};
    setStats({
      total_patients: total, on_time_count: Math.max(0, total - overdue), overdue_count: overdue,
      pam_increased: v.pam_increased || 0, pam_decreased: v.pam_decreased || 0,
      active_recorders: v.active_recorders || 0, repeat_recorders: v.repeat_recorders || 0,
      obstacles_count: v.obstacles_count || 0, opportunities_count: v.opportunities_count || 0, other_count: v.other_count || 0,
    });
  }, []);

  const loadOverduePage = useCallback(async (userData: any, currentScope: 'all' | 'mine', hIds: string[], superFlag: boolean, page: number) => {
    setOverdueLoading(true);
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const [countRes, dataRes] = await Promise.all([
        applyScope(supabase.from('v_overdue_patients').select('*', { count: 'exact', head: true }), userData, currentScope, hIds, superFlag),
        applyScope(supabase.from('v_overdue_patients').select('*').order('days_overdue', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1), userData, currentScope, hIds, superFlag),
      ]);
      if (dataRes.error) throw dataRes.error;
      const rows = dataRes.data || [];
      const coachIds = [...new Set(rows.map((p: any) => p.coach_id).filter(Boolean))] as string[];
      let coachNameMap: Record<string, string> = {};
      if (coachIds.length > 0) {
        const { data: coaches } = await supabase.from('doctors').select('user_id, full_name_th').in('user_id', coachIds);
        coachNameMap = Object.fromEntries((coaches || []).map((c: any) => [c.user_id, c.full_name_th]));
      }
      const patientIds = rows.map((p: any) => p.id);
      let nextMap: Record<string, string> = {};
      if (patientIds.length > 0) {
        const { data: appts } = await supabase.from('appointments').select('user_id, appointment_date').in('user_id', patientIds).eq('status', 'scheduled').gte('appointment_date', todayStr).order('appointment_date', { ascending: true });
        (appts || []).forEach((a: any) => { if (!nextMap[a.user_id]) nextMap[a.user_id] = a.appointment_date; });
      }
      setOverduePatients(rows.map((p: any) => ({ ...p, coach_name: coachNameMap[p.coach_id] || null, next_appointment: nextMap[p.id] || null })));
      setOverdueTotal(countRes.count || 0);
      setOverduePage(page);
    } catch (e) { console.error('❌ [loadOverduePage]', e); }
    finally { setOverdueLoading(false); }
  }, []);

  const loadUpcomingPage = useCallback(async (userData: any, currentScope: 'all' | 'mine', hIds: string[], superFlag: boolean, page: number, days: number) => {
    setUpcomingLoading(true);
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const until = new Date(today); until.setDate(today.getDate() + days);
      const todayStr = today.toISOString().split('T')[0];
      const untilStr = until.toISOString().split('T')[0];
      const [countRes, dataRes] = await Promise.all([
        applyScope(supabase.from('v_upcoming_appointments').select('*', { count: 'exact', head: true }).gte('appointment_date', todayStr).lte('appointment_date', untilStr), userData, currentScope, hIds, superFlag),
        applyScope(supabase.from('v_upcoming_appointments').select('*').gte('appointment_date', todayStr).lte('appointment_date', untilStr).order('days_until', { ascending: true }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1), userData, currentScope, hIds, superFlag),
      ]);
      if (dataRes.error) throw dataRes.error;
      setUpcomingAppointments((dataRes.data || []) as UpcomingAppointment[]);
      setUpcomingTotal(countRes.count || 0);
      setUpcomingPage(page);
    } catch (e) { console.error('❌ [loadUpcomingPage]', e); }
    finally { setUpcomingLoading(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const hIds = await getAccessibleHospitalIds(user.id);
        const s = isSuperAdmin(user);
        setHospitalIds(hIds);
        setIsSuper(s);
        await loadStatsAndCounts(user, scope, hIds, s);
        await Promise.all([loadOverduePage(user, scope, hIds, s, 0), loadUpcomingPage(user, scope, hIds, s, 0, selectedDays)]);
      } catch (e) { console.error('❌ [CarePathwayDashboard]', e); }
      finally { setLoading(false); }
    })();
  }, [user, scope, selectedDays]);

  const changeOverduePage = (p: number) => {
    if (!user || p < 0 || p >= overdueTotalPages || p === overduePage) return;
    loadOverduePage(user, scope, hospitalIds, isSuper, p);
  };
  const changeUpcomingPage = (p: number) => {
    if (!user || p < 0 || p >= upcomingTotalPages || p === upcomingPage) return;
    loadUpcomingPage(user, scope, hospitalIds, isSuper, p, selectedDays);
  };
  const switchScope = (s: 'all' | 'mine') => { if (s !== scope) setScope(s); };

  const getPageNumbers = (totalPages: number, currentPage: number) => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 0; i < totalPages; i++) pages.push(i); }
    else if (currentPage < 3) { for (let i = 0; i < maxVisible - 1; i++) pages.push(i); pages.push('...'); pages.push(totalPages - 1); }
    else if (currentPage > totalPages - 4) { pages.push(0); pages.push('...'); for (let i = totalPages - maxVisible + 1; i < totalPages; i++) pages.push(i); }
    else { pages.push(0); pages.push('...'); for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i); pages.push('...'); pages.push(totalPages - 1); }
    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูลภาพรวม...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowRight className="w-4 h-4 rotate-180" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">📊 ภาพรวม Care Pathway Dashboard</h1>
              <p className="text-sm text-gray-500">สรุปผลการดูแลผู้ป่วยตามเส้นทางสุขภาพ (ข้อมูลย้อนหลัง 30 วัน)</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium bg-white">
                <button onClick={() => switchScope('all')} className={`px-4 py-2 transition-colors ${scope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>🏥 ทั้งหมด</button>
                <button onClick={() => switchScope('mine')} className={`px-4 py-2 transition-colors ${scope === 'mine' ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>👤 ในการดูแลของฉัน</button>
              </div>
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><UserCheck className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">{user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}</p>
                  </div>
                </div>
                {userHospital ? (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span> : <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">🏥 ลูกข่าย</span>}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : <p className="text-xs text-gray-400 mt-2">ไม่สังกัดโรงพยาบาล</p>}
              </div>
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              <Calendar className="w-5 h-5 text-cyan-600" />
              ผู้ป่วยใกล้ถึงวันนัด
              <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm font-bold">{upcomingTotal} คน</span>
              {scope === 'mine' && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>}
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">แสดงผู้ป่วยที่นัดภายใน:</label>
              <select value={selectedDays} onChange={(e) => { setSelectedDays(Number(e.target.value)); setUpcomingPage(0); }} className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-cyan-500">
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} วัน</option>)}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            {upcomingLoading && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>}
            {upcomingAppointments.length === 0 && !upcomingLoading ? (
              <div className="p-8 text-center text-gray-500">
                <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>ไม่มีผู้ป่วยที่นัดหมายใน {selectedDays} วันนี้</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">HN</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">PAM</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">โรงพยาบาล</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">โค้ช</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">วันนัด</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">เหลือ</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {upcomingAppointments.map((a) => (
                        <tr key={a.appointment_id} className="hover:bg-cyan-50/50 transition-colors">
                          <td className="px-6 py-3 font-mono text-gray-600">{a.hospital_number}</td>
                          <td className="px-6 py-3 font-medium text-gray-800">{a.first_name} {a.last_name}</td>
                          <td className="px-6 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${a.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' : a.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' : a.pam_level === 'L2' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.pam_level || 'L0'}</span>
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600">{a.hospital_name}</td>
                          <td className="px-6 py-3 text-center text-gray-600">{a.coach_name || '—'}</td>
                          <td className="px-6 py-3 text-center"><span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-medium">{new Date(a.appointment_date).toLocaleDateString('th-TH')}</span></td>
                          <td className="px-6 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${a.days_until <= 1 ? 'bg-red-100 text-red-700' : a.days_until <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'}`}>{a.days_until === 0 ? 'วันนี้!' : `${a.days_until} วัน`}</span></td>
                          <td className="px-6 py-3 text-center">
                            <button onClick={() => router.push(`/admin/appointments/followup/new?patient_id=${a.patient_id}&appointment_id=${a.appointment_id}`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-xs hover:bg-cyan-600 transition-colors">
                              <Clock className="w-3 h-3" /> ติดตาม
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {upcomingTotalPages > 1 && (
                  <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm text-gray-600">แสดง {upcomingPage * PAGE_SIZE + 1} - {Math.min((upcomingPage + 1) * PAGE_SIZE, upcomingTotal)} จาก {upcomingTotal.toLocaleString()} คน <span className="text-gray-400 ml-2">(หน้า {upcomingPage + 1} / {upcomingTotalPages})</span></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeUpcomingPage(0)} disabled={upcomingPage === 0} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าแรก"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => changeUpcomingPage(upcomingPage - 1)} disabled={upcomingPage === 0} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> ก่อนหน้า</button>
                      <div className="flex gap-1">
                        {getPageNumbers(upcomingTotalPages, upcomingPage).map((pageNum, idx) => {
                          if (pageNum === '...') return <span key={`u-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                          const p = pageNum as number;
                          return <button key={p} onClick={() => changeUpcomingPage(p)} className={`px-3 py-2 rounded-lg text-sm font-medium ${upcomingPage === p ? 'bg-cyan-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}>{p + 1}</button>;
                        })}
                      </div>
                      <button onClick={() => changeUpcomingPage(upcomingPage + 1)} disabled={upcomingPage >= upcomingTotalPages - 1} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1">ถัดไป <ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => changeUpcomingPage(upcomingTotalPages - 1)} disabled={upcomingPage >= upcomingTotalPages - 1} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าสุดท้าย"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-blue-600" /> หมวดที่ 1: สรุปตัวเลขภาพรวม
            {scope === 'mine' && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">ผู้ป่วยในระบบ</p><p className="text-2xl font-bold text-gray-800">{stats.total_patients.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><CalendarCheck className="w-6 h-6 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">มาตามนัด (≤30 วัน)</p><p className="text-2xl font-bold text-green-600">{stats.on_time_count.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><CalendarX className="w-6 h-6 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">เลยกำหนด (&gt;30 วัน)</p><p className="text-2xl font-bold text-red-600">{stats.overdue_count.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
              <div><p className="text-sm text-gray-500">PAM เพิ่มขึ้น (เดือนนี้)</p><p className="text-2xl font-bold text-emerald-600">{stats.pam_increased.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center"><TrendingDown className="w-6 h-6 text-rose-600" /></div>
              <div><p className="text-sm text-gray-500">PAM ลดลง (เดือนนี้)</p><p className="text-2xl font-bold text-rose-600">{stats.pam_decreased.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            <span>ตรวจสอบยอดรวม:</span>
            <span className={`font-bold ${stats.on_time_count + stats.overdue_count === stats.total_patients ? 'text-green-600' : 'text-amber-600'}`}>
              {stats.on_time_count + stats.overdue_count === stats.total_patients ? `✅ ${stats.on_time_count} + ${stats.overdue_count} = ${stats.total_patients} ครบถ้วน` : `⚠️ ${stats.on_time_count} + ${stats.overdue_count} ≠ ${stats.total_patients}`}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">ทั้งหมด {overdueTotal.toLocaleString()} คน</span>
            {scope === 'mine' && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>}
          </h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            {overdueLoading && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>}
            {overduePatients.length === 0 && !overdueLoading ? (
              <div className="p-8 text-center text-gray-500">
                <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p>ยอดเยี่ยม! ไม่มีผู้ป่วยที่เลยกำหนดการติดตาม</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">HN</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">PAM Level</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">โรงพยาบาล</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">โค้ชผู้ดูแล</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">วันนัดถัดไป</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">ติดตามล่าสุด</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">เลยกำหนด</th>
                        <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overduePatients.map((p) => (
                        <tr key={p.id} className="hover:bg-red-50/50 transition-colors">
                          <td className="px-6 py-3 font-mono text-gray-600">{p.hospital_number}</td>
                          <td className="px-6 py-3 font-medium text-gray-800">{p.first_name} {p.last_name}</td>
                          <td className="px-6 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${p.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' : p.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' : p.pam_level === 'L2' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.pam_level || 'L0'}</span>
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600">{p.hospital_name || '-'}</td>
                          <td className="px-6 py-3 text-center text-gray-600">{p.coach_name || '—'}</td>
                          <td className="px-6 py-3 text-center">
                            {p.next_appointment ? <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">{new Date(p.next_appointment).toLocaleDateString('th-TH')}</span> : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600">{p.last_followup ? new Date(p.last_followup).toLocaleDateString('th-TH') : 'ไม่เคย'}</td>
                          <td className="px-6 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                              <CalendarX className="w-3 h-3" />
                              {p.days_overdue === 999 ? 'ไม่เคยติดตาม' : `${p.days_overdue} วัน`}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => router.push(`/admin/patients/${p.id}/care-pathway?from=care-pathway-dashboard`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors">
                                <Eye className="w-3 h-3" /> ดูรายละเอียด
                              </button>
                              <button onClick={() => router.push(`/admin/appointments/new?patient_id=${p.id}&coach_id=${p.coach_id || ''}&from=care-pathway-dashboard`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs hover:bg-emerald-600 transition-colors">
                                <CalendarPlus className="w-3 h-3" /> สร้างนัดหมายใหม่
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {overdueTotalPages > 1 && (
                  <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm text-gray-600">แสดง {overduePage * PAGE_SIZE + 1} - {Math.min((overduePage + 1) * PAGE_SIZE, overdueTotal)} จาก {overdueTotal.toLocaleString()} คน <span className="text-gray-400 ml-2">(หน้า {overduePage + 1} / {overdueTotalPages})</span></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeOverduePage(0)} disabled={overduePage === 0} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าแรก"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => changeOverduePage(overduePage - 1)} disabled={overduePage === 0} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> ก่อนหน้า</button>
                      <div className="flex gap-1">
                        {getPageNumbers(overdueTotalPages, overduePage).map((pageNum, idx) => {
                          if (pageNum === '...') return <span key={`o-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                          const p = pageNum as number;
                          return <button key={p} onClick={() => changeOverduePage(p)} className={`px-3 py-2 rounded-lg text-sm font-medium ${overduePage === p ? 'bg-red-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}>{p + 1}</button>;
                        })}
                      </div>
                      <button onClick={() => changeOverduePage(overduePage + 1)} disabled={overduePage >= overdueTotalPages - 1} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1">ถัดไป <ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => changeOverduePage(overdueTotalPages - 1)} disabled={overduePage >= overdueTotalPages - 1} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าสุดท้าย"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-purple-600" /> หมวดที่ 3: สถิติการทำซ้ำและเหตุผล (ย้อนหลัง 30 วัน)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2"><Repeat className="w-4 h-4 text-blue-500" /> สถิติการบันทึกกิจกรรมซ้ำ</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div><p className="text-sm text-blue-800 font-medium">ผู้ป่วยที่บันทึกกิจกรรม</p><p className="text-xs text-blue-600">มีอย่างน้อย 1 ครั้งในเดือนนี้</p></div>
                  <p className="text-3xl font-bold text-blue-700">{stats.active_recorders.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div><p className="text-sm text-purple-800 font-medium">ผู้ป่วยที่บันทึกซ้ำ</p><p className="text-xs text-purple-600">มีความสม่ำเสมอ (&gt;1 ครั้ง)</p></div>
                  <p className="text-3xl font-bold text-purple-700">{stats.repeat_recorders.toLocaleString()}</p>
                </div>
                {stats.active_recorders > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1"><span>อัตราความสม่ำเสมอ</span><span>{Math.round((stats.repeat_recorders / stats.active_recorders) * 100)}%</span></div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-purple-500 h-2.5 rounded-full transition-all" style={{ width: `${(stats.repeat_recorders / stats.active_recorders) * 100}%` }}></div></div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-orange-500" /> สรุปเหตุผลจากการติดตาม</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
                    <div><p className="text-sm font-semibold text-red-800">พบอุปสรรค / ความกังวล</p><p className="text-xs text-red-600">adaptation_summary = 'obstacles'</p></div>
                  </div>
                  <span className="text-xl font-bold text-red-700">{stats.obstacles_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><TrendingUp className="w-4 h-4 text-green-600" /></div>
                    <div><p className="text-sm font-semibold text-green-800">พบโอกาส / ความก้าวหน้า</p><p className="text-xs text-green-600">adaptation_summary = 'opportunities'</p></div>
                  </div>
                  <span className="text-xl font-bold text-green-700">{stats.opportunities_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><HelpCircle className="w-4 h-4 text-gray-600" /></div>
                    <div><p className="text-sm font-semibold text-gray-800">อื่นๆ</p><p className="text-xs text-gray-600">adaptation_summary = 'other'</p></div>
                  </div>
                  <span className="text-xl font-bold text-gray-700">{stats.other_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}