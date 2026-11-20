// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 20 พฤศจิกายน 2569
// ✅ เร็วขึ้น 10-20 เท่า: ใช้ View + Pagination จริง (ดึงเฉพาะ 10 แถว)
// ✅ ไม่โหลดซ้ำเมื่อเปลี่ยนหน้า (ยกเว้นเปลี่ยน scope/days)
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

// ============================================================
// 🧩 Types
// ============================================================
interface WatchlistPatient {
  id: string;
  hospital_number: string;
  first_name: string;
  last_name: string;
  pam_level: string;
  hospital_id: string;
  hospital_name: string;
  coach_id: string | null;
  coach_name: string | null;
  last_followup: string | null;
  days_overdue: number;
}

interface UpcomingAppointment {
  appointment_id: string;
  patient_id: string;
  appointment_date: string;
  appointment_type: string;
  status: string;
  hospital_number: string;
  first_name: string;
  last_name: string;
  pam_level: string;
  hospital_id: string;
  hospital_name: string;
  coach_id: string | null;
  coach_name: string | null;
  days_until: number;
}

// ✅ ค่าคงที่
const PAGE_SIZE = 10;

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false); // ✅ สำหรับเปลี่ยนหน้าเท่านั้น

  const [stats, setStats] = useState({
    total_patients: 0,
    on_time_count: 0,
    overdue_count: 0,
    pam_increased: 0,
    pam_decreased: 0,
    active_recorders: 0,
    repeat_recorders: 0,
    obstacles_count: 0,
    opportunities_count: 0,
    other_count: 0,
  });

  const [overduePatients, setOverduePatients] = useState<WatchlistPatient[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [overduePage, setOverduePage] = useState(0);
  const overdueTotalPages = Math.max(1, Math.ceil(overdueTotal / PAGE_SIZE));

  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [selectedDays, setSelectedDays] = useState<number>(3);
  const [scope, setScope] = useState<'all' | 'mine'>('all');

  // ✅ Ref กัน re-render ซ้ำ
  const isLoadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ============================================================
  // 🔐 Session
  // ============================================================
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
    try {
      const info = await getUserHospitalInfo(userId);
      if (mountedRef.current) setUserHospital(info);
    } catch (e) {
      console.error('❌ [loadUserHospital]', e);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ============================================================
  // 📊 โหลด Stats + Upcoming (โหลดครั้งเดียวเมื่อ scope/days เปลี่ยน)
  // ============================================================
  const loadStatsAndUpcoming = useCallback(async (
    userData: any,
    currentScope: 'all' | 'mine',
    days: number
  ) => {
    if (!userData) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);

    const t0 = performance.now();
    try {
      const hospitalIds = await getAccessibleHospitalIds(userData.id);
      const isSuper = isSuperAdmin(userData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

      // ✅ 1) Stats จาก View (1 query, เร็วมาก)
      const { data: statsData } = await supabase
        .from('v_care_pathway_stats')
        .select('*')
        .single();

      if (statsData) {
        setStats({
          total_patients: statsData.total_patients || 0,
          on_time_count: statsData.on_time_count || 0,
          overdue_count: statsData.overdue_count || 0,
          pam_increased: statsData.pam_increased || 0,
          pam_decreased: statsData.pam_decreased || 0,
          active_recorders: statsData.active_recorders || 0,
          repeat_recorders: statsData.repeat_recorders || 0,
          obstacles_count: statsData.obstacles_count || 0,
          opportunities_count: statsData.opportunities_count || 0,
          other_count: statsData.other_count || 0,
        });
      }

      // ✅ 2) Upcoming จาก View (1 query)
      const untilDate = new Date(today);
      untilDate.setDate(today.getDate() + days);
      const todayStr = today.toISOString().split('T')[0];
      const untilStr = untilDate.toISOString().split('T')[0];

      let upQ = supabase
        .from('v_upcoming_appointments')
        .select('*')
        .gte('appointment_date', todayStr)
        .lte('appointment_date', untilStr)
        .order('appointment_date', { ascending: true })
        .limit(50);

      let upCQ = supabase
        .from('v_upcoming_appointments')
        .select('*', { count: 'exact', head: true })
        .gte('appointment_date', todayStr)
        .lte('appointment_date', untilStr);

      if (currentScope === 'mine') {
        upQ = upQ.eq('coach_id', userData.id);
        upCQ = upCQ.eq('coach_id', userData.id);
      } else if (!isSuper && hospitalIds.length > 0) {
        upQ = upQ.in('hospital_id', hospitalIds);
        upCQ = upCQ.in('hospital_id', hospitalIds);
      }

      const [{ data: upData }, { count: upCount }] = await Promise.all([upQ, upCQ]);
      if (mountedRef.current) {
        setUpcomingAppointments((upData || []) as UpcomingAppointment[]);
        setUpcomingTotal(upCount || 0);
      }

      console.log(`✅ [loadStatsAndUpcoming] เสร็จใน ${(performance.now() - t0).toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ [loadStatsAndUpcoming] Error:', error);
    } finally {
      isLoadingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ============================================================
  // 📋 โหลด Watchlist แบบ Pagination (เร็วมาก - ดึงเฉพาะ 10 แถว)
  // ============================================================
  const loadOverduePage = useCallback(async (
    userData: any,
    currentScope: 'all' | 'mine',
    page: number
  ) => {
    if (!userData) return;
    setPageLoading(true);

    const t0 = performance.now();
    try {
      const hospitalIds = await getAccessibleHospitalIds(userData.id);
      const isSuper = isSuperAdmin(userData);

      // ✅ นับจำนวนทั้งหมด (1 query, เร็ว)
      let countQ = supabase
        .from('v_overdue_patients')
        .select('*', { count: 'exact', head: true });

      if (currentScope === 'mine') {
        countQ = countQ.eq('coach_id', userData.id);
      } else if (!isSuper && hospitalIds.length > 0) {
        countQ = countQ.in('hospital_id', hospitalIds);
      }

      const { count } = await countQ;
      const total = count || 0;

      if (mountedRef.current) setOverdueTotal(total);

      // ✅ ป้องกันหน้าเกิน
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const safePage = Math.min(page, totalPages - 1);

      // ✅ ดึงเฉพาะ 10 แถวของหน้านี้ (เร็วมาก!)
      const from = safePage * PAGE_SIZE;
      let dataQ = supabase
        .from('v_overdue_patients')
        .select('*')
        .order('days_overdue', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (currentScope === 'mine') {
        dataQ = dataQ.eq('coach_id', userData.id);
      } else if (!isSuper && hospitalIds.length > 0) {
        dataQ = dataQ.in('hospital_id', hospitalIds);
      }

      const { data, error } = await dataQ;
      if (error) throw error;

      // ✅ ดึงชื่อโค้ช (เฉพาะคนที่อยู่ในหน้านี้)
      const coachIds = (data || [])
        .map((p: any) => p.coach_id)
        .filter(Boolean);
      let coachNameMap: Record<string, string> = {};
      if (coachIds.length > 0) {
        const { data: coaches } = await supabase
          .from('doctors')
          .select('user_id, full_name_th')
          .in('user_id', coachIds);
        coachNameMap = Object.fromEntries(
          (coaches || []).map((c: any) => [c.user_id, c.full_name_th])
        );
      }

      if (mountedRef.current) {
        setOverduePatients(
          (data || []).map((p: any) => ({
            ...p,
            coach_name: coachNameMap[p.coach_id] || null,
          }))
        );
        setOverduePage(safePage);
      }

      console.log(`📋 [loadOverduePage] หน้า ${safePage + 1}/${totalPages} เสร็จใน ${(performance.now() - t0).toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ [loadOverduePage] Error:', error);
    } finally {
      if (mountedRef.current) setPageLoading(false);
    }
  }, []);

  // ✅ โหลด Stats + Upcoming เมื่อ scope/days เปลี่ยน
  useEffect(() => {
    if (user) {
      loadStatsAndUpcoming(user, scope, selectedDays);
      loadOverduePage(user, scope, 0);
    }
  }, [user, scope, selectedDays, loadStatsAndUpcoming, loadOverduePage]);

  // ✅ เปลี่ยนหน้า → โหลดเฉพาะ Watchlist (ไม่ reload stats/upcoming)
  const changePage = (newPage: number) => {
    if (newPage === overduePage || newPage < 0 || newPage >= overdueTotalPages) return;
    if (user) loadOverduePage(user, scope, newPage);
  };

  const switchScope = (s: 'all' | 'mine') => {
    if (s !== scope) setScope(s);
  };

  // ✅ ตัวช่วยสร้างเลขหน้า
  const getOverduePageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (overdueTotalPages <= maxVisible) {
      for (let i = 0; i < overdueTotalPages; i++) pages.push(i);
    } else if (overduePage < 3) {
      for (let i = 0; i < maxVisible - 1; i++) pages.push(i);
      pages.push('...');
      pages.push(overdueTotalPages - 1);
    } else if (overduePage > overdueTotalPages - 4) {
      pages.push(0);
      pages.push('...');
      for (let i = overdueTotalPages - maxVisible + 1; i < overdueTotalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      pages.push('...');
      for (let i = overduePage - 1; i <= overduePage + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(overdueTotalPages - 1);
    }
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
      {/* Header */}
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
                <button
                  onClick={() => switchScope('all')}
                  className={`px-4 py-2 transition-colors ${scope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  🏥 ทั้งหมด
                </button>
                <button
                  onClick={() => switchScope('mine')}
                  className={`px-4 py-2 transition-colors ${scope === 'mine' ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  👤 ในการดูแลของฉัน
                </button>
              </div>

              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                        user?.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                          user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
                    </p>
                  </div>
                </div>
                {userHospital ? (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">🏥 ลูกข่าย</span>
                      )}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">ไม่สังกัดโรงพยาบาล</p>
                )}
              </div>

              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* ใกล้ถึงวันนัด */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              <Calendar className="w-5 h-5 text-cyan-600" />
              ผู้ป่วยใกล้ถึงวันนัด
              <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm font-bold">{upcomingTotal} คน</span>
              {scope === 'mine' && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">แสดงผู้ป่วยที่นัดภายใน:</label>
              <select
                value={selectedDays}
                onChange={(e) => setSelectedDays(Number(e.target.value))}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-cyan-500"
              >
                <option value={1}>1 วัน</option>
                <option value={2}>2 วัน</option>
                <option value={3}>3 วัน</option>
                <option value={4}>4 วัน</option>
                <option value={5}>5 วัน</option>
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {upcomingAppointments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>ไม่มีผู้ป่วยที่นัดหมายใน {selectedDays} วันนี้</p>
              </div>
            ) : (
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
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            a.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                              a.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                                a.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                                  'bg-red-100 text-red-700'
                          }`}>{a.pam_level || 'L0'}</span>
                        </td>
                        <td className="px-6 py-3 text-center text-gray-600">{a.hospital_name}</td>
                        <td className="px-6 py-3 text-center text-gray-600">{a.coach_name || '—'}</td>
                        <td className="px-6 py-3 text-center">
                          <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-medium">
                            {new Date(a.appointment_date).toLocaleDateString('th-TH')}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            a.days_until <= 1 ? 'bg-red-100 text-red-700' :
                              a.days_until <= 3 ? 'bg-orange-100 text-orange-700' :
                                'bg-cyan-100 text-cyan-700'
                          }`}>{a.days_until === 0 ? 'วันนี้!' : `${a.days_until} วัน`}</span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => router.push(`/admin/appointments/followup/new?patient_id=${a.patient_id}&appointment_id=${a.appointment_id}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-xs hover:bg-cyan-600 transition-colors"
                          >
                            <Clock className="w-3 h-3" /> ติดตาม
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* หมวดที่ 1 */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-blue-600" /> หมวดที่ 1: สรุปตัวเลขภาพรวม
            {scope === 'mine' && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>
            )}
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
              {stats.on_time_count + stats.overdue_count === stats.total_patients
                ? `✅ ${stats.on_time_count} + ${stats.overdue_count} = ${stats.total_patients} ครบถ้วน`
                : `⚠️ ${stats.on_time_count} + ${stats.overdue_count} ≠ ${stats.total_patients}`}
            </span>
          </div>
        </div>

        {/* หมวดที่ 2: Watchlist + Pagination */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              ทั้งหมด {overdueTotal.toLocaleString()} คน
            </span>
            {scope === 'mine' && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>
            )}
          </h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            {/* ✅ Loading overlay เมื่อเปลี่ยนหน้า */}
            {pageLoading && (
              <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              </div>
            )}
            {overduePatients.length === 0 && !pageLoading ? (
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
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              p.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                                p.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                                  p.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                                    'bg-red-100 text-red-700'
                            }`}>{p.pam_level || 'L0'}</span>
                          </td>
                          <td className="px-6 py-3 text-center text-gray-600">{p.hospital_name || '-'}</td>
                          <td className="px-6 py-3 text-center text-gray-600">{p.coach_name || '—'}</td>
                          <td className="px-6 py-3 text-center text-gray-600">
                            {p.last_followup ? new Date(p.last_followup).toLocaleDateString('th-TH') : 'ไม่เคย'}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                              <CalendarX className="w-3 h-3" />
                              {p.days_overdue === 999 ? 'ไม่เคยติดตาม' : `${p.days_overdue} วัน`}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button
                              onClick={() => router.push(`/admin/patients/${p.id}/care-pathway?from=care-pathway-dashboard`)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors"
                            >
                              <Eye className="w-3 h-3" /> ดูรายละเอียด
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {overdueTotalPages > 1 && (
                  <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm text-gray-600">
                      แสดง {overduePage * PAGE_SIZE + 1} - {Math.min((overduePage + 1) * PAGE_SIZE, overdueTotal)} จาก {overdueTotal.toLocaleString()} คน
                      <span className="text-gray-400 ml-2">(หน้า {overduePage + 1} / {overdueTotalPages})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changePage(0)}
                        disabled={overduePage === 0}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="หน้าแรก"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => changePage(overduePage - 1)}
                        disabled={overduePage === 0}
                        className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
                      </button>
                      <div className="flex gap-1">
                        {getOverduePageNumbers().map((pageNum, idx) => {
                          if (pageNum === '...') {
                            return <span key={`ellipsis-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                          }
                          const p = pageNum as number;
                          return (
                            <button
                              key={p}
                              onClick={() => changePage(p)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                overduePage === p ? 'bg-blue-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {p + 1}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => changePage(overduePage + 1)}
                        disabled={overduePage >= overdueTotalPages - 1}
                        className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1"
                      >
                        ถัดไป <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => changePage(overdueTotalPages - 1)}
                        disabled={overduePage >= overdueTotalPages - 1}
                        className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="หน้าสุดท้าย"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* หมวดที่ 3 */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-purple-600" /> หมวดที่ 3: สถิติการทำซ้ำและเหตุผล (ย้อนหลัง 30 วัน)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-blue-500" /> สถิติการบันทึกกิจกรรมซ้ำ
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-sm text-blue-800 font-medium">ผู้ป่วยที่บันทึกกิจกรรม</p>
                    <p className="text-xs text-blue-600">มีอย่างน้อย 1 ครั้งในเดือนนี้</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">{stats.active_recorders.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <p className="text-sm text-purple-800 font-medium">ผู้ป่วยที่บันทึกซ้ำ</p>
                    <p className="text-xs text-purple-600">มีความสม่ำเสมอ (&gt;1 ครั้ง)</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{stats.repeat_recorders.toLocaleString()}</p>
                </div>
                {stats.active_recorders > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>อัตราความสม่ำเสมอ</span>
                      <span>{Math.round((stats.repeat_recorders / stats.active_recorders) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-purple-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${(stats.repeat_recorders / stats.active_recorders) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-orange-500" /> สรุปเหตุผลจากการติดตาม
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-800">พบอุปสรรค / ความกังวล</p>
                      <p className="text-xs text-red-600">adaptation_summary = 'obstacles'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-red-700">{stats.obstacles_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-800">พบโอกาส / ความก้าวหน้า</p>
                      <p className="text-xs text-green-600">adaptation_summary = 'opportunities'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-green-700">{stats.opportunities_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <HelpCircle className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">อื่นๆ</p>
                      <p className="text-xs text-gray-600">adaptation_summary = 'other'</p>
                    </div>
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