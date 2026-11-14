// app/admin/patients/[id]/care-pathway/page.tsx
// ✅ Care Pathway - เส้นทางดูแลสุขภาพรายบุคคล
// ข้อ 1: รู้จักตัวเอง (screening) → ชี้ไปหน้า screening + screening-history
// ข้อ 2: ความฝันของฉัน → ชี้ไปหน้า dream
// ข้อ 3-6: placeholder รอปรับในลำดับถัดไป
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Route, UserCheck, Sparkles, History, Loader2, Eye, Edit, Plus,
  Users, Building2, AlertCircle, FileText, Clock, CheckCircle2
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
    id: 'self',
    no: 1,
    title: 'รู้จักตัวเอง',
    description: 'ทำแบบประเมิน PAM / PROMS — แจ้งจำนวนครั้งที่ทำแล้ว และเพิ่มรอบใหม่ได้',
    icon: UserCheck,
    actionLabel: '➕ เพิ่มรอบทำแบบประเมิน',
    actionUrl: (p) => `/admin/screening?patient_id=${p}`,
    historyLabel: '📋 ดูประวัติการประเมิน',
    historyUrl: (p) => `/admin/patients/${p}/screening-history`,
  },
  {
    id: 'dream',
    no: 2,
    title: 'ความฝันของฉัน',
    description: 'ชี้ไปที่การทำความฝัน — เลือกการ์ดความฝัน บันทึก และดูย้อนหลังได้',
    icon: Sparkles,
    actionLabel: '➕ เลือกความฝันใหม่',
    actionUrl: (p) => `/admin/patients/${p}/dream`,
    historyLabel: '📋 ดูความฝันของฉัน',
    historyUrl: (p) => `/admin/patients/${p}/dream`,
  },
  {
    id: 'oneday',
    no: 3,
    title: 'ชีวิต 1 วันของฉัน',
    description: 'บันทึกวิถีชีวิตจริง 1 วัน (รอปรับในขั้นตอนถัดไป)',
    icon: History,
    actionLabel: '➕ บันทึกชีวิต 1 วัน',
    actionUrl: (p) => `/admin/patients/${p}/care-pathway`,
    historyLabel: '📋 ดูย้อนหลัง',
    historyUrl: (p) => `/admin/patients/${p}/care-pathway`,
  },
  {
    id: 'plan',
    no: 4,
    title: 'เป้าหมายและแผนสุขภาพ',
    description: 'ตั้งเป้าหมายสุขภาพและแผนการปฏิบัติ (รอปรับในขั้นตอนถัดไป)',
    icon: History,
    actionLabel: '➕ เพิ่มเป้าหมาย/แผน',
    actionUrl: (p) => `/admin/patients/${p}/goals`,
    historyLabel: '📋 ดูเป้าหมาย',
    historyUrl: (p) => `/admin/patients/${p}/goals`,
  },
  {
    id: 'trial',
    no: 5,
    title: 'ทดลองทำ',
    description: 'ทดลองลงมือทำจริงตามแผน (รอปรับในขั้นตอนถัดไป)',
    icon: History,
    actionLabel: '➕ บันทึกการทดลอง',
    actionUrl: (p) => `/admin/patients/${p}/care-pathway`,
    historyLabel: '📋 ดูย้อนหลัง',
    historyUrl: (p) => `/admin/patients/${p}/care-pathway`,
  },
  {
    id: 'follow',
    no: 6,
    title: 'ติดตามต่อเนื่อง',
    description: 'ติดตามผลต่อเนื่อง (รอปรับในขั้นตอนถัดไป)',
    icon: History,
    actionLabel: '➕ บันทึกการติดตาม',
    actionUrl: (p) => `/admin/patients/${p}/care-pathway`,
    historyLabel: '📋 ดูย้อนหลัง',
    historyUrl: (p) => `/admin/patients/${p}/care-pathway`,
  },
];

const STATUS_UI: Record<StageStatus, { label: string; badge: string; circle: string; card: string }> = {
  done:    { label: 'เสร็จสิ้น',       badge: 'bg-green-100 text-green-700',   circle: 'bg-green-500 text-white',  card: 'bg-green-50/60 border-green-200' },
  active:  { label: 'กำลังดำเนินการ',  badge: 'bg-blue-100 text-blue-700',     circle: 'bg-blue-500 text-white',   card: 'bg-blue-50/60 border-blue-300' },
  pending: { label: 'รอเริ่ม',         badge: 'bg-gray-100 text-gray-500',     circle: 'bg-gray-200 text-gray-500', card: 'bg-white border-gray-200' },
};

function buildStages(screenings: any[], dreams: any[]): CareStage[] {
  const eventsByStage: Record<string, PathEvent[]> = {
    // ข้อ 1: ทุกครั้งของ screening
    self: screenings.map((s, i) => ({
      key: `scr-${s.id ?? i}`,
      date: s.screening_date,
      title: `แบบประเมินครั้งที่ ${i + 1}`,
      detail: `PAM: ${s.pam_total_score ?? '-'} | Level: ${s.pam_level_result || '-'} | Zone: ${s.proms_zone || '-'}`,
    })),
    // ข้อ 2: ความฝันปัจจุบัน + ประวัติ
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
    oneday: [],
    plan: [],
    trial: [],
    follow: [],
  };

  const doneFlags = [
    screenings.length > 0,
    dreams.some(d => d.status === 'active'),
    false,
    false,
    false,
    false,
  ];
  const firstIncomplete = doneFlags.indexOf(false);

  return STAGE_META.map((m, i) => {
    const status: StageStatus = doneFlags[i] ? 'done' : (i === firstIncomplete ? 'active' : 'pending');
    return { ...m, status, events: eventsByStage[m.id] || [] };
  });
}

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
  }, [router]);

  const load = useCallback(async () => {
    if (!user || !patientId) return;
    setLoading(true);
    try {
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('*')
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

      const [hospRes, uRes, coachRes, scrRes, drmRes] = await Promise.all([
        prof.hospital_id
          ? supabase.from('hospitals').select('id, name, type').eq('id', prof.hospital_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('users').select('id_card').eq('id', patientId).maybeSingle(),
        prof.coach_id
          ? supabase.from('doctors').select('full_name_th').eq('user_id', prof.coach_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.from('screenings').select('*').eq('user_id', patientId).order('screening_date', { ascending: true }),
        supabase.from('patient_dreams').select('*').eq('user_id', patientId).order('created_at', { ascending: false }),
      ]);

      if (drmRes.error) console.warn('[CarePathway] patient_dreams:', drmRes.error.message);

      const p = {
        ...prof,
        hospitals: hospRes.data || null,
        users: uRes.data || null,
        coach_name: coachRes.data?.full_name_th || '-',
      };

      setPatient(p);
      const built = buildStages(scrRes.data || [], drmRes.data || []);
      setStages(built);
      setExpanded(built.filter(s => s.status !== 'pending').map(s => s.id));
      setErrorState('none');
      setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [CarePathway]', e);
      setErrorDetail(e?.message || String(e));
      setErrorState('notfound');
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

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
            <button onClick={() => load()} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
              ลองใหม่
            </button>
            <button onClick={() => router.push('/admin/patients')} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              กลับหน้าผู้ป่วย
            </button>
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
              const isComingSoon = ['oneday', 'trial', 'follow'].includes(stage.id);

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
                      {stage.events.length === 0 ? (
                        <p className="text-sm text-gray-400 italic mb-3">— ยังไม่มีบันทึกในขั้นนี้ —</p>
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

                      {/* ปุ่มไปทำกิจกรรมของตัวเอง */}
                      {isComingSoon ? (
                        <button disabled className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed">
                          <Plus className="w-4 h-4" /> รอการปรับแต่งในลำดับถัดไป
                        </button>
                      ) : (
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
                      )}
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