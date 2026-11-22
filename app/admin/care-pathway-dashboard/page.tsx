// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 23 พฤศจิกายน 2569
// ✅ การแก้ไข:
//    1. โหลดเร็วขึ้นมาก — ไม่ดึงประวัติทั้งหมด (นับด้วย count + ดึงเฉพาะ 30 วัน/เดือนนี้)
//    2. "ใกล้ถึงวันนัด" = Server-side Pagination 10 คน/หน้า (เปลี่ยนหน้าแล้วรายชื่อเปลี่ยนจริง)
//    3. "Watchlist" = View + Fallback, Pagination 10 คน/หน้า + ปุ่ม ดูรายละเอียด/สร้างนัดหมายใหม่
//    4. หมวดที่ 1 แสดงเฉพาะตัวเลข (ตัดตารางรายชื่อผู้ป่วยออก)
//    5. ส่ง patient_id + coach_id + from=care-pathway-dashboard ไปหน้านัดหมายใหม่ (กลับถูกหน้า)
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession, getAccessibleHospitalIds, isSuperAdmin,
  getUserHospitalInfo, logout,
} from '@/lib/supabase/queries';
import {
  Users, CalendarCheck, CalendarX, TrendingUp, TrendingDown,
  AlertTriangle, Repeat, HelpCircle, ArrowRight, Loader2, Eye,
  UserCheck, Hospital, Building2, LogOut, Calendar, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarPlus,
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

const PAGE_SIZE = 10;

// ============================================================
// 🧰 Helpers
// ============================================================
async function fetchAllIds(filters: { apply: (q: any) => any }): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  const chunk = 1000;
  while (true) {
    let query = supabase.from('profiles').select('id').range(from, from + chunk - 1);
    query = filters.apply(query);
    const { data, error } = await query;
    if (error || !data) break;
    out.push(...data.map((p: any) => p.id));
    if (data.length < chunk) break;
    from += chunk;
    if (from > 100000) break;
  }
  return out;
}

async function fetchInChunks(
  table: string, select: string, inColumn: string,
  inValues: string[], gte?: { column: string; value: string }
): Promise<any[]> {
  const out: any[] = [];
  const chunkSize = 900;
  for (let i = 0; i < inValues.length; i += chunkSize) {
    const slice = inValues.slice(i, i + chunkSize);
    let query = supabase.from(table).select(select).in(inColumn, slice);
    if (gte) query = query.gte(gte.column, gte.value);
    const { data } = await query;
    if (data) out.push(...data);
  }
  return out;
}

async function buildNameMaps(ids: { hosp: string[]; coach: string[] }) {
  const [hospRes, coachRes] = await Promise.all([
    ids.hosp.length > 0
      ? supabase.from('hospitals').select('id, name').in('id', ids.hosp)
      : Promise.resolve({ data: [] as any[] }),
    ids.coach.length > 0
      ? supabase.from('doctors').select('user_id, full_name_th').in('user_id', ids.coach)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const hospMap: Record<string, string> = {};
  (hospRes.data || []).forEach((h: any) => (hospMap[h.id] = h.name));
  const coachMap: Record<string, string> = {};
  (coachRes.data || []).forEach((c: any) => (coachMap[c.user_id] = c.full_name_th));
  return { hospMap, coachMap };
}

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    total_patients: 0, on_time_count: 0, overdue_count: 0,
    pam_increased: 0, pam_decreased: 0,
    active_recorders: 0, repeat_recorders: 0,
    obstacles_count: 0, opportunities_count: 0, other_count: 0,
  });

  // Watchlist + Pagination (server-side)
  const [overduePatients, setOverduePatients] = useState<WatchlistPatient[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [overduePage, setOverduePage] = useState(0);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const overdueTotalPages = Math.max(1, Math.ceil(overdueTotal / PAGE_SIZE));

  // Upcoming + Pagination (server-side)
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingTotal / PAGE_SIZE));

  const [selectedDays, setSelectedDays] = useState<number>(3);
  const [scope, setScope] = useState<'all' | 'mine'>('all');

  // Context ที่คำนวณไว้ (ใช้ซ้ำตอนเปลี่ยนหน้า — ไม่ต้อง re-fetch ทั้งหมด)
  const ctxRef = useRef<{ hospitalIds: string[]; isSuper: boolean; userId: string }>({
    hospitalIds: [], isSuper: false, userId: '',
  });
  const overdueIdsRef = useRef<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

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
      setUserHospital(info);
    } catch (e) { console.error('❌ [loadUserHospital]', e); }
  };
  const handleLogout = () => { logout(); router.push('/admin/login'); };

  // ============================================================
  // 📊 โหลดสถิติ + เตรียมขอบเขต (ดึงเฉพาะข้อมูล 30 วัน/เดือนนี้ = เร็ว)
  // ============================================================
  const loadStats = useCallback(async (userData: any, currentScope: 'all' | 'mine') => {
    const t0 = performance.now();
    const hospitalIds = await getAccessibleHospitalIds(userData.id);
    const isSuper = isSuperAdmin(userData);
    ctxRef.current = { hospitalIds, isSuper, userId: userData.id };

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // 1) ID ผู้ป่วยในขอบเขต (ดึงเฉพาะ id — เบามาก)
    const filters = {
      apply: (q: any) => {
        q = q.eq('is_active', true);
        if (!isSuper && hospitalIds.length > 0) q = q.in('hospital_id', hospitalIds);
        if (currentScope === 'mine') q = q.eq('coach_id', userData.id);
        return q;
      },
    };
    const allPatientIds = await fetchAllIds(filters);
    const totalPatients = allPatientIds.length;

    // 2) followup 30 วันล่าสุดเท่านั้น (ไม่ดึงประวัติทั้งหมด!)
    const recentFollowups = allPatientIds.length > 0
      ? await fetchInChunks(
          'appointment_followups', 'user_id, followup_date, adaptation_summary',
          'user_id', allPatientIds, { column: 'followup_date', value: thirtyDaysAgoStr }
        )
      : [];
    const recentSet = new Set(recentFollowups.map((f: any) => f.user_id));
    const onTime = recentSet.size;
    const overdueIds = allPatientIds.filter((id) => !recentSet.has(id));
    overdueIdsRef.current = overdueIds;

    // 3) เหตุผล 30 วัน
    const reasons = { obstacles: 0, opportunities: 0, other: 0 };
    recentFollowups.forEach((f: any) => {
      if (f.adaptation_summary === 'obstacles') reasons.obstacles++;
      else if (f.adaptation_summary === 'opportunities') reasons.opportunities++;
      else if (f.adaptation_summary === 'other') reasons.other++;
    });

    // 4) records 30 วัน
    let active = 0, repeat = 0;
    if (allPatientIds.length > 0) {
      const recentRecords = await fetchInChunks(
        'records', 'user_id', 'user_id', allPatientIds,
        { column: 'record_date', value: thirtyDaysAgoStr }
      );
      const cnt: Record<string, number> = {};
      recentRecords.forEach((r: any) => (cnt[r.user_id] = (cnt[r.user_id] || 0) + 1));
      active = Object.keys(cnt).length;
      repeat = Object.values(cnt).filter((c) => c > 1).length;
    }

    // 5) PAM เปลี่ยน (เดือนนี้)
    let pamInc = 0, pamDec = 0;
    if (allPatientIds.length > 0) {
      const screens = await fetchInChunks(
        'screenings', 'user_id, screening_date, pam_total_score', 'user_id', allPatientIds,
        { column: 'screening_date', value: startOfMonthStr }
      );
      const byUser: Record<string, any[]> = {};
      screens.forEach((s: any) => { (byUser[s.user_id] ||= []).push(s); });
      Object.values(byUser).forEach((list) => {
        if (list.length >= 2) {
          list.sort((a, b) => new Date(b.screening_date).getTime() - new Date(a.screening_date).getTime());
          if ((list[0].pam_total_score ?? 0) > (list[1].pam_total_score ?? 0)) pamInc++;
          else if ((list[0].pam_total_score ?? 0) < (list[1].pam_total_score ?? 0)) pamDec++;
        }
      });
    }

    setStats({
      total_patients: totalPatients, on_time_count: onTime, overdue_count: overdueIds.length,
      pam_increased: pamInc, pam_decreased: pamDec,
      active_recorders: active, repeat_recorders: repeat,
      obstacles_count: reasons.obstacles, opportunities_count: reasons.opportunities,
      other_count: reasons.other,
    });
    console.log(`✅ [loadStats] เสร็จใน ${(performance.now() - t0).toFixed(0)}ms`,
      { totalPatients, onTime, overdue: overdueIds.length });
  }, []);

  // ============================================================
  // 📋 Watchlist — โหลดทีละหน้า (View ก่อน → fallback)
  // ============================================================
  const loadOverduePage = useCallback(async (page: number) => {
    const ctx = ctxRef.current;
    if (!ctx.userId) return;
    setOverdueLoading(true);
    try {
      const applyScope = (q: any) => {
        if (scope === 'mine') return q.eq('coach_id', ctx.userId);
        if (!ctx.isSuper && ctx.hospitalIds.length > 0) return q.in('hospital_id', ctx.hospitalIds);
        return q;
      };
      // --- วิธีที่ 1: View (เร็วสุด) ---
      try {
        const [{ count }, { data, error }] = await Promise.all([
          applyScope(supabase.from('v_overdue_patients').select('*', { count: 'exact', head: true })),
          applyScope(
            supabase.from('v_overdue_patients').select('*')
              .order('days_overdue', { ascending: false })
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          ),
        ]);
        if (!error && data) {
          const coachIds = [...new Set(data.map((p: any) => p.coach_id).filter(Boolean))] as string[];
          const { coachMap } = await buildNameMaps({ hosp: [], coach: coachIds });
          setOverdueTotal(count || 0);
          setOverduePatients(data.map((p: any) => ({ ...p, coach_name: coachMap[p.coach_id] || null })));
          return;
        }
      } catch { /* View ไม่มี → fallback */ }

      // --- วิธีที่ 2: Fallback จาก ID ที่นับไว้ใน loadStats (ไม่ต้อง query ใหญ่) ---
      const ids = overdueIdsRef.current;
      setOverdueTotal(ids.length);
      const slice = ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      if (slice.length === 0) { setOverduePatients([]); return; }

      const [profRes, fuRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, hospital_number, first_name, last_name, pam_level, hospital_id, coach_id')
          .in('id', slice),
        supabase.from('appointment_followups').select('user_id, followup_date').in('user_id', slice),
      ]);
      const latestMap: Record<string, string> = {};
      (fuRes.data || []).forEach((f: any) => {
        const cur = latestMap[f.user_id];
        if (!cur || new Date(f.followup_date) > new Date(cur)) latestMap[f.user_id] = f.followup_date;
      });
      const rows = (profRes.data || []).map((p: any) => {
        const last = latestMap[p.id] || null;
        const days = last
          ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
          : 999;
        return { ...p, last_followup: last, days_overdue: days };
      });
      const hospIds = [...new Set(rows.map((r: any) => r.hospital_id).filter(Boolean))] as string[];
      const coachIds = [...new Set(rows.map((r: any) => r.coach_id).filter(Boolean))] as string[];
      const { hospMap, coachMap } = await buildNameMaps({ hosp: hospIds, coach: coachIds });
      setOverduePatients(rows.map((r: any) => ({
        ...r,
        hospital_name: hospMap[r.hospital_id] || '-',
        coach_name: coachMap[r.coach_id] || null,
      })));
    } catch (e) {
      console.error('❌ [loadOverduePage]', e);
    } finally {
      setOverdueLoading(false);
    }
  }, [scope]);

  // ============================================================
  // 📅 Upcoming — โหลดทีละหน้า (View ก่อน → fallback appointments)
  // ============================================================
  const loadUpcomingPage = useCallback(async (page: number, days: number) => {
    const ctx = ctxRef.current;
    if (!ctx.userId) return;
    setUpcomingLoading(true);
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const until = new Date(today); until.setDate(today.getDate() + days);
      const todayStr = today.toISOString().split('T')[0];
      const untilStr = until.toISOString().split('T')[0];

      const applyScope = (q: any) => {
        if (scope === 'mine') return q.eq('coach_id', ctx.userId);
        if (!ctx.isSuper && ctx.hospitalIds.length > 0) return q.in('hospital_id', ctx.hospitalIds);
        return q;
      };
      // --- วิธีที่ 1: View ---
      try {
        const [{ count }, { data, error }] = await Promise.all([
          applyScope(
            supabase.from('v_upcoming_appointments').select('*', { count: 'exact', head: true })
              .gte('appointment_date', todayStr).lte('appointment_date', untilStr)
          ),
          applyScope(
            supabase.from('v_upcoming_appointments').select('*')
              .gte('appointment_date', todayStr).lte('appointment_date', untilStr)
              .order('days_until', { ascending: true })
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          ),
        ]);
        if (!error && data) {
          setUpcomingTotal(count || 0);
          setUpcomingAppointments(data as UpcomingAppointment[]);
          return;
        }
      } catch { /* fallback */ }

      // --- วิธีที่ 2: ตาราง appointments ตรง ๆ ---
      let baseQ = () => {
        let q = supabase.from('appointments')
          .select('id, user_id, appointment_date, appointment_type, status, profiles!inner(id, hospital_number, first_name, last_name, pam_level, hospital_id, coach_id)', { count: 'exact' })
          .eq('status', 'scheduled')
          .eq('profiles.is_active', true)
          .gte('appointment_date', todayStr)
          .lte('appointment_date', untilStr);
        if (scope === 'mine') q = q.eq('profiles.coach_id', ctx.userId);
        else if (!ctx.isSuper && ctx.hospitalIds.length > 0) q = q.in('profiles.hospital_id', ctx.hospitalIds);
        return q;
      };
      const [{ count }, { data }] = await Promise.all([
        baseQ(),
        baseQ().order('appointment_date', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      ]);
      const rows = (data || []) as any[];
      const hospIds = [...new Set(rows.map((r: any) => r.profiles?.hospital_id).filter(Boolean))] as string[];
      const coachIds = [...new Set(rows.map((r: any) => r.profiles?.coach_id).filter(Boolean))] as string[];
      const { hospMap, coachMap } = await buildNameMaps({ hosp: hospIds, coach: coachIds });
      setUpcomingTotal(count || 0);
      setUpcomingAppointments(rows.map((r: any) => ({
        appointment_id: r.id,
        patient_id: r.user_id,
        appointment_date: r.appointment_date,
        appointment_type: r.appointment_type,
        status: r.status,
        hospital_number: r.profiles?.hospital_number || '',
        first_name: r.profiles?.first_name || '',
        last_name: r.profiles?.last_name || '',
        pam_level: r.profiles?.pam_level || '',
        hospital_id: r.profiles?.hospital_id || '',
        hospital_name: hospMap[r.profiles?.hospital_id] || '-',
        coach_id: r.profiles?.coach_id || null,
        coach_name: coachMap[r.profiles?.coach_id] || null,
        days_until: Math.max(0, Math.floor((new Date(r.appointment_date).getTime() - today.getTime()) / 86400000)),
      })) as UpcomingAppointment[]);
    } catch (e) {
      console.error('❌ [loadUpcomingPage]', e);
    } finally {
      setUpcomingLoading(false);
    }
  }, [scope]);

  // ============================================================
  // 🔄 Trigger
  // ============================================================
  // scope/days เปลี่ยน → โหลด stats ใหม่ + รีเซ็ตหน้า
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadStats(user, scope);
      if (cancelled) return;
      setOverduePage(0);
      setUpcomingPage(0);
      setReloadKey((k) => k + 1);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, scope, selectedDays, loadStats]);

  // เปลี่ยนหน้า watchlist → โหลดเฉพาะหน้านั้น
  useEffect(() => {
    if (!user || loading) return;
    loadOverduePage(overduePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overduePage, reloadKey, loading]);

  // เปลี่ยนหน้า upcoming → โหลดเฉพาะหน้านั้น
  useEffect(() => {
    if (!user || loading) return;
    loadUpcomingPage(upcomingPage, selectedDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingPage, reloadKey, loading]);

  const switchScope = (s: 'all' | 'mine') => { if (s !== scope) setScope(s); };

  const getPageNumbers = (totalPages: number, currentPage: number) => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 0; i < totalPages; i++) pages.push(i); }
    else if (currentPage < 3) {
      for (let i = 0; i < maxVisible - 1; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages - 1);
    } else if (currentPage > totalPages - 4) {
      pages.push(0); pages.push('...');
      for (let i = totalPages - maxVisible + 1; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0); pages.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages - 1);
    }
    return pages;
  };

  // ✅ ปุ่มสร้างนัดหมายใหม่ — ส่งคนไข้ + โค้ช + จากไหน (กลับถูกหน้า)
  const goNewAppointment = (p: WatchlistPatient) => {
    const coachParam = p.coach_id ? `&coach_id=${p.coach_id}` : '';
    router.push(`/admin/appointments/new?patient_id=${p.id}${coachParam}&from=care-pathway-dashboard`);
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
                <button onClick={() => switchScope('all')} className={`px-4 py-2 transition-colors ${scope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>🏥 ทั้งหมด</button>
                <button onClick={() => switchScope('mine')} className={`px-4 py-2 transition-colors ${scope === 'mine' ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>👤 ในการดูแลของฉัน</button>
              </div>
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><UserCheck className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
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
                ) : (<p className="text-xs text-gray-400 mt-2">ไม่สังกัดโรงพยาบาล</p>)}
              </div>
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* ================= ใกล้ถึงวันนัด — Pagination จริง 10 คน/หน้า ================= */}
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
              <select value={selectedDays} onChange={(e) => setSelectedDays(Number(e.target.value))} className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-cyan-500">
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} วัน</option>)}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            {upcomingLoading && (
              <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              </div>
            )}
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
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              a.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                              a.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                              a.pam_level === 'L2' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                              a.days_until <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-cyan-100 text-cyan-700'
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
                {upcomingTotalPages > 1 && (
                  <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
                    <div className="text-sm text-gray-600">
                      แสดง {upcomingPage * PAGE_SIZE + 1} - {Math.min((upcomingPage + 1) * PAGE_SIZE, upcomingTotal)} จาก {upcomingTotal.toLocaleString()} คน
                      <span className="text-gray-400 ml-2">(หน้า {upcomingPage + 1} / {upcomingTotalPages})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setUpcomingPage(0)} disabled={upcomingPage === 0} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าแรก"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => setUpcomingPage((p) => Math.max(0, p - 1))} disabled={upcomingPage === 0} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> ก่อนหน้า</button>
                      <div className="flex gap-1">
                        {getPageNumbers(upcomingTotalPages, upcomingPage).map((pageNum, idx) => {
                          if (pageNum === '...') return <span key={`u-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                          const p = pageNum as number;
                          return <button key={p} onClick={() => setUpcomingPage(p)} className={`px-3 py-2 rounded-lg text-sm font-medium ${upcomingPage === p ? 'bg-cyan-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}>{p + 1}</button>;
                        })}
                      </div>
                      <button onClick={() => setUpcomingPage((p) => Math.min(upcomingTotalPages - 1, p + 1))} disabled={upcomingPage >= upcomingTotalPages - 1} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1">ถัดไป <ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => setUpcomingPage(upcomingTotalPages - 1)} disabled={upcomingPage >= upcomingTotalPages - 1} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าสุดท้าย"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ================= หมวดที่ 1 — เฉพาะตัวเลข (ไม่มีตารางรายชื่อ) ================= */}
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
              {stats.on_time_count + stats.overdue_count === stats.total_patients
                ? `✅ ${stats.on_time_count} + ${stats.overdue_count} = ${stats.total_patients} ครบถ้วน`
                : `⚠️ ${stats.on_time_count} + ${stats.overdue_count} ≠ ${stats.total_patients}`}
            </span>
          </div>
        </div>

        {/* ================= หมวดที่ 2: Watchlist — 10 คน/หน้า + 2 ปุ่ม ================= */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">ทั้งหมด {overdueTotal.toLocaleString()} คน</span>
            {scope === 'mine' && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">👤 ในการดูแลของฉัน</span>}
          </h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            {overdueLoading && (
              <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              </div>
            )}
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
                              p.pam_level === 'L2' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                            <div className="inline-flex items-center gap-2">
                              <button onClick={() => router.push(`/admin/patients/${p.id}/care-pathway?from=care-pathway-dashboard`)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors">
                                <Eye className="w-3 h-3" /> ดูรายละเอียด
                              </button>
                              <button onClick={() => goNewAppointment(p)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs hover:bg-emerald-600 transition-colors">
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
                    <div className="text-sm text-gray-600">
                      แสดง {overduePage * PAGE_SIZE + 1} - {Math.min((overduePage + 1) * PAGE_SIZE, overdueTotal)} จาก {overdueTotal.toLocaleString()} คน
                      <span className="text-gray-400 ml-2">(หน้า {overduePage + 1} / {overdueTotalPages})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setOverduePage(0)} disabled={overduePage === 0} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าแรก"><ChevronsLeft className="w-4 h-4" /></button>
                      <button onClick={() => setOverduePage((p) => Math.max(0, p - 1))} disabled={overduePage === 0} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> ก่อนหน้า</button>
                      <div className="flex gap-1">
                        {getPageNumbers(overdueTotalPages, overduePage).map((pageNum, idx) => {
                          if (pageNum === '...') return <span key={`o-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                          const p = pageNum as number;
                          return <button key={p} onClick={() => setOverduePage(p)} className={`px-3 py-2 rounded-lg text-sm font-medium ${overduePage === p ? 'bg-red-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}>{p + 1}</button>;
                        })}
                      </div>
                      <button onClick={() => setOverduePage((p) => Math.min(overdueTotalPages - 1, p + 1))} disabled={overduePage >= overdueTotalPages - 1} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 text-sm flex items-center gap-1">ถัดไป <ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => setOverduePage(overdueTotalPages - 1)} disabled={overduePage >= overdueTotalPages - 1} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50" title="หน้าสุดท้าย"><ChevronsRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
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