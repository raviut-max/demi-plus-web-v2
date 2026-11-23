// app/admin/appointments/new/page.tsx
// ✅ v7 — 23 พ.ย. 2569: แก้ 400 "ไม่พบผู้ป่วย" ถาวร + Debug Panel
// ✅ Flow: URL(?patient_id,?coach_id) → fetchPatientById(fallback chain)
//          → enrich(hospitals/users query แยก) → computePatientNetwork
//          → fetchCoachNetworkList(3-step) → ล็อกโค้ช → การ์ด + dropdown
'use client';
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  logout,
  createAppointment,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
} from '@/lib/supabase/queries';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard,
  Building2, RefreshCw, Bug, Copy,
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; code: string;
  type: 'main' | 'sub'; parent_id: string | null;
}
interface UserHospital {
  id: string; name: string; code: string;
  type: 'main' | 'sub'; parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}
interface Coach {
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  hospital_id?: string;
  hospital_name?: string;
  hospital_type?: 'main' | 'sub';
}
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  id_card?: string;
  phone?: string;
  hospital_id?: string;
  coach_id?: string | null;
  hospital_name?: string;
  hospital_code?: string;
  hospital_type?: 'main' | 'sub';
  parent_hospital?: Hospital;
}
interface DebugLog {
  t: string;
  level: 'info' | 'ok' | 'warn' | 'err';
  msg: string;
}
type LogFn = (level: DebugLog['level'], msg: string) => void;

// =====================================================
// 🧰 STEP 1: fetchPatientById — fallback chain (ไม่มี id_card / ไม่มี embed)
// =====================================================
const PATIENT_SELECTS = [
  'id, first_name, last_name, hospital_number, hospital_id, coach_id',
  'id, first_name, last_name, hospital_number, hospital_id',
  'id, first_name, last_name, hospital_number',
];

async function fetchPatientById(id: string, log: LogFn): Promise<Patient | null> {
  for (const sel of PATIENT_SELECTS) {
    const { data, error } = await supabase
      .from('profiles')
      .select(sel)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      log('warn', `STEP1: select "${sel}" → ${error.code || ''} ${error.message} → ลองชุดถัดไป`);
      continue;
    }
    if (data) {
      log('ok', `STEP1: ✅ พบผู้ป่วยด้วย select: ${sel}`);
      return data as Patient;
    }
    // select ผ่านแต่แถวว่าง → RLS หรือ id ไม่ตรง
    log('err', `STEP1: ❌ schema OK แต่ไม่พบแถว id=${id} (ตรวจ RLS หรือ id ผิด)`);
    return null;
  }
  log('err', 'STEP1: ❌ ทุก select chain ล้มเหลว');
  return null;
}

// =====================================================
// 🧰 STEP 2 helpers: enrich ด้วย query แยกตาราง (ไม่ embed)
// =====================================================
async function fetchHospitalById(id: string): Promise<Hospital | null> {
  const { data } = await supabase
    .from('hospitals')
    .select('id, name, code, type, parent_id')
    .eq('id', id)
    .maybeSingle();
  return (data as Hospital) || null;
}

async function fetchUserExtras(userId: string, log: LogFn): Promise<{ id_card?: string; phone?: string }> {
  for (const sel of ['id_card, phone', 'id_card', 'phone', '']) {
    if (!sel) break;
    const { data, error } = await supabase
      .from('users')
      .select(sel)
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) return data as any;
  }
  log('warn', 'STEP2: ⚠️ ดึง id_card/phone จาก users ไม่สำเร็จ (ข้ามได้ — ไม่บล็อก flow)');
  return {};
}

async function loadAllHospitals(log: LogFn): Promise<Hospital[]> {
  try {
    if (typeof getHospitalsWithHierarchy === 'function') {
      const d = await getHospitalsWithHierarchy();
      if (d && d.length > 0) {
        log('ok', `hospitals cache จาก lib: ${d.length} แห่ง`);
        return d as Hospital[];
      }
    }
  } catch (e: any) {
    log('warn', `getHospitalsWithHierarchy fail: ${e?.message || e}`);
  }
  const { data, error } = await supabase
    .from('hospitals')
    .select('id, name, code, type, parent_id');
  if (error) {
    log('err', `query hospitals ตรง fail: ${error.message}`);
    return [];
  }
  log('ok', `hospitals cache จาก query ตรง: ${(data || []).length} แห่ง`);
  return (data || []) as Hospital[];
}

// =====================================================
// 🧰 STEP 3: computePatientNetwork — เครือข่ายแม่ข่าย+ลูกข่าย
// =====================================================
function computePatientNetwork(
  patient: Patient,
  allHospitals: Hospital[]
): { ids: string[]; label: string } {
  if (!patient.hospital_id) return { ids: [], label: '-' };
  const h = allHospitals.find((x) => x.id === patient.hospital_id);
  if (!h) return { ids: [patient.hospital_id], label: patient.hospital_name || '-' };

  // root = ตัวเองถ้า main / parent_id ถ้า sub
  const rootId = h.type === 'main' ? h.id : h.parent_id || h.id;
  const net = allHospitals.filter((x) => x.id === rootId || x.parent_id === rootId);
  const main = net.find((x) => x.id === rootId);
  const label = main
    ? `${main.name}${net.length > 1 ? ` (+${net.length - 1} ลูกข่าย)` : ''}`
    : h.name || '-';
  return { ids: net.map((x) => x.id), label };
}

// =====================================================
// 🧰 STEP 4: fetchCoachNetworkList — 3-step query (ไม่ embed FK เลย!)
// =====================================================
async function fetchCoachNetworkList(scopeIds: string[], log: LogFn): Promise<Coach[]> {
  if (!scopeIds.length) return [];

  // A) doctors ทั้งหมดที่ active
  const { data: docs, error: e1 } = await supabase
    .from('doctors')
    .select('user_id, full_name_th, specialization_th')
    .eq('is_active', true)
    .limit(5000);
  if (e1) {
    log('err', `STEP4-A: doctors query fail: ${e1.message}`);
    return [];
  }
  const userIds = (docs || []).map((d: any) => d.user_id).filter(Boolean);
  log('info', `STEP4-A: doctors active = ${(docs || []).length} คน`);
  if (!userIds.length) return [];

  // B) users → hospital_id (chunk 900 กัน URL ยาวเกิน)
  const uMap: Record<string, string> = {};
  for (let i = 0; i < userIds.length; i += 900) {
    const chunk = userIds.slice(i, i + 900);
    const { data: us } = await supabase
      .from('users')
      .select('id, hospital_id')
      .in('id', chunk);
    (us || []).forEach((u: any) => {
      if (u.hospital_id) uMap[u.id] = u.hospital_id;
    });
  }

  // C) กรองเฉพาะโค้ชที่สังกัดในเครือข่ายผู้ป่วย
  const inScope = (docs || []).filter((d: any) => scopeIds.includes(uMap[d.user_id] || ''));
  log('info', `STEP4-C: โค้ชในเครือข่ายผู้ป่วย = ${inScope.length} คน`);
  if (!inScope.length) return [];

  // D) hospitals → ชื่อ + ประเภท (แม่ข่าย/ลูกข่าย)
  const hIds = [...new Set(inScope.map((d: any) => uMap[d.user_id]))] as string[];
  const hMap: Record<string, Hospital> = {};
  for (let i = 0; i < hIds.length; i += 900) {
    const chunk = hIds.slice(i, i + 900);
    const { data: hs } = await supabase
      .from('hospitals')
      .select('id, name, code, type, parent_id')
      .in('id', chunk);
    (hs || []).forEach((h: any) => (hMap[h.id] = h));
  }

  return inScope
    .map((d: any) => ({
      user_id: d.user_id,
      full_name_th: d.full_name_th || '-',
      specialization_th: d.specialization_th,
      hospital_id: uMap[d.user_id],
      hospital_name: hMap[uMap[d.user_id]]?.name,
      hospital_type: hMap[uMap[d.user_id]]?.type,
    }))
    .sort((a, b) => (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th'));
}

// =====================================================
// 🧰 STEP 5: fetchCoachByAnyId — fallback (user_id แล้ว id)
// =====================================================
async function fetchCoachByAnyId(id: string, log: LogFn): Promise<Coach | null> {
  if (!id) return null;
  for (const col of ['user_id', 'id']) {
    const { data } = await supabase
      .from('doctors')
      .select('user_id, full_name_th, specialization_th')
      .eq(col, id)
      .maybeSingle();
    if (data?.user_id) {
      const { data: u } = await supabase
        .from('users')
        .select('hospital_id')
        .eq('id', data.user_id)
        .maybeSingle();
      const h = u?.hospital_id ? await fetchHospitalById(u.hospital_id) : null;
      log('ok', `STEP5: ✅ พบโค้ชด้วย doctors.${col} → ${data.full_name_th}`);
      return {
        user_id: data.user_id,
        full_name_th: data.full_name_th || '-',
        specialization_th: data.specialization_th,
        hospital_id: u?.hospital_id || undefined,
        hospital_name: h?.name,
        hospital_type: h?.type,
      };
    }
  }
  log('warn', `STEP5: ⚠️ ไม่พบโค้ช id=${id} ใน doctors ทั้ง user_id และ id`);
  return null;
}

// =====================================================
// 🧩 Main Content
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---- URL params ----
  const urlFrom = searchParams.get('from') || '';
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  // ---- ✅ Navigation: กลับหน้าที่เรียก ----
  const backUrl = useMemo(() => {
    if (urlFrom === 'care-pathway-dashboard') return '/admin/care-pathway-dashboard';
    if (urlFrom === 'appointments-view') return '/admin/appointments/view';
    if (urlFrom === 'patient-detail' && urlPatientId) return `/admin/patients/${urlPatientId}`;
    return '/admin/appointments/view';
  }, [urlFrom, urlPatientId]);

  const staffDropdownRef = useRef<HTMLDivElement>(null);

  // ---- States ----
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);

  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [networkCoaches, setNetworkCoaches] = useState<Coach[]>([]);
  const [scopeLabel, setScopeLabel] = useState('');
  const [coachMissingWarning, setCoachMissingWarning] = useState(false);

  const [loading, setLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  // ---- Debug ----
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [debugOpen, setDebugOpen] = useState(true);

  const pushLog = useCallback<LogFn>((level, msg) => {
    setDebugLogs((prev) => [...prev.slice(-199), { t: new Date().toLocaleTimeString('th-TH'), level, msg }]);
    const p = level === 'err' ? '❌' : level === 'warn' ? '⚠️' : level === 'ok' ? '✅' : 'ℹ️';
    console.log(`${p} [NewAppointment] ${msg}`);
  }, []);

  const [formData, setFormData] = useState({
    patient_id: '',
    staff_id: '',
    appointment_type: 'follow_up',
    appointment_date: '',
    appointment_time: '',
    duration_minutes: 30,
    location: 'clinic',
    notes: '',
  });

  // =====================================================
  // 📥 AUTH
  // =====================================================
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
    pushLog('info', `session ok: ${userData.role} / ${userData.full_name_th || userData.id}`);
    (async () => {
      try {
        const [uH, allH] = await Promise.all([
          getUserHospitalInfo(userData.id),
          loadAllHospitals(pushLog),
        ]);
        setUserHospital(uH);
        setAllHospitals(allH);
      } catch (e: any) {
        pushLog('err', `init fail: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, pushLog]);

  // click outside
  useEffect(() => {
    const fn = (ev: MouseEvent) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(ev.target as Node))
        setIsStaffDropdownOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // =====================================================
  // ✅ AUTO-SELECT: STEP1→2→3→4→5
  // =====================================================
  const runAutoSelect = useCallback(async () => {
    if (!urlPatientId) {
      setError('ไม่พบ ?patient_id ใน URL — กรุณาเข้าจากลิงก์ที่ถูกต้อง');
      return;
    }
    if (!allHospitals.length) return;

    setAutoLoading(true);
    setError('');
    try {
      // ---- STEP 1: fetchผู้ป่วยตรง ----
      pushLog('info', `STEP1: fetchPatientById(${urlPatientId})`);
      const p = await fetchPatientById(urlPatientId, pushLog);
      if (!p) {
        setError(`ไม่พบข้อมูลผู้ป่วย (id: ${urlPatientId}) — ดูรายละเอียดใน Debug Panel`);
        return;
      }

      // ---- STEP 2: enrich (query แยกตาราง) ----
      const h = await fetchHospitalById(p.hospital_id || '');
      const parent = h?.parent_id ? await fetchHospitalById(h.parent_id) : undefined;
      const extras = await fetchUserExtras(p.id, pushLog);
      const enriched: Patient = {
        ...p,
        ...extras,
        hospital_name: h?.name,
        hospital_code: h?.code,
        hospital_type: h?.type,
        parent_hospital: parent,
      };
      pushLog(
        'ok',
        `STEP2: ผู้ป่วย = ${enriched.first_name} ${enriched.last_name} | HN=${enriched.hospital_number} | รพ.=${enriched.hospital_name || '-'}${parent ? ` → แม่ข่าย: ${parent.name}` : ''}`
      );
      setLockedPatient(enriched);
      setFormData((prev) => ({ ...prev, patient_id: enriched.id }));

      // ---- STEP 3: computePatientNetwork ----
      const { ids, label } = computePatientNetwork(enriched, allHospitals);
      setScopeLabel(label);
      pushLog('info', `STEP3: เครือข่าย = ${label} (${ids.length} รพ.)`);

      // ---- STEP 4: fetchCoachNetworkList ----
      const list = await fetchCoachNetworkList(ids, pushLog);
      setNetworkCoaches(list);

      // ---- STEP 5: ล็อกโค้ช (urlCoachId > profiles.coach_id) ----
      const targetCoachId = urlCoachId || enriched.coach_id || '';
      if (targetCoachId) {
        let found = list.find((c) => c.user_id === targetCoachId) || null;
        if (!found) found = await fetchCoachByAnyId(targetCoachId, pushLog);
        if (found) {
          if (!list.some((c) => c.user_id === found!.user_id))
            setNetworkCoaches((prev) => [found!, ...prev]);
          setLockedCoach(found);
          setFormData((prev) => ({ ...prev, staff_id: found!.user_id }));
          setStaffSearchTerm(
            `${found.full_name_th}${found.specialization_th ? ` (${found.specialization_th})` : ''}`
          );
          setCoachMissingWarning(false);
          pushLog('ok', `STEP5: ล็อกโค้ช = ${found.full_name_th} @ ${found.hospital_name || '-'}`);
        } else {
          setCoachMissingWarning(true);
          pushLog('warn', 'STEP5: ไม่พบโค้ช → ให้เลือกเอง');
        }
      } else {
        setCoachMissingWarning(true);
        pushLog('warn', 'STEP5: ไม่มี coach_id (URL + profiles ว่าง) → ให้เลือกเอง');
      }
    } catch (e: any) {
      pushLog('err', `autoSelect exception: ${e?.message || e}`);
      setError(e?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย');
    } finally {
      setAutoLoading(false);
    }
  }, [urlPatientId, urlCoachId, allHospitals, pushLog]);

  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (loading || !allHospitals.length || !urlPatientId || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    void runAutoSelect();
  }, [loading, allHospitals, urlPatientId, runAutoSelect]);

  // =====================================================
  // ⚙️ HANDLERS
  // =====================================================
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const filteredCoaches = useMemo(() => {
    const term = staffSearchTerm.trim().toLowerCase();
    if (!term) return networkCoaches.slice(0, 100);
    return networkCoaches
      .filter((c) => {
        const name = (c.full_name_th || '').toLowerCase();
        const spec = (c.specialization_th || '').toLowerCase();
        const hosp = (c.hospital_name || '').toLowerCase();
        return name.includes(term) || spec.includes(term) || hosp.includes(term);
      })
      .slice(0, 100);
  }, [networkCoaches, staffSearchTerm]);

  const handleOpenCoachDropdown = () => {
    setIsStaffDropdownOpen(true);
    // ถ้า list ว่าง (query เคย fail) → re-fetch อัตโนมัติ
    if (lockedPatient && networkCoaches.length === 0) {
      setAutoLoading(true);
      const { ids } = computePatientNetwork(lockedPatient, allHospitals);
      fetchCoachNetworkList(ids, pushLog).then((list) => {
        setNetworkCoaches(list);
        setAutoLoading(false);
      });
    }
  };

  const handleSelectCoach = (c: Coach) => {
    setLockedCoach(c);
    setCoachMissingWarning(false);
    setFormData((prev) => ({ ...prev, staff_id: c.user_id }));
    setStaffSearchTerm(
      `${c.full_name_th}${c.specialization_th ? ` (${c.specialization_th})` : ''}`
    );
    setIsStaffDropdownOpen(false);
    pushLog('ok', `ผู้ใช้เลือกโค้ชใหม่: ${c.full_name_th} @ ${c.hospital_name || '-'}`);
  };

  const handleUnlockCoach = () => {
    setLockedCoach(null);
    setFormData((prev) => ({ ...prev, staff_id: '' }));
    setStaffSearchTerm('');
    handleOpenCoachDropdown();
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.patient_id) errors.patient_id = 'กรุณาเลือกผู้ป่วย';
    if (!formData.staff_id) errors.staff_id = 'กรุณาเลือกแพทย์/เจ้าหน้าที่';
    if (!formData.appointment_date) errors.appointment_date = 'กรุณาเลือกวันที่';
    if (!formData.appointment_time) errors.appointment_time = 'กรุณาเลือกเวลา';
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0]);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const result = await createAppointment({
        patient_id: formData.patient_id,
        staff_id: formData.staff_id,
        appointment_type: formData.appointment_type,
        appointment_datetime: `${formData.appointment_date}T${formData.appointment_time}:00`,
        duration_minutes: parseInt(formData.duration_minutes.toString()),
        location: formData.location,
        notes: formData.notes || undefined,
        created_by: user?.id,
        status: 'scheduled',
      });
      if (result.success) {
        pushLog('ok', `สร้างนัดหมายสำเร็จ → กลับ ${backUrl}`);
        setSuccess(true);
        setTimeout(() => router.push(backUrl), 800);
      } else setError(result.error || 'เกิดข้อผิดพลาด');
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setSubmitting(false);
    }
  };

  const copyDebug = () => {
    const txt = debugLogs.map((l) => `[${l.t}] ${l.level.toUpperCase()}: ${l.msg}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => alert('คัดลอก Debug log แล้ว'));
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
          <p className="text-gray-600">กำลังกลับไปยังหน้าก่อนหน้านี้...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const typeBadge = (t?: 'main' | 'sub') =>
    t === 'main' ? ' (แม่ข่าย)' : t === 'sub' ? ' (ลูกข่าย)' : '';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> กลับ ({urlFrom || 'default'})
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg">
                  <CalendarPlus className="w-6 h-6" />
                </span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600 mt-1">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {userHospital && (
                <div className="text-right bg-blue-50 px-4 py-3 rounded-xl border border-blue-200">
                  <p className="font-semibold text-gray-800">{user?.full_name_th}</p>
                  <p className="text-xs text-gray-500">
                    {userHospital.name} ({userHospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  logout();
                  router.push('/admin/login');
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4 inline mr-2" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {autoLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 text-blue-700 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            กำลังโหลดข้อมูลผู้ป่วยและรายชื่อผู้ดูแล...
          </div>
        )}

        {/* ===== SECTION 1: ผู้ป่วย (ล็อกอัตโนมัติ) ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
            {lockedPatient && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                เลือกอัตโนมัติจากลิงก์ ✓
              </span>
            )}
          </h2>

          {lockedPatient ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> ผู้ป่วยที่ต้องการนัดหมาย
                  </p>
                  <p className="text-lg font-bold text-gray-800">
                    {lockedPatient.first_name} {lockedPatient.last_name}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">
                      HN: {lockedPatient.hospital_number}
                    </span>
                    {lockedPatient.id_card && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <IdCard className="w-3 h-3 text-gray-400" /> บัตร: {lockedPatient.id_card}
                      </span>
                    )}
                    {lockedPatient.phone && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        📞 {lockedPatient.phone}
                      </span>
                    )}
                    {lockedPatient.hospital_name && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <Hospital className="w-3 h-3 text-gray-400" />
                        รพ.: {lockedPatient.hospital_name}
                        {typeBadge(lockedPatient.hospital_type)}
                        {lockedPatient.parent_hospital && (
                          <span className="text-gray-400"> → แม่ข่าย: {lockedPatient.parent_hospital.name}</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <p className="mb-3">ไม่พบข้อมูลผู้ป่วย</p>
              <button
                type="button"
                onClick={() => {
                  autoAppliedRef.current = false;
                  void runAutoSelect();
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex items-center gap-1 mx-auto"
              >
                <RefreshCw className="w-4 h-4" /> ลองใหม่อีกครั้ง
              </button>
            </div>
          )}
        </div>

        {/* ===== SECTION 2: ผู้ดูแล ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                เลือกอัตโนมัติ ✓
              </span>
            )}
            {coachMissingWarning && !lockedCoach && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                กรุณาเลือกผู้ดูแล
              </span>
            )}
          </h2>

          {lockedCoach ? (
            <div className="border-2 border-purple-300 bg-purple-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                    <Stethoscope className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ดูแล / แพทย์ของนัดหมายนี้
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      {lockedCoach.specialization_th && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200">
                          <User className="w-3 h-3 text-gray-400" /> ความเชี่ยวชาญ: {lockedCoach.specialization_th}
                        </span>
                      )}
                      {lockedCoach.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200">
                          <Hospital className="w-3 h-3 text-gray-400" />
                          สังกัด: {lockedCoach.hospital_name}
                          {typeBadge(lockedCoach.hospital_type)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlockCoach}
                  className="px-3 py-1.5 text-xs border border-purple-300 bg-white text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1"
                  title="เลือกผู้ดูแลท่านอื่นในเครือข่ายโรงพยาบาลของผู้ป่วย"
                >
                  <RefreshCw className="w-3 h-3" /> เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : autoLoading ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              กำลังโหลดรายชื่อผู้ดูแลในเครือข่ายผู้ป่วย...
            </div>
          ) : (
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อ, ความเชี่ยวชาญ หรือชื่อ รพ. เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => {
                    setStaffSearchTerm(e.target.value);
                    setIsStaffDropdownOpen(true);
                  }}
                  onFocus={handleOpenCoachDropdown}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${
                    validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-xs text-purple-800 font-medium flex items-center gap-2 sticky top-0">
                    <Building2 className="w-3 h-3" />
                    ขอบเขต: เครือข่าย รพ.ผู้ป่วย — <strong>{scopeLabel}</strong> ({networkCoaches.length} คน)
                  </div>
                  {filteredCoaches.length > 0 ? (
                    filteredCoaches.map((c) => (
                      <div
                        key={c.user_id}
                        onClick={() => handleSelectCoach(c)}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex justify-between flex-wrap gap-2">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <Hospital className="w-3 h-3" />
                            สังกัด: {c.hospital_name || 'ไม่ระบุ รพ.'}
                            {typeBadge(c.hospital_type)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      {networkCoaches.length === 0
                        ? `ไม่พบบุคลากรในเครือข่าย ${scopeLabel}`
                        : 'ไม่พบข้อมูลที่ค้นหา'}
                    </div>
                  )}
                </div>
              )}
              {validationErrors.staff_id && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>
              )}
            </div>
          )}
        </div>

        {/* ===== SECTION 3: รายละเอียดนัดหมาย ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">3</span>
            รายละเอียดนัดหมาย
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทนัดหมาย *</label>
              <select name="appointment_type" value={formData.appointment_type} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="follow_up">ติดตามผล</option>
                <option value="consultation">ปรึกษาแพทย์</option>
                <option value="checkup">ตรวจสุขภาพ</option>
                <option value="lab">เจาะเลือด/แลป</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select name="location" value={formData.location} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="clinic">คลินิก</option>
                <option value="ward">หอผู้ป่วย</option>
                <option value="online">ออนไลน์ (Telemed)</option>
                <option value="home_visit">เยี่ยมบ้าน</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่และเวลา *</label>
              <div className="flex gap-2">
                <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)
              </label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">1 ชั่วโมง</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ
            </label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" />
          </div>
        </div>

        {/* ===== DEBUG PANEL ===== */}
        <div className="bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-700 text-gray-100">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Bug className="w-4 h-4 text-yellow-400" />
              🔍 Debug Panel — ตรวจสอบการทำงาน
            </h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyDebug} className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 flex items-center gap-1">
                <Copy className="w-3 h-3" /> คัดลอก
              </button>
              <button
                type="button"
                onClick={() => {
                  autoAppliedRef.current = false;
                  void runAutoSelect();
                }}
                className="px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-500 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> รัน Auto-Select ใหม่
              </button>
              <button type="button" onClick={() => setDebugOpen((o) => !o)} className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600">
                {debugOpen ? 'ย่อ' : 'ขยาย'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono mb-2">
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">URL patient_id</p>
              <p className="text-green-400 break-all">{urlPatientId || '(ไม่มี)'}</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">URL coach_id</p>
              <p className="text-green-400 break-all">{urlCoachId || '(ไม่มี)'}</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">from → backUrl</p>
              <p className="text-cyan-400 break-all">{urlFrom || '(default)'} → {backUrl}</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">hospitals cache</p>
              <p className="text-yellow-400">{allHospitals.length} แห่ง</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">lockedPatient</p>
              <p className={lockedPatient ? 'text-green-400' : 'text-red-400'}>
                {lockedPatient ? `${lockedPatient.first_name} ${lockedPatient.last_name}` : 'NULL'}
              </p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">lockedCoach</p>
              <p className={lockedCoach ? 'text-green-400' : 'text-red-400'}>
                {lockedCoach ? `${lockedCoach.full_name_th} @ ${lockedCoach.hospital_name || '-'}` : 'NULL'}
              </p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">networkCoaches</p>
              <p className="text-yellow-400">{networkCoaches.length} คน | {scopeLabel}</p>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <p className="text-gray-400">formData</p>
              <p className="text-cyan-400">
                p={formData.patient_id ? '✓' : '✗'} s={formData.staff_id ? '✓' : '✗'}
              </p>
            </div>
          </div>

          {debugOpen && (
            <div className="bg-gray-800 rounded p-3 max-h-64 overflow-y-auto font-mono text-[11px] space-y-1">
              {debugLogs.length === 0 && <p className="text-gray-500">ยังไม่มี log...</p>}
              {debugLogs.map((l, i) => (
                <p
                  key={i}
                  className={
                    l.level === 'err'
                      ? 'text-red-400'
                      : l.level === 'warn'
                      ? 'text-yellow-400'
                      : l.level === 'ok'
                      ? 'text-green-400'
                      : 'text-gray-300'
                  }
                >
                  <span className="text-gray-500">[{l.t}]</span> {l.msg}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button
            type="submit"
            disabled={submitting || !lockedPatient}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push(backUrl)}
            className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================================================
// 🎁 Default Export with Suspense
// =====================================================
export default function NewAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <NewAppointmentContent />
    </Suspense>
  );
}