// app/admin/patients/[id]/care-pathway/page.tsx
// ✅ v2: แก้ "ไม่พบข้อมูลผู้ป่วย" ทุกคน
//    1. เลิกใช้ embed users/hospitals (ต้นเหตุ query error) → ดึงทีละตารางแทน
//    2. แสดง error จริงบนหน้าจอ + console.log เพื่อ debug
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Route, ShieldCheck, Stethoscope, Activity, HeartPulse, Pill, Leaf,
  CheckCircle2, Loader2, Eye, Edit, Plus, X, Users, Building2, AlertCircle
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

interface StageEvent { date: string | null; title: string; detail: string; }
interface CareStage {
  id: string; no: number; title: string; description: string;
  icon: any; status: StageStatus; events: StageEvent[];
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

// ---------- คำนวณ 6 ขั้นตอนจากข้อมูลจริง ----------
function buildStages(patient: any, screenings: any[], followups: any[]): CareStage[] {
  const pamNum = parseInt((patient.pam_level || 'L0').replace('L', '')) || 0;
  const hasDiagnosis = !!(patient.diabetes_type || patient.hba1c_level || patient.blood_sugar);
  const lastFu = followups.length ? followups[followups.length - 1] : null;
  const sugarControlled = lastFu?.blood_sugar_dtx != null && Number(lastFu.blood_sugar_dtx) <= 130;

  const flags = [
    screenings.length > 0,                       // 1 คัดกรอง
    hasDiagnosis,                                // 2 วินิจฉัย
    pamNum >= 2,                                 // 3 PAM L2 ขึ้นไป
    followups.length >= 2,                       // 4 ติดตาม >= 2 ครั้ง
    followups.length >= 4 || sugarControlled,    // 5 เยียวยา/ควบคุมได้
    pamNum >= 3 && followups.length >= 6,        // 6 ยั่งยืน
  ];
  const firstIncomplete = flags.indexOf(false);
  const statusOf = (i: number): StageStatus =>
    flags[i] ? 'done' : (i === firstIncomplete ? 'active' : 'pending');

  const fmtBP = (s: any, d: any) => (s && d ? `${s}/${d}` : '-');

  const eventsByStage: StageEvent[][] = [
    screenings.map((s, i) => ({
      date: s.screening_date,
      title: `คัดกรอง/ประเมินครั้งที่ ${i + 1}`,
      detail: `คะแนน PAM: ${s.pam_total_score ?? '-'} | วันที่ ${formatThaiDate(s.screening_date)}`,
    })),
    hasDiagnosis ? [{
      date: patient.updated_at,
      title: `กลุ่มเสี่ยง/ชนิด: ${patient.diabetes_type || 'บันทึกแล้ว'}`,
      detail: `HbA1C: ${patient.hba1c_level ?? '-'} | น้ำตาล: ${patient.blood_sugar ?? '-'} | BMI: ${patient.bmi ?? '-'}`,
    }] : [],
    pamNum >= 2 ? [{
      date: lastFu?.followup_date || patient.updated_at,
      title: `PAM Level ปัจจุบัน: ${patient.pam_level}`,
      detail: `ความมั่นใจล่าสุด: ${lastFu?.confidence_score ?? '-'}%`,
    }] : [],
    followups.map((f, i) => ({
      date: f.followup_date,
      title: `นัดติดตามครั้งที่ ${i + 1}`,
      detail: `น้ำหนัก ${f.weight ?? '-'} กก. | รอบเอว ${f.waist_circumference ?? '-'} | ความดัน ${fmtBP(f.blood_pressure_sys, f.blood_pressure_dia)} | น้ำตาล ${f.blood_sugar_dtx ?? '-'} | ${formatThaiDate(f.followup_date)}`,
    })),
    followups.filter(f => f.food_type_status || f.movement_status).map((f, i) => ({
      date: f.followup_date,
      title: `ปรับแผนดูแลครั้งที่ ${i + 1}`,
      detail: `ชนิดอาหาร: ${f.food_type_status || '-'} | ปริมาณอาหาร: ${f.food_amount_status || '-'} | เคลื่อนไหว: ${f.movement_status || '-'}`,
    })),
    (pamNum >= 3 && followups.length >= 6) ? [{
      date: lastFu?.followup_date,
      title: 'คงพฤติกรรมดูแลต่อเนื่อง',
      detail: `ติดตามครบ ${followups.length} ครั้ง | PAM ${patient.pam_level} | Zone: ${patient.zone || '-'}`,
    }] : [],
  ];

  return STAGE_META.map((m, i) => ({
    id: m.id, no: i + 1, title: m.title, description: m.description,
    icon: m.icon, status: statusOf(i), events: eventsByStage[i],
  }));
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
  const [errorDetail, setErrorDetail] = useState<string>(''); // ✅ แสดง error จริง
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fuForm, setFuForm] = useState({ followup_date: '', weight: '', blood_sugar_dtx: '' });

  // Session + Role
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
  }, [router]);

  // ✅ โหลดข้อมูลแบบไม่ใช้ embed (แก้ต้นเหตุ query error)
  const load = useCallback(async () => {
    if (!user || !patientId) return;
    setLoading(true);
    try {
      // 1) profiles — query เดี่ยว ไม่ embed
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', patientId)
        .maybeSingle();

      if (e1) {
        console.error('❌ [CarePathway] profiles query error:', e1);
        throw new Error('profiles: ' + e1.message);
      }
      if (!prof) {
        console.error('❌ [CarePathway] ไม่พบแถว profiles สำหรับ id =', patientId);
        setErrorDetail(`ไม่พบข้อมูลผู้ป่วย id: ${patientId} ในตาราง profiles`);
        setErrorState('notfound');
        return;
      }

      // 2) Permission: non-super admin ดูได้เฉพาะในเครือข่ายตัวเอง
      if (!isSuperAdmin(user)) {
        const ids = await getAccessibleHospitalIds(user.id);
        if (prof.hospital_id && !ids.includes(prof.hospital_id)) {
          setErrorState('denied');
          return;
        }
      }

      // 3) ดึงข้อมูลเสริมแบบ query เดี่ยว (ไม่ fatal ถ้าบางตัว error)
      const [hospRes, uRes, coachRes, scrRes, fuRes] = await Promise.all([
        prof.hospital_id
          ? supabase.from('hospitals').select('id, name, type').eq('id', prof.hospital_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('users').select('id_card').eq('id', patientId).maybeSingle(),
        prof.coach_id
          ? supabase.from('doctors').select('full_name_th').eq('user_id', prof.coach_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('screenings').select('*').eq('user_id', patientId).order('screening_date', { ascending: true }),
        supabase.from('appointment_followups').select('*').eq('user_id', patientId).order('followup_date', { ascending: true }),
      ]);

      if (uRes.error) console.warn('[CarePathway] users query error (ไม่ fatal):', uRes.error.message);
      if (scrRes.error) console.warn('[CarePathway] screenings query error:', scrRes.error.message);
      if (fuRes.error) console.warn('[CarePathway] followups query error:', fuRes.error.message);

      // ประกอบ object ให้หน้าตาเหมือนเดิม (patient.hospitals / patient.users)
      const p = {
        ...prof,
        hospitals: hospRes.data || null,
        users: uRes.data || null,
        coach_name: coachRes.data?.full_name_th || '-',
      };

      setPatient(p);
      const built = buildStages(p, scrRes.data || [], fuRes.data || []);
      setStages(built);
      setExpanded(built.filter(s => s.status !== 'pending').map(s => s.id));
      setErrorState('none');
      setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [CarePathway] load error:', e);
      setErrorDetail(e?.message || String(e));
      setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { load(); }, [load]);

  // เพิ่มนัดติดตาม
  const handleAddFollowup = async () => {
    if (!fuForm.followup_date) { alert('กรุณาเลือกวันที่นัด'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('appointment_followups').insert({
        user_id: patientId,
        followup_date: fuForm.followup_date,
        weight: fuForm.weight ? Number(fuForm.weight) : null,
        blood_sugar_dtx: fuForm.blood_sugar_dtx ? Number(fuForm.blood_sugar_dtx) : null,
      });
      if (error) throw error;
      alert('✅ บันทึกนัดติดตามแล้ว');
      setShowAddModal(false);
      setFuForm({ followup_date: '', weight: '', blood_sugar_dtx: '' });
      await load();
    } catch (e: any) {
      alert('❌ บันทึกไม่สำเร็จ: ' + (e?.message || 'ตรวจสอบคอลัมน์ของตาราง appointment_followups'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ---------- States: loading / error ----------
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
          <p className="text-gray-600 mb-4">
            {errorState === 'denied' ? 'ผู้ป่วยอยู่นอกเครือข่ายโรงพยาบาลของท่าน' : 'ผู้ป่วยอาจถูกลบหรือลิงก์ไม่ถูกต้อง'}
          </p>
          {/* ✅ แสดง error จริงเพื่อ debug */}
          {errorDetail && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
              <p className="text-xs font-semibold text-red-600 mb-1">รายละเอียดข้อผิดพลาด (สำหรับแจ้งทีม dev):</p>
              <p className="text-xs text-red-700 font-mono break-all">{errorDetail}</p>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={() => load()}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
              ลองใหม่
            </button>
            <button onClick={() => router.push('/admin/patients')}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              กลับหน้าผู้ป่วย
            </button>
          </div>
        </div>
      </div>
    );
  }

  const doneCount = stages.filter(s => s.status === 'done').length;

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/patients')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-3">
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
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                สำเร็จ {doneCount}/{stages.length} ขั้นตอน
              </span>
              <button onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                <Plus className="w-4 h-4" /> เพิ่มนัดติดตาม
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
              <button onClick={() => router.push(`/admin/patients/${patient.id}`)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด">
                <Eye className="w-5 h-5" />
              </button>
              <button onClick={() => router.push(`/admin/patients/${patient.id}/edit`)}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="แก้ไข">
                <Edit className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Stages */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">ขั้นตอนการดูแลสุขภาพ (Care Pathway)</h3>
          <p className="text-sm text-gray-500 mb-4">สถานะคำนวณอัตโนมัติจากข้อมูลการประเมินและการติดตามจริง</p>
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
                      {stage.events.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">— ยังไม่มีบันทึกในขั้นนี้ —</p>
                      ) : (
                        <div className="space-y-2">
                          {stage.events.map((ev, i) => (
                            <div key={i} className="bg-white rounded-lg border p-3 flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs shrink-0 mt-0.5">✓</div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800">{ev.title}</p>
                                <p className="text-xs text-gray-500">{ev.detail}</p>
                                <p className="text-xs text-blue-600 mt-0.5">📅 {formatThaiDate(ev.date)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal เพิ่มนัด */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">➕ เพิ่มนัดติดตาม — {patient.first_name} {patient.last_name}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">วันที่นัด *</label>
                <input type="date" value={fuForm.followup_date}
                  onChange={e => setFuForm({ ...fuForm, followup_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">น้ำหนัก (กก.)</label>
                  <input type="number" value={fuForm.weight}
                    onChange={e => setFuForm({ ...fuForm, weight: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ค่าน้ำตาล</label>
                  <input type="number" value={fuForm.blood_sugar_dtx}
                    onChange={e => setFuForm({ ...fuForm, blood_sugar_dtx: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <p className="text-xs text-gray-500">* ข้อมูลอื่น (ความดัน/รอบเอว/แผนปฏิบัติ) เติมเพิ่มได้ที่หน้าแก้ไขผู้ป่วย</p>
              <div className="flex gap-2 pt-2">
                <button onClick={handleAddFollowup} disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <Plus className="w-4 h-4 inline" />} บันทึกนัด
                </button>
                <button onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}