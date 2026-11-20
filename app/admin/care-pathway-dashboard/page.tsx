// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 20 พฤศจิกายน 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่มระบบกรองสำหรับ Admin (เลือก รพ. + เลือกโค้ช)
//    2. ✅ Doctor/Helper/OSM แสดงข้อมูลตัวเองทันที
//    3. ✅ ข้อความเมื่อไม่มีข้อมูลชัดเจน 3 กรณี
//    4. ✅ Badge แสดงจำนวนตาม filter จริง
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  getAccessibleHospitalIds,
  isSuperAdmin,
  isHospitalAdmin,
  getUserHospitalInfo,
  logout,
} from '@/lib/supabase/queries';
import {
  Users, CalendarCheck, CalendarX, TrendingUp, TrendingDown,
  AlertTriangle, Repeat, HelpCircle, ArrowRight, Loader2, Eye,
  UserCheck, Hospital, Building2, LogOut, Calendar, Clock,
  Filter, User,
} from 'lucide-react';

// ============================================================
// 🧰 Types
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

interface FilterOption {
  id: string;
  name: string;
  hospital_name?: string;
}

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ✅ State สำหรับ Admin filter
  const [isAdminView, setIsAdminView] = useState(false); // true = admin, false = staff
  const [filterHospitalId, setFilterHospitalId] = useState<string>('all');
  const [filterCoachId, setFilterCoachId] = useState<string>('all');
  const [hospitalOptions, setHospitalOptions] = useState<FilterOption[]>([]);
  const [coachOptions, setCoachOptions] = useState<FilterOption[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total_patients: 0,
    on_time_count: 0,
    overdue_count: 0,
    pam_increased: 0,
    pam_decreased: 0,
  });

  // Watchlist
  const [overduePatients, setOverduePatients] = useState<WatchlistPatient[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [emptyReason, setEmptyReason] = useState<'none' | 'no_coach' | 'no_data'>('none');

  // Upcoming
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [selectedDays, setSelectedDays] = useState<number>(3);

  // Repeat stats
  const [repeatStats, setRepeatStats] = useState({
    active_recorders: 0,
    repeat_recorders: 0,
    obstacles_count: 0,
    opportunities_count: 0,
    other_count: 0,
  });

  // ============================================================
  // 🔐 Session + Role
  // ============================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);

    // ✅ Admin (super/hospital) → โหมดเลือก filter
    // ✅ Staff (doctor/helper/osm) → โหมดดูของตัวเอง
    const admin = isSuperAdmin(userData) || isHospitalAdmin(userData);
    setIsAdminView(admin);

    if (!admin) {
      // Staff → ตั้งค่า filter เป็นตัวเองทันที
      setFilterCoachId(userData.id);
    }
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const info = await getUserHospitalInfo(userId);
      setUserHospital(info);
    } catch (e) {
      console.error('❌ [loadUserHospital]', e);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ============================================================
  // 🏥 โหลดตัวเลือกโรงพยาบาล (สำหรับ Admin)
  // ============================================================
  const loadHospitalOptions = useCallback(async (userData: any) => {
    try {
      const hospitalIds = await getAccessibleHospitalIds(userData.id);
      const isSuper = isSuperAdmin(userData);

      let query = supabase
        .from('hospitals')
        .select('id, name, type')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!isSuper && hospitalIds.length > 0) {
        query = query.in('id', hospitalIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      setHospitalOptions(
        (data || []).map((h: any) => ({
          id: h.id,
          name: `${h.type === 'main' ? '🏢' : '🏥'} ${h.name}`,
        }))
      );
    } catch (e) {
      console.error('❌ [loadHospitalOptions]', e);
    }
  }, []);

  // ============================================================
  // 👨‍⚕️ โหลดตัวเลือกโค้ช (ตามโรงพยาบาลที่เลือก)
  // ============================================================
  const loadCoachOptions = useCallback(async (hospitalId: string, userData: any) => {
    setLoadingFilters(true);
    try {
      const hospitalIds = await getAccessibleHospitalIds(userData.id);
      const isSuper = isSuperAdmin(userData);

      let query = supabase
        .from('doctors')
        .select(`user_id, full_name_th, users!inner(hospital_id)`)
        .eq('is_active', true)
        .eq('users.is_active', true)
        .order('full_name_th', { ascending: true });

      // กรองตามโรงพยาบาล
      if (hospitalId !== 'all') {
        query = query.eq('users.hospital_id', hospitalId);
      } else if (!isSuper && hospitalIds.length > 0) {
        query = query.in('users.hospital_id', hospitalIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      setCoachOptions(
        (data || []).map((c: any) => ({
          id: c.user_id,
          name: c.full_name_th,
          hospital_name: c.users?.hospital_id,
        }))
      );
    } catch (e) {
      console.error('❌ [loadCoachOptions]', e);
      setCoachOptions([]);
    } finally {
      setLoadingFilters(false);
    }
  }, []);

  // ✅ เมื่อ Admin เปลี่ยนโรงพยาบาล → โหลดโค้ชใหม่ + รีเซ็ตโค้ชเป็น 'all'
  useEffect(() => {
    if (isAdminView && user) {
      if (hospitalOptions.length === 0) {
        loadHospitalOptions(user);
      }
      setFilterCoachId('all');
      loadCoachOptions(filterHospitalId, user);
    }
  }, [isAdminView, user, filterHospitalId]);

  // ============================================================
  // 📊 โหลดข้อมูลหลัก (เคารพ filter)
  // ============================================================
  const loadData = useCallback(
    async (userData: any, days: number) => {
      setLoading(true);
      const t0 = performance.now();

      try {
        const hospitalIds = await getAccessibleHospitalIds(userData.id);
        const isSuper = isSuperAdmin(userData);

        // ✅ คำนวณ "ขอบเขตการดู" ตาม filter
        let effectiveHospitalIds: string[] = [];
        let effectiveCoachId: string | null = null;

        if (isAdminView) {
          // Admin: ใช้ filter ที่เลือก
          if (filterHospitalId !== 'all') {
            effectiveHospitalIds = [filterHospitalId];
            // ถ้าเลือก รพ.ลูกข่าย → รวมแม่ข่ายด้วย (เพื่อดูข้อมูลครบ)
            const { data: hosp } = await supabase
              .from('hospitals')
              .select('type, parent_id')
              .eq('id', filterHospitalId)
              .single();
            if (hosp?.type === 'sub' && hosp.parent_id) {
              effectiveHospitalIds = [hosp.parent_id, filterHospitalId];
            }
          } else if (!isSuper && hospitalIds.length > 0) {
            effectiveHospitalIds = hospitalIds;
          }
          // ถ้า filterCoachId !== 'all' → ใช้โค้ชที่เลือก
          if (filterCoachId !== 'all') {
            effectiveCoachId = filterCoachId;
          }
        } else {
          // Staff: ใช้ของตัวเอง
          effectiveCoachId = userData.id;
          if (!isSuper && hospitalIds.length > 0) {
            effectiveHospitalIds = hospitalIds;
          }
        }

        console.log('📊 [loadData] Filter:', {
          isAdminView,
          effectiveHospitalIds,
          effectiveCoachId,
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        // ---------- 1) ดึงผู้ป่วยตาม filter ----------
        let patientQuery = supabase
          .from('profiles')
          .select('id, hospital_number, first_name, last_name, pam_level, hospital_id, coach_id')
          .eq('is_active', true);

        if (effectiveHospitalIds.length > 0) {
          patientQuery = patientQuery.in('hospital_id', effectiveHospitalIds);
        }
        if (effectiveCoachId) {
          patientQuery = patientQuery.eq('coach_id', effectiveCoachId);
        }

        const { data: patients, error: pErr } = await patientQuery;
        if (pErr) throw pErr;

        const totalPatients = patients?.length || 0;
        const allPatientIds = (patients || []).map((p: any) => p.id);

        // ✅ ตรวจสอบ: ถ้า admin เลือกโค้ช แต่โค้ชไม่มีผู้ป่วย → แสดงข้อความชัดเจน
        if (isAdminView && effectiveCoachId && totalPatients === 0) {
          setEmptyReason('no_coach');
        } else if (totalPatients === 0) {
          setEmptyReason('no_data');
        } else {
          setEmptyReason('none');
        }

        // ---------- 2) ดึง followups ----------
        let allFollowups: any[] = [];
        if (allPatientIds.length > 0) {
          let fuQuery = supabase
            .from('appointment_followups')
            .select('user_id, followup_date, adaptation_summary')
            .in('user_id', allPatientIds);
          const { data } = await fuQuery;
          allFollowups = data || [];
        }

        // ---------- 3) คำนวณ On-time / Overdue ----------
        const latestFollowupMap: Record<string, string> = {};
        allFollowups.forEach((f: any) => {
          const cur = latestFollowupMap[f.user_id];
          if (!cur || new Date(f.followup_date) > new Date(cur)) {
            latestFollowupMap[f.user_id] = f.followup_date;
          }
        });

        // ดึงชื่อ รพ. + ชื่อโค้ช
        const hospitalIdsOfPatients = [...new Set((patients || []).map((p: any) => p.hospital_id).filter(Boolean))] as string[];
        const coachIdsOfPatients = [...new Set((patients || []).map((p: any) => p.coach_id).filter(Boolean))] as string[];

        const [hospData, coachData] = await Promise.all([
          hospitalIdsOfPatients.length > 0
            ? supabase.from('hospitals').select('id, name').in('id', hospitalIdsOfPatients)
            : Promise.resolve({ data: [] }),
          coachIdsOfPatients.length > 0
            ? supabase.from('doctors').select('user_id, full_name_th').in('user_id', coachIdsOfPatients)
            : Promise.resolve({ data: [] }),
        ]);

        const hospitalNameMap: Record<string, string> = {};
        (hospData.data || []).forEach((h: any) => (hospitalNameMap[h.id] = h.name));

        const coachNameMap: Record<string, string> = {};
        (coachData.data || []).forEach((c: any) => (coachNameMap[c.user_id] = c.full_name_th));

        let onTime = 0;
        const overdueList: WatchlistPatient[] = [];

        (patients || []).forEach((p: any) => {
          const lastDateStr = latestFollowupMap[p.id];
          if (!lastDateStr) {
            overdueList.push({
              id: p.id,
              hospital_number: p.hospital_number,
              first_name: p.first_name,
              last_name: p.last_name,
              pam_level: p.pam_level,
              hospital_id: p.hospital_id,
              hospital_name: hospitalNameMap[p.hospital_id] || '-',
              coach_id: p.coach_id,
              coach_name: coachNameMap[p.coach_id] || 'ไม่ระบุ',
              last_followup: null,
              days_overdue: 999,
            });
          } else {
            const diff = Math.floor((today.getTime() - new Date(lastDateStr).getTime()) / 86400000);
            if (diff <= 30) onTime++;
            else {
              overdueList.push({
                id: p.id,
                hospital_number: p.hospital_number,
                first_name: p.first_name,
                last_name: p.last_name,
                pam_level: p.pam_level,
                hospital_id: p.hospital_id,
                hospital_name: hospitalNameMap[p.hospital_id] || '-',
                coach_id: p.coach_id,
                coach_name: coachNameMap[p.coach_id] || 'ไม่ระบุ',
                last_followup: lastDateStr,
                days_overdue: diff,
              });
            }
          }
        });

        overdueList.sort((a, b) => b.days_overdue - a.days_overdue);
        setOverduePatients(overdueList);
        setOverdueTotal(overdueList.length);

        setStats((s) => ({
          ...s,
          total_patients: totalPatients,
          on_time_count: onTime,
          overdue_count: overdueList.length,
        }));

        // ---------- 4) เหตุผล 30 วัน ----------
        const reasons = { obstacles: 0, opportunities: 0, other: 0 };
        allFollowups.forEach((f: any) => {
          if (new Date(f.followup_date) >= thirtyDaysAgo) {
            if (f.adaptation_summary === 'obstacles') reasons.obstacles++;
            else if (f.adaptation_summary === 'opportunities') reasons.opportunities++;
            else if (f.adaptation_summary === 'other') reasons.other++;
          }
        });

        // ---------- 5) Records 30 วัน ----------
        let active = 0;
        let repeat = 0;
        if (allPatientIds.length > 0) {
          const { data: recentRecords } = await supabase
            .from('records')
            .select('user_id')
            .in('user_id', allPatientIds)
            .gte('record_date', thirtyDaysAgoStr);
          const cnt: Record<string, number> = {};
          (recentRecords || []).forEach((r: any) => (cnt[r.user_id] = (cnt[r.user_id] || 0) + 1));
          active = Object.keys(cnt).length;
          repeat = Object.values(cnt).filter((c) => c > 1).length;
        }

        setRepeatStats({
          active_recorders: active,
          repeat_recorders: repeat,
          obstacles_count: reasons.obstacles,
          opportunities_count: reasons.opportunities,
          other_count: reasons.other,
        });

        // ---------- 6) PAM เปลี่ยน ----------
        let pamInc = 0;
        let pamDec = 0;
        if (allPatientIds.length > 0) {
          const { data: recentScreens } = await supabase
            .from('screenings')
            .select('user_id, screening_date, pam_total_score')
            .in('user_id', allPatientIds)
            .gte('screening_date', startOfMonthStr);
          const byUser: Record<string, any[]> = {};
          (recentScreens || []).forEach((s: any) => {
            if (!byUser[s.user_id]) byUser[s.user_id] = [];
            byUser[s.user_id].push(s);
          });
          Object.values(byUser).forEach((screens) => {
            if (screens.length >= 2) {
              screens.sort((a, b) => new Date(b.screening_date).getTime() - new Date(a.screening_date).getTime());
              if ((screens[0].pam_total_score ?? 0) > (screens[1].pam_total_score ?? 0)) pamInc++;
              else if ((screens[0].pam_total_score ?? 0) < (screens[1].pam_total_score ?? 0)) pamDec++;
            }
          });
        }
        setStats((s) => ({ ...s, pam_increased: pamInc, pam_decreased: pamDec }));

        // ---------- 7) Upcoming ----------
        const untilDate = new Date(today);
        untilDate.setDate(today.getDate() + days);
        const todayStr = today.toISOString().split('T')[0];
        const untilStr = untilDate.toISOString().split('T')[0];

        let upcomingQ = supabase
          .from('v_upcoming_appointments')
          .select('*')
          .gte('appointment_date', todayStr)
          .lte('appointment_date', untilStr)
          .order('appointment_date', { ascending: true })
          .limit(50);

        let upcomingCountQ = supabase
          .from('v_upcoming_appointments')
          .select('*', { count: 'planned', head: true })
          .gte('appointment_date', todayStr)
          .lte('appointment_date', untilStr);

        if (effectiveCoachId) {
          upcomingQ = upcomingQ.eq('coach_id', effectiveCoachId);
          upcomingCountQ = upcomingCountQ.eq('coach_id', effectiveCoachId);
        } else if (effectiveHospitalIds.length > 0) {
          upcomingQ = upcomingQ.in('hospital_id', effectiveHospitalIds);
          upcomingCountQ = upcomingCountQ.in('hospital_id', effectiveHospitalIds);
        }

        const [{ data: upData, error: upErr }, { count: upCount }] = await Promise.all([upcomingQ, upcomingCountQ]);
        if (upErr) throw upErr;
        setUpcomingAppointments((upData || []) as UpcomingAppointment[]);
        setUpcomingTotal(upCount || 0);

        console.log(`✅ [loadData] เสร็จใน ${(performance.now() - t0).toFixed(0)}ms`);
      } catch (error) {
        console.error('❌ [CarePathwayDashboard] Error:', error);
      } finally {
        setLoading(false);
      }
    },
    [isAdminView, filterHospitalId, filterCoachId]
  );

  useEffect(() => {
    if (user) loadData(user, selectedDays);
  }, [user, selectedDays, loadData]);

  // ============================================================
  // 🖥️ Render
  // ============================================================
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
      {/* ================= Header ================= */}
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
              {/* ✅ Admin Filter Panel */}
              {isAdminView && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <Filter className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-800">ตัวกรอง:</span>
                  <select
                    value={filterHospitalId}
                    onChange={(e) => setFilterHospitalId(e.target.value)}
                    disabled={loadingFilters}
                    className="px-3 py-1.5 border border-amber-300 rounded-lg bg-white text-sm disabled:opacity-50"
                  >
                    <option value="all">🏥 ทุกโรงพยาบาล</option>
                    {hospitalOptions.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterCoachId}
                    onChange={(e) => setFilterCoachId(e.target.value)}
                    disabled={loadingFilters}
                    className="px-3 py-1.5 border border-amber-300 rounded-lg bg-white text-sm disabled:opacity-50"
                  >
                    <option value="all">👤 ทุกโค้ช</option>
                    {coachOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Staff badge */}
              {!isAdminView && (
                <div className="px-4 py-2 bg-purple-100 border border-purple-200 rounded-xl text-sm font-medium text-purple-700">
                  👤 ดูเฉพาะในการดูแลของฉัน ({user?.full_name_th})
                </div>
              )}

              {/* User card */}
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
        {/* ================= ใกล้ถึงวันนัด ================= */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              <Calendar className="w-5 h-5 text-cyan-600" />
              ผู้ป่วยใกล้ถึงวันนัด
              <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm font-bold">{upcomingTotal} คน</span>
              {!isAdminView && (
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
                          <button onClick={() => router.push(`/admin/appointments/followup/new?patient_id=${a.patient_id}&appointment_id=${a.appointment_id}`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-xs hover:bg-cyan-600 transition-colors">
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

        {/* ================= หมวดที่ 1 ================= */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-blue-600" /> หมวดที่ 1: สรุปตัวเลขภาพรวม
            {!isAdminView && (
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

        {/* ================= หมวดที่ 2: Watchlist ================= */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              ทั้งหมด {overdueTotal.toLocaleString()} คน
            </span>
            {!isAdminView && (
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>
            )}
          </h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {/* ✅ แสดงข้อความชัดเจนตามกรณี */}
            {overduePatients.length === 0 ? (
              <div className="p-8 text-center">
                {emptyReason === 'no_coach' ? (
                  <>
                    <User className="w-12 h-12 mx-auto mb-3 text-amber-400" />
                    <p className="text-amber-700 font-medium mb-1">⚠️ ไม่พบผู้ป่วยในการดูแล</p>
                    <p className="text-sm text-gray-500">
                      {isAdminView
                        ? `โค้ชที่เลือกไม่มีผู้ป่วยในระบบ หรือยังไม่ได้มอบหมายโค้ชให้ผู้ป่วย`
                        : `คุณ (${user?.full_name_th}) ไม่ได้เป็นโค้ชของผู้ป่วยรายใดในระบบ`}
                    </p>
                    {isAdminView && (
                      <p className="text-xs text-gray-400 mt-2">💡 ลองเปลี่ยนตัวกรองด้านบนเพื่อดูข้อมูลอื่น</p>
                    )}
                  </>
                ) : emptyReason === 'no_data' ? (
                  <>
                    <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-600 font-medium mb-1">🔍 ไม่มีข้อมูลในระบบ</p>
                    <p className="text-sm text-gray-500">ไม่พบผู้ป่วยตามเงื่อนไขที่เลือก</p>
                  </>
                ) : (
                  <>
                    <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-green-400" />
                    <p className="text-green-700 font-medium mb-1">✅ ยอดเยี่ยม!</p>
                    <p className="text-sm text-gray-500">ไม่มีผู้ป่วยที่เลยกำหนดการติดตาม</p>
                  </>
                )}
              </div>
            ) : (
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
                          <button onClick={() => router.push(`/admin/patients/${p.id}/care-pathway?from=care-pathway-dashboard`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors">
                            <Eye className="w-3 h-3" /> ดูรายละเอียด
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

        {/* ================= หมวดที่ 3 ================= */}
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
                  <p className="text-3xl font-bold text-blue-700">{repeatStats.active_recorders.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <p className="text-sm text-purple-800 font-medium">ผู้ป่วยที่บันทึกซ้ำ</p>
                    <p className="text-xs text-purple-600">มีความสม่ำเสมอ (&gt;1 ครั้ง)</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{repeatStats.repeat_recorders.toLocaleString()}</p>
                </div>
                {repeatStats.active_recorders > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>อัตราความสม่ำเสมอ</span>
                      <span>{Math.round((repeatStats.repeat_recorders / repeatStats.active_recorders) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-purple-500 h-2.5 rounded-full transition-all" style={{ width: `${(repeatStats.repeat_recorders / repeatStats.active_recorders) * 100}%` }}></div>
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
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-red-800">พบอุปสรรค / ความกังวล</p>
                      <p className="text-xs text-red-600">adaptation_summary = 'obstacles'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-red-700">{repeatStats.obstacles_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><TrendingUp className="w-4 h-4 text-green-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-green-800">พบโอกาส / ความก้าวหน้า</p>
                      <p className="text-xs text-green-600">adaptation_summary = 'opportunities'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-green-700">{repeatStats.opportunities_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><HelpCircle className="w-4 h-4 text-gray-600" /></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">อื่นๆ</p>
                      <p className="text-xs text-gray-600">adaptation_summary = 'other'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-gray-700">{repeatStats.other_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}