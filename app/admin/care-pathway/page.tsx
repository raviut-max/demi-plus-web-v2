// app/admin/care-pathway/page.tsx
// 🛤️ ภาพรวม Care Pathway ระดับระบบ (3 หมวด)
// หมวด 1: ตัวเลขภาพรวม (ผู้ป่วยในระบบ / มาตามนัด / เลยกำหนด / PAM เปลี่ยน ↑↓)
// หมวด 2: Watchlist ผู้ป่วยเลยกำหนด (คลิกขยาย + ปุ่มลัด)
// หมวด 3: สถิติการทำซ้ำ + เหตุผล (จากฟิลด์เดิม ไม่เพิ่มคอลัมน์)
// สิทธิ์: Super Admin เห็นทุก รพ. / บทบาทอื่นเห็นเฉพาะ getAccessibleHospitalIds
'use client';
import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, isSuperAdmin, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft, Loader2, Search, Users, Calendar, AlertTriangle, CalendarX,
  TrendingUp, TrendingDown, Route, ChevronDown, ChevronUp, X, Phone,
  Activity, Target, Sparkles, RefreshCw, Hospital, User as UserIcon,
  BarChart3, Eye, FileText
} from 'lucide-react';

// ---------- Types ----------
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  hospital_number: string;
  phone?: string | null;
  pam_level: string | null;
  hospital_id?: string | null;
  coach_id?: string | null;
  hospitals?: { name: string; type: string } | null;
}

// ---------- Helpers ----------
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const formatThaiDate = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return `${date.getDate()} ${THAI_MONTHS[date.getMonth()]} ${date.getFullYear() + 543}`;
};
const daysFromNow = (d: string | null) => {
  if (!d) return 0;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - a.getTime()) / 86400000);
};
const dayKey = (d: string | null | undefined) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA');
};

// โหลดข้อมูลตามรายการ id เป็นก้อน (กัน 1000 แถว)
async function fetchAll(table: string, select: string, userIds: string[], chunk = 50) {
  const out: any[] = [];
  for (let i = 0; i < userIds.length; i += chunk) {
    const batch = userIds.slice(i, i + chunk);
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(select).in('user_id', batch).range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}

type DrillRow = { label: string; sub: string };
type DrillData = { title: string; rows: DrillRow[] } | null;

function CarePathwayOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [screenings, setScreenings] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [dreams, setDreams] = useState<any[]>([]);
  const [coachNames, setCoachNames] = useState<Record<string, string>>({});

  // ฟิลเตอร์ (ตัวเลขทุกหมวดปรับตามนี้)
  const [searchTerm, setSearchTerm] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [coachFilter, setCoachFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'red' | 'orange' | 'yellow'>('all');

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillData>(null);

  // ---------- Auth + Load ----------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadAll(userData);
  }, [router]);

  const loadAll = async (userData: any) => {
    setLoading(true); setError(null);
    try {
      const hospitalIds = isSuperAdmin(userData) ? [] : await getAccessibleHospitalIds(userData.id);
      getUserHospitalInfo(userData.id).then(h => setUserHospital(h)).catch(() => {});

      let q = supabase.from('profiles')
        .select('id, first_name, last_name, hospital_number, phone, pam_level, hospital_id, coach_id, hospitals ( id, name, type )')
        .eq('is_active', true)
        .order('first_name', { ascending: true });
      if (hospitalIds.length > 0) q = q.in('hospital_id', hospitalIds);
      const { data: profData, error: e1 } = await q;
      if (e1) throw e1;
      const pList: Patient[] = (profData || []).map(p => ({
        ...p, full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      }));
      setPatients(pList);

      const ids = pList.map(p => p.id);
      if (ids.length === 0) { setLoading(false); return; }

      const [apts, fus, scr, gl, dr] = await Promise.all([
        fetchAll('appointments', 'id, user_id, appointment_date, appointment_type, status', ids),
        fetchAll('appointment_followups', 'id, user_id, appointment_id, followup_date, followup_round, weight, blood_sugar_dtx, confidence_score, followup_status, adaptation_summary, adaptation_obstacles, adaptation_opportunities, adaptation_other', ids),
        fetchAll('screenings', 'id, user_id, screening_date, pam_total_score, pam_level_result', ids),
        fetchAll('goals', 'id, user_id, goal_name, goal_name_th, target_days, round_number, status, created_at', ids),
        fetchAll('patient_dreams', 'id, user_id, dream_text, reason, status, method, selected_date', ids),
      ]);
      setAppointments(apts); setFollowups(fus); setScreenings(scr); setGoals(gl); setDreams(dr);

      // ชื่อโค้ช
      const coachIds = Array.from(new Set(pList.map(p => p.coach_id).filter(Boolean))) as string[];
      if (coachIds.length > 0) {
        const { data: docs } = await supabase.from('doctors').select('user_id, full_name_th').in('user_id', coachIds);
        const map: Record<string, string> = {};
        (docs || []).forEach((d: any) => { if (d.user_id) map[d.user_id] = d.full_name_th || 'ไม่ทราบชื่อ'; });
        setCoachNames(map);
      }
    } catch (e: any) {
      console.error('❌ [CarePathwayOverview]', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- ฟิลเตอร์ระดับผู้ป่วย ----------
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (hospitalFilter !== 'all' && p.hospital_id !== hospitalFilter) return false;
      if (coachFilter !== 'all' && p.coach_id !== coachFilter) return false;
      const t = searchTerm.trim().toLowerCase();
      if (t && !(p.full_name.toLowerCase().includes(t) || (p.hospital_number || '').toLowerCase().includes(t))) return false;
      return true;
    });
  }, [patients, hospitalFilter, coachFilter, searchTerm]);

  const scopedIds = useMemo(() => new Set(filteredPatients.map(p => p.id)), [filteredPatients]);
  const patientById = useMemo(() => {
    const m: Record<string, Patient> = {};
    patients.forEach(p => { m[p.id] = p; });
    return m;
  }, [patients]);

  // ---------- คำนวณกลาง: followup กับนัด ----------
  const fuByPatient = useMemo(() => {
    const m: Record<string, any[]> = {};
    followups.forEach(f => { if (!scopedIds.has(f.user_id)) return; (m[f.user_id] ||= []).push(f); });
    Object.values(m).forEach(list => list.sort((a, b) => new Date(b.followup_date) - new Date(a.followup_date)));
    return m;
  }, [followups, scopedIds]);

  const { onTimeList, lateList, overdueList } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const mEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).getTime();

    const onTime: string[] = [];
    const late: string[] = [];
    const overdue: any[] = [];
    const aptIdsWithFu = new Set(followups.map(f => f.appointment_id).filter(Boolean));

    appointments.forEach(apt => {
      if (!scopedIds.has(apt.user_id)) return;
      const ad = new Date(apt.appointment_date).getTime();
      const patientFus = fuByPatient[apt.user_id] || [];
      const linked = !!apt.id && aptIdsWithFu.has(apt.id);
      const sameDay = patientFus.some(f => dayKey(f.followup_date) && dayKey(f.followup_date) === dayKey(apt.appointment_date));
      const anyFu = linked || sameDay;

      if (ad >= mStart && ad <= mEnd) {
        if (anyFu && sameDay) { if (!onTime.includes(apt.user_id)) onTime.push(apt.user_id); }
        else if (anyFu && !sameDay) { if (!late.includes(apt.user_id)) late.push(apt.user_id); }
      }
      if (ad < today.getTime() && !anyFu) {
        overdue.push(apt);
      }
    });

    const perPatient: Record<string, any> = {};
    overdue.forEach(a => {
      const cur = perPatient[a.user_id];
      if (!cur || new Date(a.appointment_date) < new Date(cur.appointment_date)) perPatient[a.user_id] = a;
    });
    return { onTimeList: onTime, lateList: late, overdueList: Object.values(perPatient) };
  }, [appointments, followups, scopedIds, fuByPatient]);

  const overdueRows = useMemo(() => {
    return overdueList.map((apt: any) => {
      const p = patientById[apt.user_id];
      if (!p) return null;
      const overdueDays = daysFromNow(apt.appointment_date);
      const last = (fuByPatient[apt.user_id] || [])[0] || null;
      return { patient: p, appointment: apt, overdueDays, lastFollowup: last };
    }).filter(Boolean) as any[]
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }, [overdueList, patientById, fuByPatient]);

  const sevFiltered = useMemo(() => {
    if (severityFilter === 'all') return overdueRows;
    return overdueRows.filter(r =>
      severityFilter === 'red' ? r.overdueDays > 14 :
      severityFilter === 'orange' ? r.overdueDays >= 8 && r.overdueDays <= 14 :
      r.overdueDays <= 7);
  }, [overdueRows, severityFilter]);

  // ---------- PAM เปลี่ยนเดือนนี้ (แยก ↑/↓) ----------
  const pamChange = useMemo(() => {
    const scrByPatient: Record<string, any[]> = {};
    screenings.forEach(s => {
      if (!scopedIds.has(s.user_id) || s.pam_total_score == null) return;
      (scrByPatient[s.user_id] ||= []).push(s);
    });
    const today = new Date();
    const mStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const up: DrillRow[] = []; const down: DrillRow[] = [];
    Object.entries(scrByPatient).forEach(([uid, list]) => {
      list.sort((a, b) => new Date(a.screening_date) - new Date(b.screening_date));
      const cur = [...list].reverse().find(s => new Date(s.screening_date).getTime() >= mStart);
      if (!cur) return;
      const prev = [...list].reverse().find(s => new Date(s.screening_date).getTime() < new Date(cur.screening_date).getTime());
      if (!prev) return;
      const diff = (cur.pam_total_score || 0) - (prev.pam_total_score || 0);
      if (diff === 0) return;
      const p = patientById[uid];
      const row: DrillRow = {
        label: `${p?.full_name || '-'} (HN ${p?.hospital_number || '-'})`,
        sub: `${formatThaiDate(prev.screening_date)} ${prev.pam_total_score} → ${formatThaiDate(cur.screening_date)} ${cur.pam_total_score} (${diff > 0 ? '+' : ''}${diff})`,
      };
      (diff > 0 ? up : down).push(row);
    });
    return { up: up.length, down: down.length, upRows: up, downRows: down };
  }, [screenings, scopedIds, patientById]);

  // ---------- หมวด 3: สถิติทำซ้ำ ----------
  const repeatStats = useMemo(() => {
    const scrCount: Record<string, number> = {};
    screenings.forEach(s => { if (scopedIds.has(s.user_id)) scrCount[s.user_id] = (scrCount[s.user_id] || 0) + 1; });

    const goalRounds: Record<string, Set<number>> = {};
    const goalByPatientName: Record<string, Record<string, any[]>> = {};
    goals.forEach(g => {
      if (!scopedIds.has(g.user_id)) return;
      (goalRounds[g.user_id] ||= new Set()).add(g.round_number || 1);
      ((goalByPatientName[g.user_id] ||= {})[g.goal_name] ||= []).push(g);
    });

    const difficultyRows: DrillRow[] = [];
    Object.entries(goalByPatientName).forEach(([uid, byName]) => {
      const p = patientById[uid];
      Object.entries(byName).forEach(([name, rows]) => {
        rows.sort((a, b) => (a.round_number || 1) - (b.round_number || 1));
        if (rows.length < 2) return;
        const first = rows[0].target_days, last = rows[rows.length - 1].target_days;
        if (first != null && last != null && first !== last) {
          difficultyRows.push({ label: `${p?.full_name || '-'} (HN ${p?.hospital_number || '-'})`, sub: `${rows[0].goal_name_th || name}: ${first} → ${last} วัน/สัปดาห์` });
        }
      });
    });

    const dreamHistory = dreams.filter(d => scopedIds.has(d.user_id) && d.status === 'history');
    const followCount: Record<string, number> = {};
    followups.forEach(f => { if (scopedIds.has(f.user_id)) followCount[f.user_id] = (followCount[f.user_id] || 0) + 1; });

    const donePatients = (m: Record<string, number>) => Object.keys(m).length;
    const repeatPatients = (m: Record<string, number>) => Object.values(m).filter(n => n >= 2).length;

    return {
      stage1: { done: donePatients(scrCount), repeat: repeatPatients(scrCount) },
      stage2: { done: dreams.some(d => d.status === 'active' && scopedIds.has(d.user_id)) ?
        new Set(dreams.filter(d => scopedIds.has(d.user_id)).map(d => d.user_id)).size : 0,
        repeat: new Set(dreamHistory.map(d => d.user_id)).size },
      stage4: {
        done: Object.keys(goalRounds).length,
        repeat: Object.values(goalRounds).filter(s => s.size >= 2).length,
      },
      stage6: { done: donePatients(followCount), repeat: repeatPatients(followCount) },
      difficultyRows,
      dreamHistory,
    };
  }, [screenings, goals, dreams, followups, scopedIds, patientById]);

  // ---------- หมวด 3B: เหตุผล (ฟิลด์เดิม) ----------
  const reasonStats = useMemo(() => {
    const count = (pred: (f: any) => boolean) =>
      followups.filter(f => scopedIds.has(f.user_id) && pred(f)).length;
    const bars = [
      { key: 'obstacles', label: 'พบอุปสรรค/ความกังวล', color: 'bg-red-500',
        n: count(f => f.adaptation_summary === 'obstacles'),
        rows: followups.filter(f => scopedIds.has(f.user_id) && f.adaptation_summary === 'obstacles')
          .map(f => ({ label: patientById[f.user_id]?.full_name || '-', sub: formatThaiDate(f.followup_date) + ' · ' + (f.adaptation_obstacles || '(ไม่มีรายละเอียด)')) })) },
      { key: 'opportunities', label: 'พบโอกาส', color: 'bg-green-500',
        n: count(f => f.adaptation_summary === 'opportunities'),
        rows: followups.filter(f => scopedIds.has(f.user_id) && f.adaptation_summary === 'opportunities')
          .map(f => ({ label: patientById[f.user_id]?.full_name || '-', sub: formatThaiDate(f.followup_date) + ' · ' + (f.adaptation_opportunities || '(ไม่มีรายละเอียด)')) })) },
      { key: 'other', label: 'อื่นๆ', color: 'bg-gray-400',
        n: count(f => f.adaptation_summary === 'other'),
        rows: followups.filter(f => scopedIds.has(f.user_id) && f.adaptation_summary === 'other')
          .map(f => ({ label: patientById[f.user_id]?.full_name || '-', sub: formatThaiDate(f.followup_date) + ' · ' + (f.adaptation_other || '(ไม่มีรายละเอียด)')) })) },
      { key: 'needs_improvement', label: 'สถานะต้องปรับปรุง', color: 'bg-orange-500',
        n: count(f => f.followup_status === 'needs_improvement'),
        rows: followups.filter(f => scopedIds.has(f.user_id) && f.followup_status === 'needs_improvement')
          .map(f => ({ label: patientById[f.user_id]?.full_name || '-', sub: `ติดตามครั้งที่ ${f.followup_round || '-'} · ${formatThaiDate(f.followup_date)}` })) },
      { key: 'monitoring', label: 'สถานะเฝ้าระวัง', color: 'bg-rose-500',
        n: count(f => f.followup_status === 'monitoring'),
        rows: followups.filter(f => scopedIds.has(f.user_id) && f.followup_status === 'monitoring')
          .map(f => ({ label: patientById[f.user_id]?.full_name || '-', sub: `ติดตามครั้งที่ ${f.followup_round || '-'} · ${formatThaiDate(f.followup_date)}` })) },
      { key: 'difficulty', label: 'ปรับความยากเป้าหมาย', color: 'bg-blue-500',
        n: repeatStats.difficultyRows.length, rows: repeatStats.difficultyRows },
      { key: 'dream', label: 'เลือกความฝันใหม่', color: 'bg-purple-500',
        n: repeatStats.dreamHistory.length,
        rows: repeatStats.dreamHistory.map(d => ({ label: patientById[d.user_id]?.full_name || '-', sub: `"${d.dream_text}"` + (d.reason ? ` — ${d.reason}` : '') })) },
    ];
    return bars.filter(b => b.n > 0).sort((a, b) => b.n - a.n);
  }, [followups, scopedIds, patientById, repeatStats]);

  const totalAppointmentsThisMonth = useMemo(() => {
    const today = new Date();
    const mStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const mEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).getTime();
    return appointments.filter(a => scopedIds.has(a.user_id) &&
      new Date(a.appointment_date).getTime() >= mStart && new Date(a.appointment_date).getTime() <= mEnd).length;
  }, [appointments, scopedIds]);

  const hospitalOptions = useMemo(() => {
    const m: Record<string, string> = {};
    patients.forEach(p => { if (p.hospital_id && p.hospitals?.name) m[p.hospital_id] = p.hospitals.name; });
    return Object.entries(m);
  }, [patients]);
  const coachOptions = useMemo(() => {
    const ids = Array.from(new Set(patients.map(p => p.coach_id).filter(Boolean))) as string[];
    return ids.map(id => [id, coachNames[id] || 'ไม่ทราบชื่อ']);
  }, [patients, coachNames]);

  const drillFor = (title: string, rows: DrillRow[]) => {
    if (rows.length === 0) return;
    setDrill({ title, rows });
  };

  // ---------- Render ----------
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-12 h-12 animate-spin text-blue-500" /></div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-center p-6">
      <div className="max-w-md"><p className="text-red-600 mb-4">❌ {error}</p>
        <button onClick={() => loadAll(user)} className="px-6 py-2 bg-blue-500 text-white rounded-lg">ลองใหม่</button></div>
    </div>
  );

  const openMax = Math.max(...reasonStats.map(b => b.n), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center"><Route className="w-5 h-5 text-indigo-600" /></div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">🛤️ ภาพรวมเส้นทางสุขภาพผู้ป่วย</h1>
                <p className="text-sm text-gray-500">ทุกตัวเลขปรับตามฟิลเตอร์และสิทธิ์โรงพยาบาลของคุณ</p>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-semibold text-gray-700">{user.full_name_th}</span>
                {userHospital?.name && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">🏥 {userHospital.name}</span>}
              </div>
            )}
          </div>
          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ค้นหา HN / ชื่อ..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
            </div>
            <select value={hospitalFilter} onChange={e => setHospitalFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="all">โรงพยาบาลทั้งหมด</option>
              {hospitalOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <select value={coachFilter} onChange={e => setCoachFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="all">โค้ชทั้งหมด</option>
              {coachOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <button onClick={() => { setSearchTerm(''); setHospitalFilter('all'); setCoachFilter('all'); setSeverityFilter('all'); }}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700">ล้างฟิลเตอร์</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* ===== หมวด 1 ===== */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-3">📊 1. ตัวเลขภาพรวม</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-2 text-blue-600 mb-1"><Users className="w-5 h-5" /><span className="text-sm font-medium">ผู้ป่วยในระบบ</span></div>
              <p className="text-3xl font-bold text-gray-800">{filteredPatients.length}</p>
              <p className="text-xs text-gray-500 mt-1">คน (สิทธิ์ที่เข้าถึง + ฟิลเตอร์)</p>
            </div>
            <button onClick={() => drillFor('ผู้ป่วยที่มาตามนัด (เดือนนี้ — วันติดตามตรงวันนัด)', onTimeList.map(uid => ({ label: patientById[uid]?.full_name || '-', sub: `HN ${patientById[uid]?.hospital_number || '-'}` })))}
              className="bg-white rounded-xl border shadow-sm p-5 text-left hover:ring-2 hover:ring-green-300 transition-all">
              <div className="flex items-center gap-2 text-green-600 mb-1"><Calendar className="w-5 h-5" /><span className="text-sm font-medium">มาตามนัด (เดือนนี้)</span></div>
              <p className="text-3xl font-bold text-gray-800">{onTimeList.length}<span className="text-base text-gray-400 font-semibold">/{totalAppointmentsThisMonth}</span></p>
              <p className="text-xs text-gray-500 mt-1">นัดเดือนนี้มีทั้งหมด {totalAppointmentsThisMonth} ครั้ง · {totalAppointmentsThisMonth ? Math.round(onTimeList.length / totalAppointmentsThisMonth * 100) : 0}%</p>
            </button>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-2 text-red-600 mb-1"><CalendarX className="w-5 h-5" /><span className="text-sm font-medium">เลยกำหนด</span></div>
              <p className="text-3xl font-bold text-red-600">{overdueRows.length}</p>
              <p className="text-xs text-gray-500 mt-1">{lateList.length > 0 ? `+ ${lateList.length} คนติดตามไม่ตรงวัน` : 'ยังไม่มีการติดตามไม่ตรงนัด'}</p>
              <button onClick={() => document.getElementById('watchlist')?.scrollIntoView({ behavior: 'smooth' })} className="text-xs text-blue-600 font-medium mt-1 hover:underline">ดูรายชื่อ ↓</button>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-2 text-indigo-600 mb-1"><Activity className="w-5 h-5" /><span className="text-sm font-medium">PAM เปลี่ยนเดือนนี้</span></div>
              <div className="flex gap-4">
                <button onClick={() => drillFor('PAM เพิ่มขึ้นเดือนนี้', pamChange.upRows)} className="flex items-center gap-1 text-green-600 hover:underline"><TrendingUp className="w-5 h-5" /><span className="text-2xl font-bold">{pamChange.up}</span></button>
                <button onClick={() => drillFor('PAM ถดถอยลงเดือนนี้', pamChange.downRows)} className="flex items-center gap-1 text-red-600 hover:underline"><TrendingDown className="w-5 h-5" /><span className="text-2xl font-bold">{pamChange.down}</span></button>
              </div>
              <p className="text-xs text-gray-500 mt-1">เทียบคะแนนล่าสุดของเดือนนี้กับครั้งก่อน</p>
            </div>
          </div>
        </section>

        {/* ===== หมวด 2 ===== */}
        <section id="watchlist">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> 2. ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด)</h2>
            <div className="flex gap-2">
              {([['all', 'ทั้งหมด', 'bg-gray-100'], ['yellow', '🟡 1-7 วัน', 'bg-yellow-100'], ['orange', '🟠 8-14 วัน', 'bg-orange-100'], ['red', '🔴 &gt;14 วัน', 'bg-red-100']] as const).map(([k, l, c]) => (
                <button key={k} onClick={() => setSeverityFilter(k as any)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${severityFilter === k ? 'ring-2 ring-blue-500 ' : ''}${c} text-gray-700`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">ผู้ป่วย / HN</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">นัดเมื่อ</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">เกิน</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">ติดตามล่าสุด</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">รพ. / โค้ช</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sevFiltered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">🎉 ไม่มีผู้ป่วยเลยกำหนดในขอบเขตนี้</td></tr>
                  ) : sevFiltered.map(({ patient: p, appointment: apt, overdueDays, lastFollowup }) => {
                    const isOpen = expandedRow === p.id;
                    const sev = overdueDays > 14 ? 'bg-red-100 text-red-700' : overdueDays >= 8 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700';
                    return (
                      <Fragment key={p.id}>
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedRow(isOpen ? null : p.id)}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{p.full_name}</p>
                            <p className="text-xs text-gray-500 font-mono">HN {p.hospital_number || '-'}</p>
                          </td>
                          <td className="px-4 py-3">{formatThaiDate(apt.appointment_date)}</td>
                          <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs font-bold ${sev}`}>{overdueDays} วัน</span></td>
                          <td className="px-4 py-3">{lastFollowup ? formatThaiDate(lastFollowup.followup_date) : <span className="text-gray-400">ยังไม่มี</span>}</td>
                          <td className="px-4 py-3">
                            <p className="text-xs">{p.hospitals?.name || '-'}</p>
                            <p className="text-xs text-gray-500">โค้ช: {p.coach_id ? coachNames[p.coach_id] || '-' : '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-center"><ChevronDown className={`w-4 h-4 inline text-gray-400 ${isOpen ? 'rotate-180' : ''}`} /></td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="grid md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-semibold text-gray-700 mb-1">นัดหมาย: {apt.appointment_type || 'ติดตามผล'} · สถานะ {apt.status}</p>
                                  <p className="text-gray-600">โทร: {p.phone || 'ไม่ระบุ'} <a href={`tel:${p.phone}`} className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-1"><Phone className="w-3 h-3" />โทรเลย</a></p>
                                  {lastFollowup && (
                                    <div className="mt-2 bg-white border rounded-lg p-3">
                                      <p className="font-semibold text-gray-700">ติดตามล่าสุด:</p>
                                      <p className="text-gray-600 text-xs">ครั้งที่ {lastFollowup.followup_round} · น้ำหนัก {lastFollowup.weight ?? '-'} กก. · น้ำตาล {lastFollowup.blood_sugar_dtx ?? '-'} · มั่นใจ {lastFollowup.confidence_score ?? '-'}/10 · {lastFollowup.followup_status}</p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2 items-start">
                                  <button onClick={() => router.push(`/admin/appointments/followup/new?patient_id=${p.id}&appointment_id=${apt.id}`)} className="px-4 py-2 bg-purple-500 text-white rounded-lg text-xs font-semibold">➕ บันทึกการติดตาม</button>
                                  <button onClick={() => router.push(`/admin/patients/${p.id}/care-pathway`)} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold">🛤️ Care Pathway รายบุคคล</button>
                                  <button onClick={() => router.push(`/admin/patients/${p.id}`)} className="px-4 py-2 bg-white border rounded-lg text-xs text-gray-700">👁️ รายละเอียดผู้ป่วย</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ===== หมวด 3 ===== */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-3">🔁 3. สถิติการทำซ้ำและเหตุผล (จากฟิลด์เดิมของระบบ)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-3">ก) จำนวนผู้ป่วยที่ "ทำซ้ำ" (≥2 ครั้ง/รอบ) รายขั้น</h3>
              {[
                { icon: UserIcon, label: '① รู้จักตัวเอง', s: repeatStats.stage1 },
                { icon: Sparkles, label: '② ความฝันของฉัน', s: repeatStats.stage2 },
                { icon: Target, label: '④ เป้าหมายและแผน', s: repeatStats.stage4 },
                { icon: RefreshCw, label: '⑥ ติดตามต่อเนื่อง', s: repeatStats.stage6 },
              ].map(({ icon: Icon, label, s }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="flex items-center gap-2 text-sm text-gray-700"><Icon className="w-4 h-4 text-indigo-500" /> {label}</span>
                  <span className="text-sm"><b className="text-blue-600">{s.done}</b> ทำแล้ว · <b className="text-purple-600">{s.repeat}</b> ทำซ้ำ</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-3">ข) เหตุผลที่ทำ / ทำซ้ำ (คลิกแท่งเพื่อดูรายชื่อ)</h3>
              {reasonStats.length === 0 ? <p className="text-sm text-gray-400">ยังไม่มีข้อมูลเหตุผล</p> :
                reasonStats.map(b => (
                  <button key={b.key} onClick={() => drillFor(b.label, b.rows)} className="w-full text-left mb-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1"><span>{b.label}</span><span>{b.n}</span></div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${b.color} rounded-full transition-all`} style={{ width: `${(b.n / openMax) * 100}%` }} /></div>
                  </button>
                ))}
            </div>
          </div>
        </section>
      </div>

      {/* Drill Modal */}
      {drill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-gray-800">{drill.title} ({drill.rows.length})</h3>
              <button onClick={() => setDrill(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="divide-y">
              {drill.rows.map((r, i) => (
                <div key={i} className="p-4"><p className="font-medium text-gray-800 text-sm">{r.label}</p><p className="text-xs text-gray-500 mt-0.5">{r.sub}</p></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Fragment } from 'react';

export default function CarePathwayOverviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-blue-500" /></div>}>
      <CarePathwayOverviewContent />
    </Suspense>
  );
}