// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 23 พฤศจิกายน 2569 (v3 — แก้ dropdown ผู้ดูแลไม่แสดงรายชื่อเครือข่ายผู้ป่วย)
// ✅ จุดที่แก้:
//    1. ตัด id_card ออกจาก select ทุกชุด (column ไม่มีจริง → 400)
//    2. ชุดสำรองของผู้ป่วยต้องมี hospital_id + coach_id เสมอ (เพื่อคำนวณเครือข่าย)
//    3. "เปลี่ยนผู้ดูแล" → ล้างคำค้นหา + เปิด dropdown เห็นรายชื่อทั้งเครือข่ายทันที
//    4. ตัวกรองค้นหาแบบแยก parts: "ชื่อ(ความเชี่ยวชาญ)" match ได้ทั้งสองส่วน
//    5. โหลดโค้ชเครือข่ายผู้ป่วยด้วย getCoachesWithHospitals ก่อน แล้วค่อย fallback
//    6. ถ้า list เครือข่ายว่างตอนเปลี่ยนผู้ดูแล → re-fetch ให้อัตโนมัติ
'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  logout,
  createAppointment,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  getPatientsByHospitalNetwork,
} from '@/lib/supabase/queries';
import {
  CalendarPlus,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Stethoscope,
  LogOut,
  CheckCircle,
  XCircle,
  Search,
  Users,
  Clock,
  FileText,
  Hospital,
  IdCard,
  Building2,
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}
interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}
interface Coach {
  id: string;
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  is_active: boolean;
  hospital_id?: string;
  hospital_name?: string;
  hospital_type?: 'main' | 'sub';
  users?: any;
}
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  phone?: string;
  hospital_id?: string;
  hospital_name?: string;
  hospital_code?: string;
  hospital_type?: 'main' | 'sub';
  parent_id?: string | null;
  parent_hospital?: Hospital;
  coach_id?: string | null;
}

// =====================================================
// 🧰 Field-Set Fallback (ตัด id_card ออกแล้ว!)
// =====================================================
const PATIENT_SELECTS = [
  'id, first_name, last_name, hospital_number, phone, hospital_id, coach_id',
  'id, first_name, last_name, hospital_number, hospital_id, coach_id',
  'id, first_name, last_name, hospital_number, hospital_id',
  'id, first_name, last_name, hospital_number',
];
const COACH_SELECTS = [
  'user_id, full_name_th, specialization_th, is_active, users!inner(hospital_id, role, hospitals(id, name, code, type))',
  'user_id, full_name_th, specialization_th, is_active, users!inner(hospital_id, hospitals(id, name))',
  'user_id, full_name_th, is_active, users!inner(hospital_id)',
  'user_id, full_name_th',
];

function normalizeCoach(d: any): Coach {
  const u = Array.isArray(d.users) ? d.users[0] : d.users;
  const h = Array.isArray(u?.hospitals) ? u.hospitals[0] : u?.hospitals;
  return {
    id: d.user_id ?? d.id,
    user_id: d.user_id,
    full_name_th: d.full_name_th,
    specialization_th: d.specialization_th,
    is_active: d.is_active ?? true,
    hospital_id: u?.hospital_id,
    hospital_name: h?.name,
    hospital_type: h?.type,
    users: u,
  };
}

async function fetchPatientById(id: string): Promise<Patient | null> {
  for (const sel of PATIENT_SELECTS) {
    const { data, error } = await supabase
      .from('profiles')
      .select(sel)
      .eq('id', id)
      .maybeSingle();
    if (!error && data) return data as Patient;
    console.warn('[fetchPatientById] ชุดฟิลด์ fail:', sel, '→', error?.message);
  }
  return null;
}

async function fetchPatientsByHospitals(ids: string[]): Promise<Patient[]> {
  if (ids.length === 0) return [];
  for (const sel of PATIENT_SELECTS) {
    let out: Patient[] = [];
    let ok = true;
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('profiles')
        .select(sel)
        .eq('is_active', true)
        .in('hospital_id', ids)
        .order('hospital_number', { ascending: true })
        .range(from, from + size - 1);
      if (error) {
        ok = false;
        console.warn('[fetchPatientsByHospitals] ชุดฟิลด์ fail:', sel, '→', error.message);
        break;
      }
      out.push(...((data || []) as Patient[]));
      if (!data || data.length < size) break;
      from += size;
      if (from > 50000) break;
    }
    if (ok) return out;
  }
  return [];
}

/** โหลดโค้ชตาม list รพ. — ใช้ lib ก่อน แล้ว fallback field-set */
async function fetchCoachNetworkList(scopeIds: string[]): Promise<Coach[]> {
  if (scopeIds.length === 0) return [];
  // 1) lib function ที่เคยใช้ได้ผล
  if (typeof getCoachesWithHospitals === 'function') {
    try {
      const data = await getCoachesWithHospitals(scopeIds);
      if (data && data.length > 0) return (data as any[]).map(normalizeCoach);
      console.warn('[fetchCoachNetworkList] lib คืน list ว่าง → ลอง fallback');
    } catch (e) {
      console.warn('[fetchCoachNetworkList] lib fail → ลอง fallback', e);
    }
  }
  // 2) field-set fallback
  for (const sel of COACH_SELECTS) {
    const { data, error } = await supabase
      .from('doctors')
      .select(sel)
      .eq('is_active', true)
      .in('users.hospital_id', scopeIds)
      .limit(2000);
    if (!error && data && data.length > 0) {
      return (data as any[])
        .map(normalizeCoach)
        .sort((a, b) => (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th'));
    }
    console.warn('[fetchCoachNetworkList] ชุดฟิลด์ fail:', sel, '→', error?.message);
  }
  return [];
}

async function fetchCoachById(userId: string): Promise<Coach | null> {
  for (const sel of COACH_SELECTS) {
    const { data, error } = await supabase
      .from('doctors')
      .select(sel)
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) return normalizeCoach(data);
    console.warn('[fetchCoachById] ชุดฟิลด์ fail:', sel, '→', error?.message);
  }
  return null;
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');
  const backUrl =
    fromParam === 'care-pathway-dashboard'
      ? '/admin/care-pathway-dashboard'
      : '/admin/appointments/view';

  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);

  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [networkHospitals, setNetworkHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const [loading, setLoading] = useState(true);
  const [coachLoading, setCoachLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [coachMissingWarning, setCoachMissingWarning] = useState(false);

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
  const autoAppliedRef = useRef(false);

  const coachDisplayText = (c: Coach) =>
    `${c.full_name_th}${c.specialization_th ? ` (${c.specialization_th})` : ''}`;

  const enrichPatient = (p: Patient): Patient => {
    const h = allHospitals.find((x) => x.id === p.hospital_id);
    const parent = h?.parent_id ? allHospitals.find((x) => x.id === h.parent_id) : undefined;
    return {
      ...p,
      hospital_name: p.hospital_name || h?.name,
      hospital_code: p.hospital_code || h?.code,
      hospital_type: p.hospital_type || h?.type,
      parent_id: p.parent_id ?? h?.parent_id,
      parent_hospital: p.parent_hospital || parent,
    };
  };

  // เครือข่าย รพ.ของ "ผู้ป่วย" (แม่ข่าย + ลูกข่าย)
  const getPatientNetwork = (patient: Patient): Hospital[] => {
    if (patient.hospital_id) {
      const h = allHospitals.find((x) => x.id === patient.hospital_id);
      if (h) {
        const rootId = h.type === 'main' ? h.id : h.parent_id || h.id;
        return allHospitals.filter((x) => x.id === rootId || x.parent_id === rootId);
      }
    }
    return networkHospitals;
  };

  const networkScopeLabel = (patient: Patient | null): string => {
    if (!patient) return '-';
    const net = getPatientNetwork(patient);
    const rootId =
      patient.hospital_type === 'main'
        ? patient.hospital_id
        : patient.parent_id || patient.hospital_id;
    const main = net.find((h) => h.id === rootId) || net.find((h) => h.type === 'main');
    return main ? main.name : patient.hospital_name || '-';
  };

  // =====================================================
  // ✅ AUTO: ล็อกผู้ป่วย + โหลดโค้ชตามเครือข่ายผู้ป่วย
  // =====================================================
  const applyAutoPatient = (p: Patient, preferredCoachId?: string) => {
    const enriched = enrichPatient(p);
    setFormData((prev) => ({ ...prev, patient_id: enriched.id, staff_id: '' }));
    setPatientSearchTerm(`${enriched.first_name} ${enriched.last_name} (${enriched.hospital_number})`);
    setLockedPatient(enriched);
    setLockedCoach(null);
    setStaffSearchTerm('');
    setCoachMissingWarning(false);
    const scope = getPatientNetwork(enriched);
    void loadCoachScopeAndAutoFill(enriched, scope, preferredCoachId);
    console.log('✅ [auto] ผู้ป่วย:', enriched.id, enriched.first_name, enriched.last_name);
  };

  const loadCoachScopeAndAutoFill = async (
    patient: Patient,
    scope: Hospital[],
    preferredCoachId?: string
  ) => {
    setCoachLoading(true);
    try {
      const scopeIds = scope.map((h) => h.id);
      const list = await fetchCoachNetworkList(scopeIds);
      setCoaches(list);

      let coachId = preferredCoachId || patient.coach_id || '';
      if (!coachId) {
        const { data } = await supabase
          .from('profiles')
          .select('coach_id')
          .eq('id', patient.id)
          .maybeSingle();
        coachId = data?.coach_id || '';
      }
      if (!coachId) {
        setCoachMissingWarning(true);
        return;
      }

      let found = list.find((c) => c.user_id === coachId) || null;
      if (!found) {
        found = await fetchCoachById(coachId);
        if (found) setCoaches((prev) => [found!, ...prev]);
      }

      if (found) {
        setFormData((prev) => ({ ...prev, staff_id: found!.user_id }));
        setStaffSearchTerm(coachDisplayText(found));
        setLockedCoach(found);
        setCoachMissingWarning(false);
        console.log('✅ [auto] ผู้ดูแล:', found.user_id, found.full_name_th);
      } else {
        setCoachMissingWarning(true);
      }
    } catch (e) {
      console.error('❌ [loadCoachScopeAndAutoFill]', e);
      setCoachMissingWarning(true);
    } finally {
      setCoachLoading(false);
    }
  };

  // =====================================================
  // 📥 AUTH + โหลดข้อมูลเริ่มต้น
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
    (async () => {
      try {
        setLoading(true);
        const [uHospital, allH] = await Promise.all([
          getUserHospitalInfo(userData.id),
          getHospitalsWithHierarchy(),
        ]);
        setUserHospital(uHospital);
        setAllHospitals(allH);

        let netHospitals: Hospital[] = [];
        if (uHospital) {
          const rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id || uHospital.id;
          netHospitals = allH.filter((h) => h.id === rootId || h.parent_id === rootId);
        } else {
          netHospitals = allH;
        }
        setNetworkHospitals(netHospitals);
        const ids = netHospitals.map((h) => h.id);

        const [coachList, patientList] = await Promise.all([
          fetchCoachNetworkList(ids),
          fetchPatientsByHospitals(ids),
        ]);
        setCoaches(coachList);
        setPatients(patientList);
      } catch (err) {
        console.error('❌ [initNetwork]', err);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ✅ ล็อกผู้ป่วยจาก URL — query ตรงด้วย id เสมอ
  useEffect(() => {
    if (!urlPatientId || loading || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    (async () => {
      const inList = patients.find((p) => p.id === urlPatientId);
      if (inList) {
        applyAutoPatient(inList, urlCoachId || undefined);
        return;
      }
      const p = await fetchPatientById(urlPatientId);
      if (p) {
        applyAutoPatient(p, urlCoachId || undefined);
      } else {
        setError(`ไม่พบข้อมูลผู้ป่วย id: ${urlPatientId} — กรุณาเลือกผู้ป่วยใหม่`);
        autoAppliedRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPatientId, loading, patients]);

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node))
        setIsPatientDropdownOpen(false);
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node))
        setIsStaffDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const filteredPatients = useMemo(() => {
    const term = patientSearchTerm.trim().toLowerCase();
    if (!term) return patients.slice(0, 50);
    return patients
      .filter(
        (p) =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
          (p.hospital_number || '').toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [patients, patientSearchTerm]);

  // ✅ ตัวกรองโค้ชแบบแยก parts: "นารีต๊ะ หลง(อาสาสมัครสาธารณสุข)" match ได้ทั้งสองส่วน
  const filteredStaff = useMemo(() => {
    const term = staffSearchTerm.trim().toLowerCase();
    if (!term) return coaches.slice(0, 100);
    const parts = term
      .split(/[()]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return coaches
      .filter((c) => {
        const name = (c.full_name_th || '').toLowerCase();
        const spec = (c.specialization_th || '').toLowerCase();
        return parts.some((p) => name.includes(p) || spec.includes(p));
      })
      .slice(0, 100);
  }, [coaches, staffSearchTerm]);

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};
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
    setLoading(true);
    try {
      const dateTimeStr = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const result = await createAppointment({
        patient_id: formData.patient_id,
        staff_id: formData.staff_id,
        appointment_type: formData.appointment_type,
        appointment_datetime: dateTimeStr,
        duration_minutes: parseInt(formData.duration_minutes.toString()),
        location: formData.location,
        notes: formData.notes || undefined,
        created_by: user?.id,
        status: 'scheduled',
      });
      if (result.success) {
        router.push(backUrl);
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setLoading(false);
    }
  };

  // เปลี่ยนผู้ป่วย → ล้างทุกอย่าง กลับโหมดค้นหา
  const handleUnlockPatient = () => {
    setLockedPatient(null);
    setLockedCoach(null);
    setCoachMissingWarning(false);
    setFormData((prev) => ({ ...prev, patient_id: '', staff_id: '' }));
    setPatientSearchTerm('');
    setStaffSearchTerm('');
    autoAppliedRef.current = false;
    void fetchCoachNetworkList(networkHospitals.map((h) => h.id)).then(setCoaches);
  };

  // ✅ เปลี่ยนผู้ดูแล → ล้างคำค้นหา + เปิด dropdown เห็นทั้งเครือข่ายทันที
  const handleUnlockCoach = () => {
    setLockedCoach(null);
    setStaffSearchTerm('');
    setIsStaffDropdownOpen(true);
    // ถ้า list เครือข่ายผู้ป่วยว่าง (query เคย fail) → re-fetch ให้อัตโนมัติ
    if (lockedPatient && coaches.length === 0) {
      void (async () => {
        setCoachLoading(true);
        try {
          const list = await fetchCoachNetworkList(getPatientNetwork(lockedPatient).map((h) => h.id));
          setCoaches(list);
        } finally {
          setCoachLoading(false);
        }
      })();
    }
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
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
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> กลับ
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

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ============ SECTION 1: ผู้ป่วย ============ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">
              1
            </span>
            ผู้ป่วย <span className="text-red-500">*</span>
            {lockedPatient && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                เลือกอัตโนมัติ ✓
              </span>
            )}
          </h2>
          {lockedPatient ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
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
                      {lockedPatient.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <Hospital className="w-3 h-3 text-gray-400" /> รพ.:{' '}
                          {lockedPatient.hospital_name}
                          {lockedPatient.parent_hospital ? (
                            <span className="text-gray-400">
                              {' '}
                              (แม่ข่าย: {lockedPatient.parent_hospital.name})
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlockPatient}
                  className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                >
                  เปลี่ยนผู้ป่วย
                </button>
              </div>
            </div>
          ) : (
            <div ref={patientDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อ หรือ HN เพื่อค้นหา..."
                  value={patientSearchTerm}
                  onChange={(e) => {
                    setPatientSearchTerm(e.target.value);
                    setIsPatientDropdownOpen(true);
                    if (formData.patient_id) {
                      setFormData((p) => ({ ...p, patient_id: '' }));
                      setPatientSearchTerm('');
                    }
                  }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${
                    validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {isPatientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setIsPatientDropdownOpen(false);
                          applyAutoPatient(p);
                        }}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <span className="font-bold text-gray-800">
                          {p.first_name} {p.last_name}
                        </span>
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          HN: {p.hospital_number}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>
                  )}
                </div>
              )}
              {validationErrors.patient_id && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>
              )}
            </div>
          )}
        </div>

        {/* ============ SECTION 2: แพทย์/เจ้าหน้าที่ ============ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">
              2
            </span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                เลือกอัตโนมัติ ✓
              </span>
            )}
            {coachMissingWarning && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                กรุณาเลือกผู้ดูแลเอง
              </span>
            )}
          </h2>
          {lockedCoach ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Stethoscope className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ดูแล / แพทย์ของนัดหมายนี้
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      {lockedCoach.specialization_th && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          ความเชี่ยวชาญ: {lockedCoach.specialization_th}
                        </span>
                      )}
                      {lockedCoach.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <Hospital className="w-3 h-3 text-gray-400" /> รพ.:{' '}
                          {lockedCoach.hospital_name}
                          {lockedCoach.hospital_type === 'main'
                            ? ' (แม่ข่าย)'
                            : lockedCoach.hospital_type === 'sub'
                            ? ' (ลูกข่าย)'
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlockCoach}
                  className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                  title="เลือกผู้ดูแลท่านอื่นในเครือข่ายโรงพยาบาลของผู้ป่วย"
                >
                  เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : coachLoading ? (
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
                  placeholder="พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => {
                    setStaffSearchTerm(e.target.value);
                    setIsStaffDropdownOpen(true);
                    if (formData.staff_id) {
                      setFormData((p) => ({ ...p, staff_id: '' }));
                    }
                  }}
                  onFocus={() => setIsStaffDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${
                    validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((c) => (
                      <div
                        key={c.user_id}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, staff_id: c.user_id }));
                          setStaffSearchTerm(coachDisplayText(c));
                          setLockedCoach(c);
                          setCoachMissingWarning(false);
                          setIsStaffDropdownOpen(false);
                        }}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex justify-between">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded">
                            {c.hospital_name || 'ไม่ระบุ รพ.'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      {coaches.length === 0
                        ? 'ไม่พบผู้ดูแลในเครือข่ายโรงพยาบาลของผู้ป่วย — ลองเปลี่ยนผู้ป่วยหรือรีเฟรชหน้า'
                        : 'ไม่พบข้อมูลที่ค้นหา'}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {lockedPatient
                  ? `แสดงเฉพาะผู้ดูแลในเครือข่าย รพ.ของผู้ป่วย: ${networkScopeLabel(
                      lockedPatient
                    )} + ลูกข่าย (${coaches.length} คน)`
                  : 'เลือกผู้ป่วยก่อน ระบบจะกรองผู้ดูแลตามเครือข่ายของผู้ป่วย'}
              </p>
              {validationErrors.staff_id && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>
              )}
            </div>
          )}
        </div>

        {/* ============ SECTION 3: รายละเอียดนัดหมาย ============ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">
              3
            </span>
            รายละเอียดนัดหมาย
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทนัดหมาย *</label>
              <select
                name="appointment_type"
                value={formData.appointment_type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              >
                <option value="follow_up">ติดตามผล</option>
                <option value="consultation">ปรึกษาแพทย์</option>
                <option value="checkup">ตรวจสุขภาพ</option>
                <option value="lab">เจาะเลือด/แลป</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              >
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
                <input
                  type="date"
                  name="appointment_date"
                  value={formData.appointment_date}
                  onChange={handleChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <input
                  type="time"
                  name="appointment_time"
                  value={formData.appointment_time}
                  onChange={handleChange}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)
              </label>
              <select
                name="duration_minutes"
                value={formData.duration_minutes}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              >
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
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4 pb-8">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? (
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