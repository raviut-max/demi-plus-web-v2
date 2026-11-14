// app/admin/patients/[id]/care-pathway/page.tsx
// ✅ v4: 6 ขั้นตอนตามไฟล์แนบ — แต่ละขั้น "ชี้ไปทำของตัวเอง" (ไม่ใช่นัดหมายทั้งหมด)
//    1 รู้จักตัวเอง(PAM/PROMS)  2 ความฝันของฉัน  3 ชีวิต 1 วันของฉัน
//    4 เป้าหมายและแผนสุขภาพ    5 ทดลองทำ        6 ติดตามต่อเนื่อง
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Route, UserCheck, Sparkles, Sun, Target, FlaskConical, Repeat,
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
  key: string; source: 'screening' | 'followup' | 'manual';
  stageId: string; date: string | null; title: string; detail: string;
  status: EventStatus; payload: Record<string, any>;
}
interface CareStage {
  id: string; no: number; title: string; description: string;
  icon: any; actionLabel: string; status: StageStatus; events: PathEvent[];
}

// ---------- 6 ขั้นตอนตามไฟล์แนบ ----------
const STAGE_META = [
  { id: 'self',    no: 1, title: 'รู้จักตัวเอง',            description: 'ทำแบบประเมิน PAM / PROMS — แจ้งจำนวนครั้งที่ทำแล้ว และเพิ่มรอบทำใหม่ได้', icon: UserCheck,   actionLabel: '➕ เพิ่มรอบทำแบบประเมิน' },
  { id: 'dream',   no: 2, title: 'ความฝันของฉัน',          description: 'ชี้ไปที่การทำความฝัน — บันทึกความฝันและสถานะการเดินตามฝัน',             icon: Sparkles,    actionLabel: '➕ บันทึกความฝัน' },
  { id: 'oneday',  no: 3, title: 'ชีวิต 1 วันของฉัน',       description: 'บันทึกวิถีชีวิตจริง 1 วัน (กิน/หวาน/เคลื่อนไหว/นอน)',                    icon: Sun,         actionLabel: '➕ บันทึกชีวิต 1 วัน' },
  { id: 'plan',    no: 4, title: 'เป้าหมายและแผนสุขภาพ',    description: 'ตั้งเป้าหมายสุขภาพและแผนการปฏิบัติ พร้อมกำหนดเวลา',                     icon: Target,      actionLabel: '➕ เพิ่มเป้าหมาย/แผน' },
  { id: 'trial',   no: 5, title: 'ทดลองทำ',                description: 'ทดลองลงมือทำจริงตามแผน แล้วบันทึกผลที่ได้',                              icon: FlaskConical, actionLabel: '➕ บันทึกการทดลอง' },
  { id: 'follow',  no: 6, title: 'ติดตามต่อเนื่อง',         description: 'ติดตามผลต่อเนื่อง (น้ำหนัก/น้ำตาล/ความมั่นใจ) ทำซ้ำได้ไม่จำกัด',           icon: Repeat,      actionLabel: '➕ บันทึกการติดตาม' },
];

// ฟิลด์ฟอร์มเฉพาะของแต่ละขั้น (ไม่ซ้ำกัน!)
const FORM_FIELDS: Record<string, { name: string; label: string; type: string; options?: string[]; required?: boolean }[]> = {
  self: [
    { name: 'kind', label: 'แบบประเมิน', type: 'select', options: ['PAM', 'PROMS', 'PAM + PROMS'], required: true },
    { name: 'score', label: 'คะแนนรวม', type: 'number' },
    { name: 'note', label: 'สิ่งที่พบ/ข้อสังเกต', type: 'textarea' },
  ],
  dream: [
    { name: 'dream', label: 'ความฝันของฉัน', type: 'text', required: true },
    { name: 'why', label: 'ทำไมฝันนี้ถึงสำคัญ', type: 'textarea' },
    { name: 'goal', label: 'เป้าหมายที่อยากไปถึง', type: 'text' },
  ],
  oneday: [
    { name: 'summary', label: 'สรุปชีวิต 1 วันของฉัน', type: 'textarea', required: true },
    { name: 'food', label: 'การกิน (เช่น ของหวาน/จุกจิก)', type: 'text' },
    { name: 'move', label: 'การเคลื่อนไหว/ออกกำลังกาย', type: 'text' },
    { name: 'sleep', label: 'การนอน', type: 'text' },
  ],
  plan: [
    { name: 'goal', label: 'เป้าหมายสุขภาพ', type: 'text', required: true },
    { name: 'plan', label: 'แผนการปฏิบัติ', type: 'textarea' },
    { name: 'target_date', label: 'กำหนดถึงเป้าหมาย', type: 'date' },
  ],
  trial: [
    { name: 'what', label: 'สิ่งที่ทดลองทำ', type: 'text', required: true },
    { name: 'duration', label: 'ระยะเวลาทดลอง', type: 'text' },
    { name: 'result', label: 'ผลที่ได้', type: 'textarea' },
  ],
  follow: [
    { name: 'weight', label: 'น้ำหนัก (กก.)', type: 'number' },
    { name: 'sugar', label: 'ค่าน้ำตาล', type: 'number' },
    { name: 'confidence', label: 'ความมั่นใจ (%)', type: 'number' },
    { name: 'note', label: 'สรุปการติดตาม', type: 'textarea' },
  ],
};

const PRIMARY_FIELD: Record<string, string> = {
  self: 'kind', dream: 'dream', oneday: 'summary', plan: 'goal', trial: 'what', follow: 'note',
};

const PAYLOAD_LABELS: Record<string, string> = {
  kind: 'แบบประเมิน', score: 'คะแนนรวม', note: 'หมายเหตุ', dream: 'ความฝัน', why: 'เหตุผล',
  goal: 'เป้าหมาย', summary: 'สรุปชีวิต 1 วัน', food: 'การกิน', move: 'การเคลื่อนไหว',
  sleep: 'การนอน', plan: 'แผนการ', target_date: 'กำหนดถึงเป้า', what: 'สิ่งที่ทดลอง',
  duration: 'ระยะเวลา', result: 'ผลที่ได้', weight: 'น้ำหนัก (กก.)', sugar: 'ค่าน้ำตาล',
  confidence: 'ความมั่นใจ (%)',
};

const STATUS_UI: Record<StageStatus, { label: string; badge: string; circle: string; card: string }> = {
  done:    { label: 'เสร็จสิ้น',       badge: 'bg-green-100 text-green-700',   circle: 'bg-green-500 text-white',  card: 'bg-green-50/60 border-green-200' },
  active:  { label: 'กำลังดำเนินการ',  badge: 'bg-blue-100 text-blue-700',     circle: 'bg-blue-500 text-white',   card: 'bg-blue-50/60 border-blue-300' },
  pending: { label: 'รอเริ่ม',         badge: 'bg-gray-100 text-gray-500',     circle: 'bg-gray-200 text-gray-500', card: 'bg-white border-gray-200' },
};

const EVENT_STATUS_UI: Record<EventStatus, { label: string; chip: string }> = {
  done:       { label: '✔ เสร็จแล้ว',      chip: 'bg-green-100 text-green-700' },
  inprogress: { label: '🔄 กำลังดำเนินการ', chip: 'bg-blue-100 text-blue-700' },
  scheduled:  { label: '📅 ตั้งใจจะทำ',     chip: 'bg-amber-100 text-amber-700' },
};

// ---------- สร้าง events ของแต่ละขั้นจากแหล่งข้อมูลของตัวเอง ----------
function buildStages(patient: any, screenings: any[], followups: any[], activities: any[]): CareStage[] {
  const derived: PathEvent[] = [
    // ขั้น 1: นับจาก screenings จริง (PAM/PROMS)
    ...screenings.map((s, i) => ({
      key: `scr-${s.id ?? i}`, source: 'screening' as const, stageId: 'self',
      date: s.screening_date, title: `แบบประเมินครั้งที่ ${i + 1}`,
      detail: `คะแนน PAM: ${s.pam_total_score ?? '-'} | วันที่ ${formatThaiDate(s.screening_date)}`,
      status: 'done' as EventStatus,
      payload: { kind: 'PAM + PROMS', score: s.pam_total_score ?? '-', note: s.note || '', activity_date: s.screening_date },
    })),
    // ขั้น 6: นับจาก appointment_followups จริง
    ...followups.map((f, i) => ({
      key: `fu-${f.id ?? i}`, source: 'followup' as const, stageId: 'follow',
      date: f.followup_date, title: `นัดติดตามครั้งที่ ${i + 1}`,
      detail: `น้ำหนัก ${f.weight ?? '-'} | น้ำตาล ${f.blood_sugar_dtx ?? '-'} | ความมั่นใจ ${f.confidence_score ?? '-'}%`,
      status: 'done' as EventStatus,
      payload: { weight: f.weight, sugar: f.blood_sugar_dtx, confidence: f.confidence_score, note: f.note || '', activity_date: f.followup_date },
    })),
  ];

  // กิจกรรมที่บันทึกเองในแต่ละขั้น (payload เฉพาะขั้น)
  const manual: PathEvent[] = (activities || []).map((a: any) => {
    const p = a.payload || {};
    const detail = Object.entries(p)
      .filter(([k, v]) => v && k !== 'activity_date')
      .map(([k, v]) => `${PAYLOAD_LABELS[k] || k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ') || a.note || '-';
    return {
      key: `ma-${a.id}`, source: 'manual' as const, stageId: a.stage_id,
      date: a.activity_date, title: a.title || 'กิจกรรม', detail,
      status: (a.status as EventStatus) || 'done',
      payload: { ...p, note: a.note, activity_date: a.activity_date },
    };
  });

  const all = [...derived, ...manual];
  const stagesWithEvents = STAGE_META.map(m => ({
    ...m,
    events: all.filter(e => e.stageId === m.id)
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()),
  }));

  const doneFlags = stagesWithEvents.map(s => s.events.some(e => e.status === 'done'));
  const firstIncomplete = doneFlags.indexOf(false);

  return stagesWithEvents.map((s, i) => {
    const hasOther = s.events.some(e => e.status !== 'done');
    const status: StageStatus = doneFlags[i] ? 'done' : (i === firstIncomplete || hasOther ? 'active' : 'pending');
    return { id: s.id, no: s.no, title: s.title, description: s.description, icon: s.icon, actionLabel: s.actionLabel, status, events: s.events };
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
  const [errorDetail, setErrorDetail] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);

  const [addStage, setAddStage] = useState<CareStage | null>(null);
  const [detailEvent, setDetailEvent] = useState<PathEvent | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formDate, setFormDate] = useState('');
  const [formStatus, setFormStatus] = useState<EventStatus>('done');

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
      if (actRes.error) console.warn('[CarePathway] care_pathway_activities:', actRes.error.message);

      const p = { ...prof, hospitals: hospRes.data || null, users: uRes.data || null, coach_name: coachRes.data?.full_name_th || '-' };
      setPatient(p);
      const built = buildStages(p, scrRes.data || [], fuRes.data || [], actRes.data || []);
      setStages(built);
      setExpanded(built.filter(s => s.status !== 'pending').map(s => s.id));
      setErrorState('none'); setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [CarePathway]', e);
      setErrorDetail(e?.message || String(e)); setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = (stage: CareStage) => {
    const init: Record<string, string> = {};
    (FORM_FIELDS[stage.id] || []).forEach(f => { init[f.name] = ''; });
    setForm(init);
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus('done');
    setAddStage(stage);
  };

  const handleSaveActivity = async () => {
    if (!addStage) return;
    const fields = FORM_FIELDS[addStage.id] || [];
    const missing = fields.find(f => f.required && !form[f.name]);
    if (missing) { alert(`กรุณากรอก "${missing.label}"`); return; }

    const primary = PRIMARY_FIELD[addStage.id];
    const title = form[primary] ? `${addStage.title}: ${form[primary]}` : `${addStage.title} ครั้งที่ ${addStage.events.length + 1}`;

    setSaving(true);
    try {
      const { error } = await supabase.from('care_pathway_activities').insert({
        user_id: patientId, stage_id: addStage.id,
        activity_date: formDate, title, note: form.note || null,
        status: formStatus, payload: form, created_by: user?.id,
      });
      if (error) throw error;
      setAddStage(null);
      await load();
    } catch (e: any) {
      alert('❌ บันทึกไม่สำเร็จ: ' + (e?.message || '') + '\n💡 รัน SQL เพิ่มคอลัมน์ payload แล้วหรือยัง?');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (ev: PathEvent) => {
    if (!confirm('ลบรายการนี้?')) return;
    const id = ev.key.replace('ma-', '');
    const { error } = await supabase.from('care_pathway_activities').delete().eq('id', id);
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
                <p className="text-sm text-gray-500">6 ขั้นตอนดูแลตัวเอง — ทำซ้ำได้ทุกขั้น</p>
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

        {/* 6 ขั้นตอน */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">ขั้นตอนการดูแลสุขภาพ (Care Pathway)</h3>
          <p className="text-sm text-gray-500 mb-4">แต่ละขั้นมีงานของตัวเอง — กดปุ่มในขั้นนั้นเพื่อทำ/บันทึกซ้ำได้</p>
          <div className="space-y-3">
            {stages.map((stage) => {
              const ui = STATUS_UI[stage.status];
              const Icon = stage.icon;
              const isOpen = expanded.includes(stage.id);
              const doneTimes = stage.events.filter(e => e.status === 'done').length;
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
                        {stage.id === 'self' && (
                          <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
                            ทำแบบประเมินแล้ว {doneTimes} ครั้ง
                          </span>
                        )}
                        {stage.id !== 'self' && stage.events.length > 0 && (
                          <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
                            {doneTimes} ครั้ง
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{stage.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${ui.badge}`}>{ui.label}</span>
                    <span className="text-gray-400 text-sm shrink-0">{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-16">
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
                                    <button onClick={() => handleDeleteActivity(ev)} className="p-1 text-red-400 hover:text-red-600" title="ลบรายการ"><Trash2 className="w-3.5 h-3.5" /></button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ✅ ปุ่ม "ทำของตัวเอง" ของแต่ละขั้น (ไม่ซ้ำกัน) */}
                      <button onClick={() => openAdd(stage)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                        <Plus className="w-4 h-4" /> {stage.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Modal: ฟอร์มเฉพาะขั้น ===== */}
      {addStage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">{addStage.actionLabel.replace('➕ ', '')} — ขั้น {addStage.no}. {addStage.title}</h3>
              <button onClick={() => setAddStage(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">วันที่ *</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">สถานะ</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value as EventStatus)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="done">✔ เสร็จแล้ว</option>
                    <option value="inprogress">🔄 กำลังดำเนินการ</option>
                    <option value="scheduled">📅 ตั้งใจจะทำ</option>
                  </select>
                </div>
              </div>
              {(FORM_FIELDS[addStage.id] || []).map(f => (
                <div key={f.name}>
                  <label className="block text-sm font-medium mb-1">{f.label}{f.required && ' *'}</label>
                  {f.type === 'select' ? (
                    <select value={form[f.name] || ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">— เลือก —</option>
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={2} value={form[f.name] || ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                  ) : (
                    <input type={f.type} value={form[f.name] || ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveActivity} disabled={saving} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <Plus className="w-4 h-4 inline" />} บันทึก
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
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-sm text-gray-500">วันที่</span>
                <span className="text-sm font-medium">{formatThaiDate(detailEvent.date)}</span>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b">
                <span className="text-sm text-gray-500">สถานะ</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${EVENT_STATUS_UI[detailEvent.status].chip}`}>{EVENT_STATUS_UI[detailEvent.status].label}</span>
              </div>
              {Object.entries(detailEvent.payload)
                .filter(([k, v]) => v != null && v !== '' && k !== 'activity_date')
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 border-b last:border-0">
                    <span className="text-sm text-gray-500 shrink-0">{PAYLOAD_LABELS[k] || k}</span>
                    <span className="text-sm font-medium text-gray-800 text-right break-all">
                      {k === 'target_date' ? formatThaiDate(v as string) : String(v)}
                    </span>
                  </div>
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {detailEvent.source === 'manual' ? 'บันทึกเอง — ลบได้' : detailEvent.source === 'screening' ? 'ข้อมูลจากแบบประเมิน PAM/PROMS (อ่านอย่างเดียว)' : 'ข้อมูลจากนัดติดตาม (อ่านอย่างเดียว)'}
            </p>
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
                        <p className="text-sm font-semibold text-gray-800">ขั้น {ev.stageNo} ({ev.stageTitle}): {ev.title}</p>
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