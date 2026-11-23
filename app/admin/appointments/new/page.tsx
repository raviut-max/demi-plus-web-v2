// app/admin/appointments/new/page.tsx
// ✅ v10 — 23 พ.ย. 2569: แก้ syntax error (space ใน identifier/&&/scope) + auto-select ไม่พึ่ง cache รพ.
// ✅ Flow: URL(?patient_id,?coach_id,?from) → STEP1 fetchPatientById(fallback chain)
//          → STEP2 enrich(query แยกตาราง) → STEP3 computePatientNetwork
//          → STEP4 fetchCoachNetworkList(embed+3-step) → STEP5 ล็อกโค้ช
// ✅ ไม่มี Debug Panel (เหลือเฉพาะ console.log เบื้องหลัง)
'use client';
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  logout,
  createAppointment,
  getUserHospitalInfo,
} from '@/lib/supabase/queries';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard,
  Building2, RefreshCw,
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; code?: string;
  type?: 'main' | 'sub'; parent_id?: string | null;
}
interface UserHospital {
  id: string; name: string; code?: string;
  type?: 'main' | 'sub'; parent_id?: string | null;
  parent_hospital?: { id: string; name: string; code?: string };
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

// =====================================================
// 🧰 SELECT CHAINS (fallback กัน 400 — ไม่มี id_card/ไม่มี embed ใน profiles)
// =====================================================
const PATIENT_SELECTS = [
  'id, first_name, last_name, hospital_number, hospital_id, coach_id',
  'id, first_name, last_name, hospital_number, hospital_id',
  'id, first_name, last_name, hospital_number',
];
const HOSPITAL_SELECTS = ['id, name, code, type, parent_id', 'id, name, type, parent_id', 'id, name'];
// embed ที่ appointments/view พิสูจน์แล้วว่าใช้ได้ผล
const COACH_EMBED_SELECTS = [
  'id, user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey (hospital_id, hospitals (id, name, type))',
  'id, user_id, full_name_th, is_active, users!doctors_user_id_fkey (hospital_id, hospitals (id, name))',
];

function normalizeCoach(d: any): Coach {
  const u = Array.isArray(d.users) ? d.users[0] : d.users;
  const h = Array.isArray(u?.hospitals) ? u.hospitals[0] : u?.hospitals;
  return {
    user_id: d.user_id,
    full_name_th: d.full_name_th || '-',
    specialization_th: d.specialization_th,
    hospital_id: u?.hospital_id,
    hospital_name: h?.name,
    hospital_type: h?.type,
  };
}

// =====================================================
// 🧰 STEP 1: fetchPatientById — fallback chain
// =====================================================
async function fetchPatientById(id: string): Promise<Patient | null> {
  for (const sel of PATIENT_SELECTS) {
    const { data, error } = await supabase
      .from('profiles').select(sel).eq('id', id).maybeSingle();
    if (error) { console.warn(`⚠️ [STEP1] "${sel}" → ${error.message}`); continue; }
    if (data) return data as Patient;
    console.warn(`⚠️ [STEP1] schema OK แต่ไม่พบแถว id=${id} (RLS/ไม่พบ)`);
    return null;
  }
  console.error('❌ [STEP1] ทุก select chain ล้มเหลว');
  return null;
}

// =====================================================
// 🧰 STEP 2 helpers: query แยกตาราง (ไม่ embed) — แบบ dashboard
// =====================================================
async function fetchHospitalById(id: string): Promise<Hospital | null> {
  if (!id) return null;
  for (const sel of HOSPITAL_SELECTS) {
    const { data, error } = await supabase
      .from('hospitals').select(sel).eq('id', id).maybeSingle();
    if (!error && data) return data as Hospital;
  }
  return null;
}

async function fetchUserExtras(userId: string): Promise<{ id_card?: string; phone?: string }> {
  for (const sel of ['id_card, phone', 'id_card', 'phone']) {
    const { data, error } = await supabase.from('users').select(sel).eq('id', userId).maybeSingle();
    if (!error && data) return data as any;
  }
  return {}; // non-fatal
}

async function loadAllHospitals(): Promise<Hospital[]> {
  const { data, error } = await supabase.from('hospitals').select('id, name, code, type, parent_id');
  if (error) { console.error('❌ [loadAllHospitals]', error.message); return []; }
  return (data || []) as Hospital[];
}

// =====================================================
// 🧰 STEP 3: computePatientNetwork — main → [ตัวเอง+ลูกข่าย] / sub → [ตัวเอง+แม่ข่าย]
// =====================================================
function computePatientNetwork(patient: Patient, allHospitals: Hospital[]): { ids: string[]; label: string } {
  if (!patient.hospital_id) return { ids: [], label: '-' };
  const h = allHospitals.find((x) => x.id === patient.hospital_id);
  if (!h) return { ids: [patient.hospital_id], label: patient.hospital_name || '-' };

  const rootId = h.type === 'main' ? h.id : h.parent_id || h.id;
  const net = allHospitals.filter((x) => x.id === rootId || x.parent_id === rootId);
  const main = net.find((x) => x.id === rootId);
  const label = main ? `${main.name}${net.length > 1 ? ` (+${net.length - 1} ลูกข่าย)` : ''}` : h.name || '-';
  return { ids: net.map((x) => x.id), label };
}

// =====================================================
// 🧰 STEP 4: fetchCoachNetworkList — embed (primary) + 3-step (fallback)
// =====================================================
async function fetchCoachNetworkList(scopeIds: string[]): Promise<Coach[]> {
  if (!scopeIds.length) return [];

  // ---- A) embed query ----
  for (const sel of COACH_EMBED_SELECTS) {
    const { data, error } = await supabase
      .from('doctors').select(sel).eq('is_active', true).limit(5000);
    if (error || !data || data.length === 0) continue;
    const all = (data as any[]).map(normalizeCoach);
    const inNet = all.filter((c) => c.hospital_id && scopeIds.includes(c.hospital_id));
    if (inNet.length > 0) {
      console.log(`✅ [STEP4-A] โค้ชในเครือข่าย ${inNet.length} คน`);
      return inNet.sort((a, b) => (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th'));
    }
  }

  // ---- B) 3-step query ----
  const { data: docs } = await supabase
    .from('doctors')
    .select('user_id, full_name_th, specialization_th')
    .eq('is_active', true).limit(5000);
  if (!docs || docs.length === 0) return [];
  const userIds = docs.map((d: any) => d.user_id).filter(Boolean);
  const uMap: Record<string, string> = {};
  for (let i = 0; i < userIds.length; i += 900) {
    const { data: us } = await supabase.from('users').select('id, hospital_id').in('id', userIds.slice(i, i + 900));
    (us || []).forEach((u: any) => { if (u.hospital_id) uMap[u.id] = u.hospital_id; });
  }
  const inScope = docs.filter((d: any) => scopeIds.includes(uMap[d.user_id] || ''));
  if (inScope.length === 0) return [];
  const hIds = [...new Set(inScope.map((d: any) => uMap[d.user_id]).filter(Boolean))] as string[];
  const hMap: Record<string, Hospital> = {};
  for (let i = 0; i < hIds.length; i += 900) {
    const { data: hs } = await supabase.from('hospitals').select('id, name, type').in('id', hIds.slice(i, i + 900));
    (hs || []).forEach((h: any) => (hMap[h.id] = h));
  }
  console.log(`✅ [STEP4-B] โค้ชในเครือข่าย (3-step) ${inScope.length} คน`);
  return inScope
    .map((d: any) => ({
      user_id: d.user_id, full_name_th: d.full_name_th || '-',
      specialization_th: d.specialization_th, hospital_id: uMap[d.user_id],
      hospital_name: hMap[uMap[d.user_id]]?.name, hospital_type: hMap[uMap[d.user_id]]?.type,
    }))
    .sort((a, b) => (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th'));
}

// =====================================================
// 🧰 STEP 5: fetchCoachByAnyId — fallback (user_id แล้ว id)
// =====================================================
async function fetchCoachByAnyId(id: string): Promise<Coach | null> {
  if (!id) return null;
  for (const col of ['user_id', 'id']) {
    for (const sel of COACH_EMBED_SELECTS) {
      const { data } = await supabase.from('doctors').select(sel).eq(col, id).maybeSingle();
      if (data?.user_id) return normalizeCoach(data);
    }
    const { data } = await supabase
      .from('doctors').select('user_id, full_name_th, specialization_th').eq(col, id).maybeSingle();
    if (data?.user_id) {
      const { data: u } = await supabase.from('users').select('hospital_id').eq('id', data.user_id).maybeSingle();
      const h = u?.hospital_id ? await fetchHospitalById(u.hospital_id) : null;
      return {
        user_id: data.user_id, full_name_th: data.full_name_th || '-',
        specialization_th: data.specialization_th, hospital_id: u?.hospital_id || undefined,
        hospital_name: h?.name, hospital_type: h?.type,
      };
    }
  }
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

  // ✅ Navigation: กลับหน้าที่เรียก
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

  const [formData, setFormData] = useState({
    patient_id: '', staff_id: '', appointment_type: 'follow_up',
    appointment_date: '', appointment_time: '', duration_minutes: 30,
    location: 'clinic', notes: '',
  });

  const autoAppliedRef = useRef(false);

  // =====================================================
  // 📥 AUTH + โหลด cache รพ. (ไม่บล็อก auto-select)
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    (async () => {
      try {
        setLoading(true);
        const [uH, allH] = await Promise.all([
          getUserHospitalInfo(userData.id).catch(() => null),
          loadAllHospitals(),
        ]);
        setUserHospital(uH);
        setAllHospitals(allH);
      } catch (e) { console.error('❌ [init]', e); }
      finally { setLoading(false); }
    })();
  }, [router]);

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
    if (!urlPatientId) { setError('ไม่พบ ?patient_id ใน URL — กรุณาเข้าจากลิงก์ที่ถูกต้อง'); return; }
    setAutoLoading(true); setError('');
    try {
      // STEP 1
      const p = await fetchPatientById(urlPatientId);
      if (!p) { setError(`ไม่พบข้อมูลผู้ป่วย (id: ${urlPatientId})`); return; }

      // STEP 2
      const h = await fetchHospitalById(p.hospital_id || '');
      const parent = h?.parent_id ? await fetchHospitalById(h.parent_id) : undefined;
      const extras = await fetchUserExtras(p.id);
      const enriched: Patient = {
        ...p, ...extras,
        hospital_name: h?.name, hospital_code: h?.code, hospital_type: h?.type,
        parent_hospital: parent,
      };
      setLockedPatient(enriched);
      setFormData((prev) => ({ ...prev, patient_id: enriched.id }));

      // STEP 3
      const { ids, label } = computePatientNetwork(enriched, allHospitals);
      setScopeLabel(label);

      // STEP 4
      const list = await fetchCoachNetworkList(ids);
      setNetworkCoaches(list);

      // STEP 5 — urlCoachId > profiles.coach_id
      const targetCoachId = urlCoachId || enriched.coach_id || '';
      if (targetCoachId) {
        let found = list.find((c) => c.user_id === targetCoachId) || null;
        if (!found) found = await fetchCoachByAnyId(targetCoachId);
        if (found) {
          if (!list.some((c) => c.user_id === found!.user_id))
            setNetworkCoaches((prev) => [found!, ...prev]);
          setLockedCoach(found);
          setFormData((prev) => ({ ...prev, staff_id: found!.user_id }));
          setStaffSearchTerm(`${found.full_name_th}${found.specialization_th ? ` (${found.specialization_th})` : ''}`);
          setCoachMissingWarning(false);
        } else {
          setCoachMissingWarning(true);
        }
      } else {
        setCoachMissingWarning(true);
      }
    } catch (e: any) {
      console.error('❌ [autoSelect]', e);
      setError(e?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setAutoLoading(false);
    }
  }, [urlPatientId, urlCoachId, allHospitals]);

  useEffect(() => {
    if (loading || !urlPatientId || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    void runAutoSelect();
  }, [loading, urlPatientId, runAutoSelect]);

  // =====================================================
  // ⚙️ HANDLERS
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const filteredCoaches = useMemo(() => {
    const term = staffSearchTerm.trim().toLowerCase();
    if (!term) return networkCoaches.slice(0, 100);
    return networkCoaches.filter((c) => {
      const name = (c.full_name_th || '').toLowerCase();
      const spec = (c.specialization_th || '').toLowerCase();
      const hosp = (c.hospital_name || '').toLowerCase();
      return name.includes(term) || spec.includes(term) || hosp.includes(term);
    }).slice(0, 100);
  }, [networkCoaches, staffSearchTerm]);

  const handleOpenCoachDropdown = () => {
    setIsStaffDropdownOpen(true);
    if (lockedPatient && networkCoaches.length === 0) {
      setAutoLoading(true);
      const { ids, label } = computePatientNetwork(lockedPatient, allHospitals);
      setScopeLabel(label);
      fetchCoachNetworkList(ids).then((list) => {
        setNetworkCoaches(list);
        setAutoLoading(false);
      });
    }
  };

  const handleSelectCoach = (c: Coach) => {
    setLockedCoach(c);
    setCoachMissingWarning(false);
    setFormData((prev) => ({ ...prev, staff_id: c.user_id }));
    setStaffSearchTerm(`${c.full_name_th}${c.specialization_th ? ` (${c.specialization_th})` : ''}`);
    setIsStaffDropdownOpen(false);
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
    if (Object.keys(errors).length > 0) { setError(Object.values(errors)[0]); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
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
        setSuccess(true);
        setTimeout(() => router.push(backUrl), 800);
      } else setError(result.error || 'เกิดข้อผิดพลาด');
    } catch (err: any) { setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'); }
    finally { setSubmitting(false); }
  };

  const typeBadge = (t?: 'main' | 'sub') => t === 'main' ? ' (แม่ข่าย)' : t === 'sub' ? ' (ลูกข่าย)' : '';

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

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button onClick={() => router.push(backUrl)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ ({urlFrom || 'default'})
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg"><CalendarPlus className="w-6 h-6" /></span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600 mt-1">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {userHospital && (
                <div className="text-right bg-blue-50 px-4 py-3 rounded-xl border border-blue-200">
                  <p className="font-semibold text-gray-800">{user?.full_name_th}</p>
                  <p className="text-xs text-gray-500">{userHospital.name} ({userHospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})</p>
                </div>
              )}
              <button onClick={() => { logout(); router.push('/admin/login'); }} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
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
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
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
            {lockedPatient && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติจากลิงก์ ✓</span>}
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
                  <p className="text-lg font-bold text-gray-800">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">HN: {lockedPatient.hospital_number}</span>
                    {lockedPatient.id_card && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <IdCard className="w-3 h-3 text-gray-400" /> บัตร: {lockedPatient.id_card}
                      </span>
                    )}
                    {lockedPatient.hospital_name && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <Hospital className="w-3 h-3 text-gray-400" />
                        รพ.: {lockedPatient.hospital_name}{typeBadge(lockedPatient.hospital_type)}
                        {lockedPatient.parent_hospital && <span className="text-gray-400"> → แม่ข่าย: {lockedPatient.parent_hospital.name}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <p className="mb-3">ไม่พบข้อมูลผู้ป่วย</p>
              <button type="button" onClick={() => { autoAppliedRef.current = false; void runAutoSelect(); }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 flex items-center gap-1 mx-auto">
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
            {lockedCoach && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติ ✓</span>}
            {coachMissingWarning && !lockedCoach && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">กรุณาเลือกผู้ดูแล</span>}
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
                          <Hospital className="w-3 h-3 text-gray-400" /> สังกัด: {lockedCoach.hospital_name}{typeBadge(lockedCoach.hospital_type)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleUnlockCoach}
                  className="px-3 py-1.5 text-xs border border-purple-300 bg-white text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1"
                  title="เลือกผู้ดูแลท่านอื่นในเครือข่ายโรงพยาบาลของผู้ป่วย">
                  <RefreshCw className="w-3 h-3" /> เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : (
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="พิมพ์ชื่อ, ความเชี่ยวชาญ หรือชื่อ รพ. เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => { setStaffSearchTerm(e.target.value); setIsStaffDropdownOpen(true); }}
                  onFocus={handleOpenCoachDropdown}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`} />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-xs text-purple-800 font-medium flex items-center gap-2 sticky top-0">
                    <Building2 className="w-3 h-3" />
                    ขอบเขต: เครือข่าย รพ.ผู้ป่วย — <strong>{scopeLabel}</strong> ({networkCoaches.length} คน)
                  </div>
                  {filteredCoaches.length > 0 ? (
                    filteredCoaches.map((c) => (
                      <div key={c.user_id} onClick={() => handleSelectCoach(c)}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex justify-between flex-wrap gap-2">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <Hospital className="w-3 h-3" /> สังกัด: {c.hospital_name || 'ไม่ระบุ รพ.'}{typeBadge(c.hospital_type)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      {networkCoaches.length === 0 ? `ไม่พบบุคลากรในเครือข่าย ${scopeLabel}` : 'ไม่พบข้อมูลที่ค้นหา'}
                    </div>
                  )}
                </div>
              )}
              {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
            </div>
          )}
        </div>

        {/* ===== SECTION 3: รายละเอียด ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">3</span>
            รายละเอียดนัดหมาย
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทนัดหมาย *</label>
              <select name="appointment_type" value={formData.appointment_type} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="follow_up">ติดตามผล</option><option value="consultation">ปรึกษาแพทย์</option>
                <option value="checkup">ตรวจสุขภาพ</option><option value="lab">เจาะเลือด/แลป</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select name="location" value={formData.location} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="clinic">คลินิก</option><option value="ward">หอผู้ป่วย</option>
                <option value="online">ออนไลน์ (Telemed)</option><option value="home_visit">เยี่ยมบ้าน</option>
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
              <label className="block text-sm font-medium text-gray-700 mb-1"><Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option><option value="30">30 นาที</option>
                <option value="45">45 นาที</option><option value="60">1 ชั่วโมง</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={submitting || !lockedPatient} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          <button type="button" onClick={() => router.push(backUrl)} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">ยกเลิก</button>
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <NewAppointmentContent />
    </Suspense>
  );
}