// app/admin/patients/[id]/care-pathway/page.tsx
// ✅ v3: Care Pathway แบบทำงานได้จริง (Repeatable)
//    - ทุกขั้นตอนมีปุ่ม "เพิ่มนัด" บันทึกกิจกรรมซ้ำได้ (ตาราง care_pathway_activities)
//    - ทุก event มี "ดูรายละเอียด" แสดงครบทุกฟิลด์
//    - ทุกขั้นตอนมี "ดูสรุป" + header มี "ดู Trace" (timeline รวม)
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Route, ShieldCheck, Stethoscope, Activity, HeartPulse, Pill, Leaf,
  CheckCircle2, Loader2, Eye, Edit, Plus, X, Users, Building2, AlertCircle,
  FileText, Clock, Trash2, History
} from 'lucide-react';

// ---------- Helpers ----------
const formatThaiDate = (dateString: string | null | undefined) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
};

type StageStatus = 'done' | 'active' | 'pending';
type EventStatus = 'done' | 'inprogress' | 'scheduled';

interface PathEvent {
  key: string;
  source: 'screening' | 'followup' | 'manual';
  stageId: string;
  date: string | null;
  title: string;
  detail: string;
  status: EventStatus;
  raw: any;
}
interface CareStage {
  id: string; no: number; title: string; description: string;
  icon: any; status: StageStatus; events: PathEvent[];
}

const STAGE_META = [
  { id: 'screening',  title: 'ป้องกันและคัดกรองโรค',        description: 'ตรวจคัดกรองความเสี่ยง เบาหวาน/ความดัน และประเมินสุขภาพเบื้องต้น', icon: ShieldCheck },
  { id: 'diagnosis',  title: 'วินิจฉัยและประเมินอาการ',      description: 'ยืนยันกลุ่มเสี่ยง/ชนิดเบาหวาน และประเมินค่าทางห้องปฏิบัติการ',   icon: Stethoscope },
  { id: 'selfcare',   title: 'PAM & Self-care',            description: 'ประเมินความพร้อมในการจัดการตนเอง (PAM) และวางแผนดูแลตัวเอง',  icon: Activity },
  { id: 'monitoring', title: 'เฝ้าระวังและลดภาวะแทรกซ้อน',    description: 'ติดตามนัด วัดน้ำหนัก ความดัน น้ำตาล และพฤติกรรมสุขภาพ',        icon: HeartPulse },
  { id: 'remedy',     title: 'เยียวยา (Remedy)',            description: 'ปรับแผนดูแล/ส่งต่อรักษา เมื่อพบค่าผิดปกติหรือภาวะแทรกซ้อน',      icon: Pill },
  { id: 'sustain',    title: 'ฟื้นตัวอย่างยั่งยืน',           description: 'คงพฤติกรรมการดูแลตนเอง และประเมินผลระยะยาวต่อเนื่อง',          icon: Leaf },
];

const STATUS_UI: Record<StageStatus, { label: string; badge: string; circle: string; card: string }> = {
  done:    { label: 'เสร็จสิ้น',       badge: 'bg-green-100 text-green-700',   circle: 'bg-green-500 text-white',  card: 'bg-green-50/60 border-green-200' },
  active:  { label: 'กำลังดำเนินการ',  badge: 'bg-blue-100 text-blue-700',     circle: 'bg-blue-500 text-white',   card: 'bg-blue-50/60 border-blue-300' },
  pending: { label: 'รอเริ่ม',         badge: 'bg-gray-100 text-gray-500',     circle: 'bg-gray-200 text-gray-500', card: 'bg-white border-gray-200' },
};

const EVENT_STATUS_UI: Record<EventStatus, { label: string; chip: string }> = {
  done:       { label: '✔ เสร็จแล้ว',      chip: 'bg-green-100 text-green-700' },
  inprogress: { label: '🔄 กำลังดำเนินการ', chip: 'bg-blue-100 text-blue-700' },
  scheduled:  { label: '📅 นัดหมายล่วงหน้า', chip: 'bg-amber-100 text-amber-700' },
};

// label ภาษาไทยสำหรับแสดงใน modal รายละเอียด
const FIELD_LABELS: Record<string, string> = {
  screening_date: 'วันที่ประเมิน', pam_total_score: 'คะแนน PAM', proms_total_score: 'คะแนน PROMS',
  created_at: 'บันทึกเมื่อ', updated_at: 'แก้ไขล่าสุด',
  followup_date: 'วันที่ติดตาม', weight: 'น้ำหนัก (กก.)', waist_circumference: 'รอบเอว (ซม.)',
  blood_pressure_sys: 'ความดัน (SYS)', blood_pressure_dia: 'ความดัน (DIA)',
  blood_sugar_dtx: 'ค่าน้ำตาล', confidence_score: 'ความมั่นใจ (%)',
  food_amount_status: 'แผนปริมาณอาหาร', food_type_status: 'แผนชนิดอาหาร', movement_status: 'แผนการเคลื่อนไหว',
  activity_date: 'วันที่กิจกรรม', title: 'ชื่อรายการ', note: 'รายละเอียด/หมายเหตุ',
  status: 'สถานะ', created_by: 'ผู้บันทึก',
};

// ---------- คำนวณ + merge กิจกรรม ----------
function buildStages(patient: any, screenings: any[], followups: any[], activities: any[]): CareStage[] {
  const pamNum = parseInt((patient.pam_level || 'L0').replace('L', '')) || 0;
  const hasDiagnosis = !!(patient.diabetes_type || patient.hba1c_level || patient.blood_sugar);
  const lastFu = followups.length ? followups[followups.length - 1] : null;
  const fmtBP = (s: any, d: any) => (s && d ? `${s}/${d}` : '-');

  // 1) events ที่ derive จากข้อมูลจริง (read-only)
  const derived: PathEvent[] = [
    ...screenings.map((s, i) => ({
      key: `scr-${s.id ?? i}`, source: 'screening' as const, stageId: 'screening',
      date: s.screening_date, title: `คัดกรอง/ประเมินครั้งที่ ${i + 1}`,
      detail: `คะแนน PAM: ${s.pam_total_score ?? '-'} | วันที่ ${formatThaiDate(s.screening_date)}`,
      status: 'done' as EventStatus, raw: s,
    })),
    ...(hasDiagnosis ? [{
      key: 'diag-0', source: 'followup' as const, stageId: 'diagnosis',
      date: patient.updated_at, title: `กลุ่มเสี่ยง/ชนิด: ${patient.diabetes_type || 'บันทึกแล้ว'}`,
      detail: `HbA1C: ${patient.hba1c_level ?? '-'} | น้ำตาล: ${patient.blood_sugar ?? '-'} | BMI: ${patient.bmi ?? '-'}`,
      status: 'done' as EventStatus, raw: { diabetes_type: patient.diabetes_type, hba1c_level: patient.hba1c_level, blood_sugar: patient.blood_sugar, bmi: patient.bmi, updated_at: patient.updated_at },
    }] : []),
    ...(pamNum >= 2 ? [{
      key: 'pam-0', source: 'followup' as const, stageId: 'selfcare',
      date: lastFu?.followup_date || patient.updated_at, title: `PAM Level ปัจจุบัน: ${patient.pam_level}`,
      detail: `ความมั่นใจล่าสุด: ${lastFu?.confidence_score ?? '-'}%`,
      status: 'done' as EventStatus, raw: { pam_level: patient.pam_level, confidence_score: lastFu?.confidence_score },
    }] : []),
    ...followups.map((f, i) => ({
      key: `fu-${f.id ?? i}`, source: 'followup' as const, stageId: 'monitoring',
      date: f.followup_date, title: `นัดติดตามครั้งที่ ${i + 1}`,
      detail: `น้ำหนัก ${f.weight ?? '-'} กก. | ความดัน ${fmtBP(f.blood_pressure_sys, f.blood_pressure_dia)} | น้ำตาล ${f.blood_sugar_dtx ?? '-'}`,
      status: 'done' as EventStatus, raw: f,
    })),
    ...followups.filter(f => f.food_type_status || f.movement_status).map((f, i) => ({
      key: `rem-${f.id ?? i}`, source: 'followup' as const, stageId: 'remedy',
      date: f.followup_date, title: `ปรับแผนดูแลครั้งที่ ${i + 1}`,
      detail: `ชนิดอาหาร: ${f.food_type_status || '-'} | เคลื่อนไหว: ${f.movement_status || '-'}`,
      status: 'done' as EventStatus, raw: f,
    })),
  ];

  // 2) events ที่บันทึกเองจากตาราง care_pathway_activities (เพิ่มซ้ำได้)
  const manual: PathEvent[] = (activities || []).map((a: any) => ({
    key: `ma-${a.id}`, source: 'manual' as const, stageId: a.stage_id,
    date: a.activity_date, title: a.title || 'กิจกรรม',
    detail: a.note || '-', status: (a.status as EventStatus) || 'done', raw: a,
  }));

  // 3) เกณฑ์ auto เดิม (ใช้เฉพาะขั้นที่ยังไม่มี event)
  const sugarControlled = lastFu?.blood_sugar_dtx != null && Number(lastFu.blood_sugar_dtx) <= 130;
  const flags = [
    screenings.length > 0, hasDiagnosis, pamNum >= 2,
    followups.length >= 2, followups.length >= 4 || sugarControlled,
    pamNum >= 3 && followups.length >= 6,
  ];
  const firstIncomplete = flags.indexOf(false);

  return STAGE_META.map((m, i) => {
    const events = [...derived, ...manual]
      .filter(e => e.stageId === m.id)
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    let status: StageStatus;
    if (events.some(e => e.status === 'done')) status = 'done';
    else if (events.some(e => e.status !== 'done')) status = 'active';
    else status = flags[i] ? 'done' : (i === firstIncomplete ? 'active' : 'pending');

    return { id: m.id, no: i + 1, title: m.title, description: m.description, icon: m.icon, status, events };
  });
}

// ---------- Page ----------
export default function CarePathwayPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [stages, setStages] = useState<CareStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<'none' | 'notfound' | 'denied'>('none');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [expanded, setExpanded] = useState<string[]>([]);

  // modals
  const [addStage, setAddStage] = useState<CareStage | null>(null);
  const [detailEvent, setDetailEvent] = useState<PathEvent | null>(null);
  const [summaryStage, setSummaryStage] = useState<CareStage | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ activity_date: '', title: '', note: '', status: 'done' });

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
    try {
      const { data: prof, error: e1 } = await supabase.from('profiles').select('*').eq('id', patientId).maybeSingle();
      if (e1) throw new Error('profiles: ' + e1.message);
      if (!prof) { setErrorDetail(`ไม่พบข้อมูลผู้ป่วย id: ${patientId}`); setErrorState('notfound'); return; }

      if (!isSuperAdmin(user)) {
        const ids = await getAccessibleHospitalIds(user.id);
        if (prof.hospital_id && !ids.includes(prof.hospital_id)) { setErrorState('denied'); return; }
      }

      const [hospRes, uRes, coachRes, scrRes, fuRes, actRes] = await Promise.all([
        prof.hospital_id ? supabase.from('hospitals').select('id, name, type').eq('id', prof.hospital_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
        supabase.from('users').select('id_card').eq('id', patientId).maybeSingle(),
        prof.coach_id ? supabase.from('doctors').select('full_name_th').eq('user_id', prof.coach_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
        supabase.from('screenings').select('*').eq('user_id', patientId).order('screening_date', { ascending: true }),
        supabase.from('appointment_followups').select('*').eq('user_id', patientId).order('followup_date', { ascending: true }),
        supabase.from('care_pathway_activities').select('*').eq('user_id', patientId).order('activity_date', { ascending: true }),
      ]);

      // ⚠️ ถ้ายังไม่ได้รัน SQL สร้างตาราง → เตือนแต่ไม่พัง (แสดงเฉพาะ data เดิม)
      if (actRes.error) console.warn('[CarePathway] care_pathway_activities:', actRes.error.message);

      const p = { ...prof, hospitals: hospRes.data || null, users: uRes.data || null, coach_name: coachRes.data?.full_name_th || '-' };
      setPatient(p);
      const built = buildStages(p, scrRes.data || [], fuRes.data || [], actRes.data || []);
      setStages(built);
      setExpanded(built.filter(s => s.status !== 'pending').map(s => s.id));
      setErrorState('none'); setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [CarePathway]', e);
      setErrorDetail(e?.message || String(e));
      setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = (stage: CareStage) => {
    setForm({
      activity_date: new Date().toISOString().slice(0, 10),
      title: `นัดที่ ${stage.events.length + 1} - ${stage.title}`,
      note: '', status: 'done',
    });
    setAddStage(stage);
  };

  const handleSaveActivity = async () => {
    if (!addStage || !form.activity_date) { alert('กรุณาเลือกวันที่'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('care_pathway_activities').insert({
        user_id: patientId, stage_id: addStage.id,
        activity_date: form.activity_date, title: form.title,
        note: form.note || null, status: form.status, created_by: user?.id,
      });
      if (error) throw error;
      setAddStage(null);
      await load();
    } catch (e: any) {
      alert('❌ บันทึกไม่สำเร็จ: ' + (e?.message || '') + '\n\n💡 ถ้าขึ้นว่าตารางไม่มีอยู่ → กรุณารัน SQL สร้างตาราง care_pathway_activities ใน Supabase ก่อน');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (ev: PathEvent) => {
    if (!confirm('ลบรายการนี้?')) return;
    const { error } = await supabase.from('care_pathway_activities').delete().eq('id', ev.raw.id);
    if (error) { alert('❌ ลบไม่สำเร็จ: ' + error.message); return; }
    await load();
  };

  const toggle = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ---------- Loading / Error ----------
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
            <button onClick={() => router.push('/admin/patients')} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">กลับหน้าผู้ป่วย</button>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = stages.filter(s => s.status === 'done').length;
  const allEvents = stages.flatMap(s => s.events.map(e => ({ ...e, stageNo: s.no, stageTitle: s.title })))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/patients')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-3">
            <ArrowLeft className="w-4 h-4" /> กลับหน้าผู้ป่วย
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <Route className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">เส้นทางสุขภาพผู้ป่วย (Care Pathway)</h1>
                <p className="text-sm text-gray-500">แสดงขั้นตอนการดูแลที่ทำแล้ว และสิ่งที่ต้องดูแลต่อไป</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">สำเร็จ {doneCount}/{stages.length} ขั้นตอน</span>
              <button onClick={() => setShowTrace(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm">
                <History className="w-4 h-4" /> ดู Trace
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Patient Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 border">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl font-bold text-blue-700">
              {patient.first_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800">{patient.first_name} {patient.last_name}</h2>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-1 bg-gray-100 rounded-full">HN: {patient.hospital_number || '-'}</span>
                <span className="px-2 py-1 bg-gray-100 rounded-full font-mono">ID: {patient.users?.id_card || '-'}</span>
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">PAM: {patient.pam_level || 'L0'}</span>
                <span className={`px-2 py-1 rounded-full ${patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' : patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                  {patient.zone || 'Green Zone'}
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">โค้ช: {patient.coach_name}</span>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
                <span className="flex items-center gap-1"><Building2 className="w-4 h-4 text-blue-500" />{patient.hospitals?.name || '-'}</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" />อายุ {patient.age || '-'} ปี | BMI {patient.bmi || '-'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => router.push(`/admin/patients/${patient.id}`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด"><Eye className="w-5 h-5" /></button>
              <button onClick={() => router.push(`/admin/patients/${patient.id}/edit`)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="แก้ไข"><Edit className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        {/* Stages */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">ขั้นตอนการดูแลสุขภาพ (Care Pathway)</h3>
          <p className="text-sm text-gray-500 mb-4">กด "เพิ่มนัด" ในแต่ละขั้นเพื่อบันทึกกิจกรรมได้ไม่จำกัด (ทำได้ซ้ำ)</p>
          <div className="space-y-3">
            {stages.map((stage) => {
              const ui = STATUS_UI[stage.status];
              const Icon = stage.icon;
              const isOpen = expanded.includes(stage.id);
              return (
                <div key={stage.id} className={`rounded-xl border shadow-sm ${ui.card}`}>
                  {/* หัวข้อขั้น */}
                  <button onClick={() => toggle(stage.id)} className="w-full flex items-center gap-4 p-4 text-left">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0 ${ui.circle}`}>
                      {stage.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : stage.no}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-600 shrink-0" />
                        <span className="font-semibold text-gray-800">{stage.no}. {stage.title}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{stage.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${ui.badge}`}>{ui.label}</span>
                    <span className="text-gray-400 text-sm shrink-0">{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-16">
                      {/* รายการกิจกรรม */}
                      {stage.events.length === 0 ? (
                        <p className="text-sm text-gray-400 italic mb-3">— ยังไม่มีบันทึกในขั้นนี้ —</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {stage.events.map((ev) => {
                            const evUi = EVENT_STATUS_UI[ev.status];
                            return (
                              <div key={ev.key} className="bg-white rounded-lg border p-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-gray-800">{ev.title}</p>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${evUi.chip}`}>{evUi.label}</span>
                                  </div>
                                  <p className="text-xs text-gray-500">{ev.detail}</p>
                                  <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatThaiDate(ev.date)}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => setDetailEvent(ev)} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                                    <FileText className="w-3 h-3" /> ดูรายละเอียด
                                  </button>
                                  {ev.source === 'manual' && (
                                    <button onClick={() => handleDeleteActivity(ev)} className="p-1 text-red-400 hover:text-red-600" title="ลบรายการ">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ปุ่มทำงานของแต่ละขั้น */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => openAdd(stage)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                          <Plus className="w-4 h-4" /> {stage.status === 'done' ? 'เพิ่มนัด (ทำซ้ำ)' : 'เพิ่มนัด'}
                        </button>
                        <button onClick={() => setSummaryStage(stage)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                          <FileText className="w-4 h-4" /> ดูสรุปข้อมูล
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

      {/* ===== Modal: เพิ่มนัด ===== */}
      {addStage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">➕ เพิ่มนัด — ขั้น {addStage.no}. {addStage.title}</h3>
              <button onClick={() => setAddStage(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">วันที่ *</label>
                  <input type="date" value={form.activity_date} onChange={e => setForm({ ...form, activity_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">สถานะ</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="done">✔ เสร็จแล้ว</option>
                    <option value="inprogress">🔄 กำลังดำเนินการ</option>
                    <option value="scheduled">📅 นัดหมายล่วงหน้า</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อรายการ</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="เช่น นัดที่ 4 - ติดตามผล" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">รายละเอียด/หมายเหตุ</label>
                <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded-lg" placeholder="สิ่งที่ทำ, ผลที่ได้, แผนต่อไป..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveActivity} disabled={saving} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <Plus className="w-4 h-4 inline" />} บันทึกนัด
                </button>
                <button onClick={() => setAddStage(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: ดูรายละเอียด ===== */}
      {detailEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📋 {detailEvent.title}</h3>
              <button onClick={() => setDetailEvent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1">
              {Object.entries(detailEvent.raw)
                .filter(([k, v]) => v != null && v !== '' && !['id', 'user_id'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 border-b last:border-0">
                    <span className="text-sm text-gray-500 shrink-0">{FIELD_LABELS[k] || k}</span>
                    <span className="text-sm font-medium text-gray-800 text-right break-all">
                      {['screening_date','followup_date','activity_date','created_at','updated_at'].includes(k)
                        ? formatThaiDate(v as string)
                        : k === 'status' ? (EVENT_STATUS_UI[v as EventStatus]?.label || v) : String(v)}
                    </span>
                  </div>
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {detailEvent.source === 'manual' ? 'รายการบันทึกเอง — ลบ/แก้ไขได้' : 'ข้อมูลจากระบบ (อ่านอย่างเดียว)'}
            </p>
          </div>
        </div>
      )}

      {/* ===== Modal: ดูสรุปขั้น ===== */}
      {summaryStage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📊 สรุปขั้น {summaryStage.no}. {summaryStage.title}</h3>
              <button onClick={() => setSummaryStage(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-2xl font-bold">{summaryStage.events.length}</p><p className="text-xs text-gray-500">จำนวนครั้ง</p></div>
              <div className="bg-green-50 rounded-lg p-3"><p className="text-2xl font-bold text-green-600">{summaryStage.events.filter(e => e.status === 'done').length}</p><p className="text-xs text-gray-500">เสร็จแล้ว</p></div>
              <div className="bg-amber-50 rounded-lg p-3"><p className="text-2xl font-bold text-amber-600">{summaryStage.events.filter(e => e.status !== 'done').length}</p><p className="text-xs text-gray-500">ค้าง/นัดใหม่</p></div>
            </div>
            <p className="text-sm text-gray-600">
              {summaryStage.events.length > 0
                ? <>เริ่มครั้งแรก {formatThaiDate(summaryStage.events[0].date)} → ล่าสุด {formatThaiDate(summaryStage.events[summaryStage.events.length - 1].date)}</>
                : 'ยังไม่มีกิจกรรมในขั้นนี้'}
            </p>
            <button onClick={() => { const s = summaryStage; setSummaryStage(null); openAdd(s); }} className="mt-4 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
              ➕ เพิ่มนัดในขั้นนี้
            </button>
          </div>
        </div>
      )}

      {/* ===== Modal: ดู Trace ===== */}
      {showTrace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">🕘 Trace — กิจกรรมทั้งหมดของ {patient.first_name} {patient.last_name}</h3>
              <button onClick={() => setShowTrace(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            {allEvents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">ยังไม่มีกิจกรรม</p>
            ) : (
              <div className="relative pl-6 border-l-2 border-gray-200 space-y-4">
                {allEvents.map((ev) => (
                  <div key={ev.key} className="relative">
                    <div className="absolute -left-[31px] w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800">ขั้น {ev.stageNo}: {ev.title}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${EVENT_STATUS_UI[ev.status].chip}`}>{EVENT_STATUS_UI[ev.status].label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{ev.detail}</p>
                      <p className="text-xs text-blue-600 mt-1">📅 {formatThaiDate(ev.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}