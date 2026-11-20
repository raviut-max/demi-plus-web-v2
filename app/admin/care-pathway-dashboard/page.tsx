// app/admin/patients/[id]/care-pathway/page.tsx
// ✅ แก้ไขล่าสุด: 19 พฤศจิกายน 2569
// ✅ การปรับปรุงความเร็ว:
//    1. ✅ ใช้ select เฉพาะฟิลด์ที่จำเป็น (ไม่ดึง * ทั้งหมด)
//    2. ✅ เพิ่ม limit ให้ชัดเจน
//    3. ✅ ใช้ Promise.all แบบ parallel (โหลดพร้อมกัน)
//    4. ✅ เพิ่ม error handling ที่ดีขึ้น
'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Route, UserCheck, Sparkles, Target, Loader2, Eye, Edit, Plus,
  Users, Building2, AlertCircle, FileText, Clock, CheckCircle2, History, Activity
} from 'lucide-react';

const formatThaiDate = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear() + 543}`;
};

type StageStatus = 'done' | 'active' | 'pending';

interface PathEvent {
  key: string;
  date: string | null;
  title: string;
  detail: string;
}

interface CareStage {
  id: string;
  no: number;
  title: string;
  description: string;
  icon: any;
  status: StageStatus;
  events: PathEvent[];
  actionLabel: string;
  actionUrl: (pid: string) => string;
  historyLabel: string;
  historyUrl: (pid: string) => string;
}

const STAGE_META = [
  {
    id: 'self', no: 1, title: 'รู้จักตัวเอง',
    description: 'ทำแบบประเมิน PAM / PROMS — แจ้งจำนวนครั้งที่ทำแล้ว และเพิ่มรอบใหม่ได้',
    icon: UserCheck,
    actionLabel: '➕ เพิ่มรอบทำแบบประเมิน',
    actionUrl: (p: string) => `/admin/screening?patient_id=${p}`,
    historyLabel: '📋 ดูประวัติการประเมิน',
    historyUrl: (p: string) => `/admin/patients/${p}/screening-history`,
  },
  {
    id: 'dream', no: 2, title: 'ความฝันของฉัน',
    description: 'ชี้ไปที่การทำความฝัน — เลือกการ์ดความฝัน บันทึก และดูย้อนหลังได้',
    icon: Sparkles,
    actionLabel: '➕ เลือกความฝันใหม่',
    actionUrl: (p: string) => `/admin/patients/${p}/dream`,
    historyLabel: '📋 ดูความฝันของฉัน',
    historyUrl: (p: string) => `/admin/patients/${p}/dream`,
  },
  {
    id: 'oneday', no: 3, title: 'ชีวิต 1 วันของฉัน',
    description: 'สรุปกิจวัตรรายวันที่ผู้ป่วยบันทึก แยกตามระดับ PAM Level (L2/L3 หรือ L4)',
    icon: Activity,
    actionLabel: '➕ ดูสรุปชีวิต 1 วัน',
    actionUrl: (p: string) => `/admin/patients/${p}/oneday?from=care-pathway`,
    historyLabel: '📋 ดูย้อนหลัง',
    historyUrl: (p: string) => `/admin/patients/${p}/oneday?from=care-pathway`,
  },
  {
    id: 'goals', no: 4, title: 'เป้าหมายและแผนสุขภาพ',
    description: 'ตั้งเป้าหมายสุขภาพและแผนการปฏิบัติ — บันทึกเป็นรอบและดูประวัติได้',
    icon: Target,
    actionLabel: '➕ จัดการเป้าหมาย',
    actionUrl: (p: string) => `/admin/patients/${p}/goals?from=care-pathway`,
    historyLabel: '📋 ดูประวัติเป้าหมาย',
    historyUrl: (p: string) => `/admin/patients/${p}/goals?from=care-pathway`,
  },
  {
    id: 'trial', no: 5, title: 'ทดลองทำ',
    description: 'ประวัติการทำตามเป้าหมาย — บันทึกกิจกรรมรายวัน (ทำได้/ไม่ได้ + หมายเหตุ)',
    icon: History,
    actionLabel: '➕ ดูบันทึกกิจกรรม',
    actionUrl: (p: string) => `/admin/patients/${p}/goals`,
    historyLabel: '📋 ดูประวัติการทำ',
    historyUrl: (p: string) => `/admin/patients/${p}/goals`,
  },
  {
    id: 'follow', no: 6, title: 'ติดตามต่อเนื่อง',
    description: 'การตามผลต่อเนื่อง — บันทึกน้ำหนัก ความดัน น้ำตาล ความมั่นใจ และแผนปฏิบัติ',
    icon: FileText,
    actionLabel: '➕ บันทึกการติดตามผล',
    actionUrl: (p: string) => `/admin/appointments/followup/new?patient_id=${p}`,
    historyLabel: '📋 ดูประวัติการติดตามผล',
    historyUrl: (p: string) => `/admin/patients/${p}/followup-history?from=care-pathway`,
  },
];

const STATUS_UI: Record<StageStatus, { label: string; badge: string; circle: string; card: string }> = {
  done:    { label: 'เสร็จสิ้น',       badge: 'bg-green-100 text-green-700',   circle: 'bg-green-500 text-white',   card: 'bg-green-50/60 border-green-200' },
  active:  { label: 'กำลังดำเนินการ',  badge: 'bg-blue-100 text-blue-700',     circle: 'bg-blue-500 text-white',    card: 'bg-blue-50/60 border-blue-300' },
  pending: { label: 'รอเริ่ม',         badge: 'bg-gray-100 text-gray-500',     circle: 'bg-gray-200 text-gray-500', card: 'bg-white border-gray-200' },
};

function buildStages(screenings: any[], dreams: any[], goals: any[], records: any[], followups: any[]): CareStage[] {
  const uniqueDays = new Set(records.map(r => (r.record_date || '').slice(0, 10)).filter(Boolean)).size;
  const eventsByStage: Record<string, PathEvent[]> = {
    self: screenings.map((s, i) => ({
      key: `scr-${s.id ?? i}`,
      date: s.screening_date,
      title: `แบบประเมินครั้งที่ ${i + 1}`,
      detail: `PAM: ${s.pam_total_score ?? '-'} | Level: ${s.pam_level_result || '-'} | Zone: ${s.proms_zone || '-'}`,
    })),
    dream: dreams.map((d, i) => ({
      key: `drm-${d.id ?? i}`,
      date: d.selected_date,
      title: d.status === 'active' ? `ความฝันปัจจุบัน: "${d.dream_text}"` : `ความฝันเดิม: "${d.dream_text}"`,
      detail: [
        d.intention ? `🎯 ${d.intention}` : '',
        d.confidence != null ? `ความมั่นใจ ${d.confidence}/10` : '',
        d.method === 'paper' ? `📷 แบบกระดาษ ${d.image_urls?.length || 0} รูป` : '🅰️ ออนไลน์',
      ].filter(Boolean).join(' | ') || '-',
    })),
    oneday: uniqueDays > 0 ? [{
      key: 'oneday-summary',
      date: records[0]?.record_date || null,
      title: `มีการบันทึกกิจกรรมแล้ว ${uniqueDays} วัน`,
      detail: 'กดปุ่มด้านล่างเพื่อดูรายละเอียดแยกตามหมวดหมู่และวันที่',
    }] : [],
    goals: (() => {
      const roundsMap = new Map<number, any[]>();
      goals.forEach(g => {
        const round = g.round_number || 1;
        if (!roundsMap.has(round)) roundsMap.set(round, []);
        roundsMap.get(round)!.push(g);
      });
      return Array.from(roundsMap.entries())
        .sort(([a], [b]) => b - a)
        .map(([round, goalsList]) => ({
          key: `goal-round-${round}`,
          date: goalsList[0]?.created_at,
          title: `รอบที่ ${round} — ${goalsList.length} กิจกรรม`,
          detail: [
            goalsList[0]?.primary_goal_note ? `📝 ${goalsList[0].primary_goal_note}` : '',
            goalsList[0]?.weekly_goal_note ? `📋 ${goalsList[0].weekly_goal_note}` : '',
            `กิจกรรม: ${goalsList.map(g => g.goal_name_th).join(', ')}`,
          ].filter(Boolean).join(' | ') || '-',
        }));
    })(),
    trial: (() => {
      const byDate = new Map<string, any[]>();
      records.forEach(r => {
        const d = (r.record_date || '').slice(0, 10);
        if (!d) return;
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d)!.push(r);
      });
      return Array.from(byDate.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 14)
        .map(([date, list]) => {
          const done = list.filter(r => r.is_completed);
          const notDone = list.filter(r => !r.is_completed);
          const nameOf = (r: any) => r.activities?.activity_name_th || r.goal_name_th || r.goal_name || '-';
          const notes = list.map(r => r.notes).filter(Boolean).join(' / ');
          return {
            key: `rec-${date}`,
            date,
            title: `ทำกิจกรรม ${done.length}/${list.length} รายการ`,
            detail: [
              done.length > 0 ? `✓ ${done.map(nameOf).join(', ')}` : '',
              notDone.length > 0 ? `✗ ${notDone.map(nameOf).join(', ')}` : '',
              notes ? `📝 ${notes}` : '',
            ].filter(Boolean).join('  |  ') || '-',
          };
        });
    })(),
    follow: followups.map((f, i, arr) => {
      const no = arr.length - i;
      const bp = (f.blood_pressure_sys && f.blood_pressure_dia) ? `${f.blood_pressure_sys}/${f.blood_pressure_dia}` : null;
      return {
        key: `fu-${f.id ?? i}`,
        date: f.followup_date,
        title: `ติดตามผลครั้งที่ ${no}`,
        detail: [
          f.weight != null ? `⚖️ ${f.weight} กก.` : '',
          f.waist_circumference != null ? `รอบเอว ${f.waist_circumference} ซม.` : '',
          bp ? `🩸 BP ${bp}` : '',
          f.blood_sugar_dtx != null ? `🍬 น้ำตาล ${f.blood_sugar_dtx}` : '',
          f.confidence_score != null ? `💪 มั่นใจ ${f.confidence_score}/10` : '',
        ].filter(Boolean).join(' | ') || '-',
      };
    }),
  };

  const doneFlags = [
    screenings.length > 0,
    dreams.some(d => d.status === 'active'),
    uniqueDays > 0,
    goals.length > 0,
    records.length > 0,
    followups.length > 0,
  ];
  const firstIncomplete = doneFlags.indexOf(false);
  
  return STAGE_META.map((m, i) => {
    const status: StageStatus = doneFlags[i] ? 'done' : (i === firstIncomplete ? 'active' : 'pending');
    return { ...m, status, events: eventsByStage[m.id] || [] };
  });
}

function CarePathwayContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;

  const fromParam = searchParams.get('from');
  const [fromSource, setFromSource] = useState<string>('patients');

  useEffect(() => {
    if (fromParam) {
      sessionStorage.setItem('care_pathway_from', fromParam);
      setFromSource(fromParam);
    } else {
      const saved = sessionStorage.getItem('care_pathway_from');
      setFromSource(saved || 'patients');
    }
  }, [fromParam]);

  const handleBack = () => {
    if (fromSource === 'care-pathway-dashboard') {
      router.push('/admin/care-pathway-dashboard');
    } else {
      router.push('/admin/patients');
    }
  };

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [stages, setStages] = useState<CareStage[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<'none' | 'notfound' | 'denied'>('none');
  const [errorDetail, setErrorDetail] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
  }, [router]);

  const load = useCallback(async () => {
    if (!user || !patientId) return;
    setLoading(true);
    const t0 = performance.now();
    
    try {
      // ✅ ดึงข้อมูลผู้ป่วย (เฉพาะฟิลด์ที่จำเป็น)
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number, pam_level, zone, age, bmi, hospital_id, coach_id')
        .eq('id', patientId)
        .maybeSingle();
      
      if (e1) throw new Error('profiles: ' + e1.message);
      if (!prof) { 
        setErrorDetail(`ไม่พบผู้ป่วย id: ${patientId}`); 
        setErrorState('notfound'); 
        return; 
      }
      
      if (!isSuperAdmin(user)) {
        const ids = await getAccessibleHospitalIds(user.id);
        if (prof.hospital_id && !ids.includes(prof.hospital_id)) { 
          setErrorState('denied'); 
          return; 
        }
      }

      // ✅ โหลดข้อมูลทั้งหมดแบบ parallel (พร้อมกัน)
      const [hospRes, uRes, coachRes, scrRes, drmRes, goalsRes, recRes, fuRes] = await Promise.all([
        prof.hospital_id
          ? supabase.from('hospitals').select('id, name, type').eq('id', prof.hospital_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('users').select('id_card').eq('id', patientId).maybeSingle(),
        prof.coach_id
          ? supabase.from('doctors').select('full_name_th').eq('user_id', prof.coach_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        // ✅ screenings: ดึงเฉพาะฟิลด์ที่จำเป็น + limit
        supabase.from('screenings')
          .select('id, screening_date, pam_total_score, pam_level_result, proms_zone')
          .eq('user_id', patientId)
          .order('screening_date', { ascending: true })
          .limit(50),
        // ✅ dreams: ดึงเฉพาะฟิลด์ที่จำเป็น
        supabase.from('patient_dreams')
          .select('id, selected_date, status, dream_text, intention, confidence, method, image_urls')
          .eq('user_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20),
        // ✅ goals: ดึงเฉพาะฟิลด์ที่จำเป็น
        supabase.from('goals')
          .select('id, round_number, created_at, goal_name_th, primary_goal_note, weekly_goal_note')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .in('status', ['active', 'archived'])
          .order('round_number', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
        // ✅ records: ดึงเฉพาะฟิลด์ที่จำเป็น + limit
        supabase.from('records')
          .select('id, record_date, is_completed, notes, activity_id, activities(activity_code, activity_name_th)')
          .eq('user_id', patientId)
          .order('record_date', { ascending: false })
          .limit(120),
        // ✅ followups: ดึงเฉพาะฟิลด์ที่จำเป็น + limit
        supabase.from('appointment_followups')
          .select('id, followup_date, weight, waist_circumference, blood_pressure_sys, blood_pressure_dia, blood_sugar_dtx, confidence_score')
          .eq('user_id', patientId)
          .order('followup_date', { ascending: false })
          .limit(30),
      ]);

      if (drmRes.error) console.warn('[CarePathway] patient_dreams:', drmRes.error.message);
      if (goalsRes.error) console.warn('[CarePathway] goals:', goalsRes.error.message);
      if (recRes.error) console.warn('[CarePathway] records:', recRes.error.message);
      if (fuRes.error) console.warn('[CarePathway] appointment_followups:', fuRes.error.message);

      setRecords(recRes.data || []);
      const p = {
        ...prof,
        hospitals: hospRes.data || null,
        users: uRes.data || null,
        coach_name: coachRes.data?.full_name_th || '-',
      };
      setPatient(p);
      
      const built = buildStages(
        scrRes.data || [], 
        drmRes.data || [], 
        goalsRes.data || [], 
        recRes.data || [], 
        fuRes.data || []
      );
      setStages(built);
      setExpanded(built.filter(s => s.status !== 'pending').map(s => s.id));
      setErrorState('none');
      setErrorDetail('');
      
      const t1 = performance.now();
      console.log(`✅ [CarePathway] Loaded in ${(t1 - t0).toFixed(0)}ms`);
    } catch (e: any) {
      console.error('❌ [CarePathway]', e);
      setErrorDetail(e?.message || String(e));
      setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const uniqueDays = new Set(records.map(r => (r.record_date || '').slice(0, 10)).filter(Boolean)).size;
  const trialStats = (() => {
    const total = records.length;
    const done = records.filter(r => r.is_completed).length;
    const days = uniqueDays;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, days, pct };
  })();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดเส้นทางดูแลสุขภาพ...</p>
        </div>
      </div>
    );
  }

  if (errorState !== 'none' || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-lg">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-300" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {errorState === 'denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ป่วยนี้' : 'ไม่พบข้อมูลผู้ป่วย'}
          </h2>
          {errorDetail && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
              <p className="text-xs font-semibold text-red-600 mb-1">รายละเอียดข้อผิดพลาด:</p>
              <p className="text-xs text-red-700 font-mono break-all">{errorDetail}</p>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={() => load()} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">ลองใหม่</button>
            <button onClick={handleBack} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">กลับ</button>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = stages.filter(s => s.status === 'done').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-3">
            <ArrowLeft className="w-4 h-4" />
            {fromSource === 'care-pathway-dashboard' ? 'กลับภาพรวม Care Pathway' : 'กลับหน้าผู้ป่วย'}
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <Route className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">เส้นทางสุขภาพผู้ป่วย (Care Pathway)</h1>
                <p className="text-sm text-gray-500">แต่ละขั้นชี้ไปทำกิจกรรมของตัวเอง — ทำซ้ำได้</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
              สำเร็จ {doneCount}/{stages.length} ขั้นตอน
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Patient Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 border">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-800">{patient.first_name} {patient.last_name}</h2>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-1 bg-gray-100 rounded-full">HN: {patient.hospital_number || '-'}</span>
                <span className="px-2 py-1 bg-gray-100 rounded-full font-mono">ID: {patient.users?.id_card || '-'}</span>
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">PAM: {patient.pam_level || 'L0'}</span>
                <span className={`px-2 py-1 rounded-full ${
                  patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                  patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {patient.zone || 'Green Zone'}
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">โค้ช: {patient.coach_name}</span>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  {patient.hospitals?.name || '-'}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  อายุ {patient.age || '-'} ปี | BMI {patient.bmi || '-'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => router.push(`/admin/patients/${patient.id}`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด">
                <Eye className="w-5 h-5" />
              </button>
              <button onClick={() => router.push(`/admin/patients/${patient.id}/edit`)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="แก้ไข">
                <Edit className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Stages */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">ขั้นตอนการดูแลสุขภาพ (Care Pathway)</h3>
          <p className="text-sm text-gray-500 mb-4">แต่ละขั้นมีปุ่มไปทำกิจกรรมของตัวเอง + ดูย้อนหลังได้</p>
          <div className="space-y-3">
            {stages.map((stage) => {
              const ui = STATUS_UI[stage.status];
              const Icon = stage.icon;
              const isOpen = expanded.includes(stage.id);
              return (
                <div key={stage.id} className={`rounded-xl border shadow-sm ${ui.card}`}>
                  <button onClick={() => toggle(stage.id)} className="w-full flex items-center gap-4 p-4 text-left">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 ${ui.circle}`}>
                      {stage.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : stage.no}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon className="w-4 h-4 text-gray-600 shrink-0" />
                        <span className="font-semibold text-gray-800">{stage.no}. {stage.title}</span>
                        {stage.events.length > 0 && (
                          <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
                            {stage.id === 'self' ? `ทำแบบประเมินแล้ว ${stage.events.length} ครั้ง` :
                             stage.id === 'dream' ? `บันทึกความฝัน ${stage.events.length} ครั้ง` :
                             stage.id === 'oneday' ? `บันทึกแล้ว ${uniqueDays} วัน` :
                             stage.id === 'goals' ? `${stage.events.length} รอบเป้าหมาย` :
                             stage.id === 'trial' ? `บันทึกแล้ว ${stage.events.length} วัน` :
                             stage.id === 'follow' ? `ตามผลแล้ว ${stage.events.length} ครั้ง` :
                             `${stage.events.length} รายการ`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{stage.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${ui.badge}`}>
                      {ui.label}
                    </span>
                    <span className="text-gray-400 text-sm shrink-0">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  
                  {isOpen && (
                    <div className="px-4 pb-4 pl-16">
                      {stage.id === 'trial' && trialStats.total > 0 && (
                        <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-white border rounded-lg p-2 text-center">
                            <p className="text-[10px] text-gray-500">บันทึกทั้งหมด</p>
                            <p className="text-lg font-bold text-gray-800">{trialStats.total}</p>
                          </div>
                          <div className="bg-white border rounded-lg p-2 text-center">
                            <p className="text-[10px] text-gray-500">ทำได้</p>
                            <p className="text-lg font-bold text-green-600">{trialStats.done}</p>
                          </div>
                          <div className="bg-white border rounded-lg p-2 text-center">
                            <p className="text-[10px] text-gray-500">วันที่บันทึก</p>
                            <p className="text-lg font-bold text-blue-600">{trialStats.days} วัน</p>
                          </div>
                          <div className="bg-white border rounded-lg p-2 text-center">
                            <p className="text-[10px] text-gray-500">อัตราสำเร็จ</p>
                            <p className={`text-lg font-bold ${trialStats.pct >= 70 ? 'text-green-600' : trialStats.pct >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {trialStats.pct}%
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {stage.events.length === 0 ? (
                        <p className="text-sm text-gray-400 italic mb-3">
                          {stage.id === 'trial' || stage.id === 'oneday'
                            ? '— ยังไม่มีบันทึกกิจกรรมรายวัน (ผู้ป่วยยังไม่ได้ทำจากมือถือ) —'
                            : stage.id === 'follow'
                              ? '— ยังไม่มีประวัติการตามผล —'
                              : '— ยังไม่มีบันทึกในขั้นนี้ —'}
                        </p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {stage.events.map((ev) => (
                            <div key={ev.key} className="bg-white rounded-lg border p-3">
                              <p className="text-sm font-medium text-gray-800">{ev.title}</p>
                              <p className="text-xs text-gray-500">{ev.detail}</p>
                              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatThaiDate(ev.date)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => router.push(stage.actionUrl(patientId))}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          {stage.actionLabel}
                        </button>
                        <button
                          onClick={() => router.push(stage.historyUrl(patientId))}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          {stage.historyLabel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ Wrapper: useSearchParams ต้องอยู่ใน Suspense (กัน error ตอน build)
export default function CarePathwayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <CarePathwayContent />
    </Suspense>
  );
}