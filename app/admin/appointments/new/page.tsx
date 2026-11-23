// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 23 พฤศจิกายน 2569
// ✅ การแก้ไข: Auto-fill ผู้ป่วย/โค้ช, Dropdown โค้ชเฉพาะเครือข่าย รพ. (แม่ข่าย+ลูกข่าย), Navigation กลับหน้าเดิม, ไม่มี Debug UI
'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
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
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital,
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; code?: string; type?: 'main' | 'sub'; parent_id?: string | null;
}
interface UserHospital {
  id: string; name: string; code?: string; type?: 'main' | 'sub'; parent_id?: string | null;
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
  hospital_id?: string;
  hospital_name?: string;
  hospital_type?: 'main' | 'sub';
  parent_hospital?: Hospital;
  coach_id?: string | null;
}

// =====================================================
// 🧰 Helper: Fetch Patient by ID (Fallback Chain)
// =====================================================
async function fetchPatientById(id: string): Promise<Patient | null> {
  const selects = [
    'id, first_name, last_name, hospital_number, hospital_id, coach_id',
    'id, first_name, last_name, hospital_number, hospital_id',
    'id, first_name, last_name, hospital_number',
  ];
  for (const sel of selects) {
    const { data, error } = await supabase.from('profiles').select(sel).eq('id', id).maybeSingle();
    if (!error && data) return data as Patient;
  }
  return null;
}

// =====================================================
// 🧰 Helper: Fetch Coaches in Network (3-Step Query)
// =====================================================
async function fetchCoachNetworkList(networkIds: string[]): Promise<Coach[]> {
  if (!networkIds.length) return [];
  
  // Step A: ดึง doctors ที่ active
  const { data: docs } = await supabase
    .from('doctors')
    .select('user_id, full_name_th, specialization_th, is_active')
    .eq('is_active', true);
  if (!docs || docs.length === 0) return [];

  // Step B: ดึง hospital_id ของ coaches เหล่านี้
  const userIds = docs.map((d) => d.user_id);
  const { data: users } = await supabase
    .from('users')
    .select('id, hospital_id')
    .in('id', userIds);
  
  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u.hospital_id]));

  // Step C: กรองเฉพาะที่อยู่ในเครือข่าย
  const filteredDocs = docs.filter((d) => networkIds.includes(userMap[d.user_id] || ''));
  if (filteredDocs.length === 0) return [];

  // Step D: ดึงชื่อและประเภทโรงพยาบาล
  const hospIds = [...new Set(filteredDocs.map((d) => userMap[d.user_id]))] as string[];
  const { data: hosps } = await supabase
    .from('hospitals')
    .select('id, name, type')
    .in('id', hospIds);
  
  const hospMap = Object.fromEntries((hosps || []).map((h) => [h.id, h]));

  return filteredDocs.map((d) => {
    const hId = userMap[d.user_id];
    const h = hospMap[hId];
    return {
      user_id: d.user_id,
      full_name_th: d.full_name_th,
      specialization_th: d.specialization_th,
      hospital_id: hId,
      hospital_name: h?.name || 'ไม่ระบุ',
      hospital_type: h?.type,
    };
  });
}

// =====================================================
// 🧰 Helper: Fetch Specific Coach (Fallback)
// =====================================================
async function fetchCoachById(id: string): Promise<Coach | null> {
  const { data: doc } = await supabase
    .from('doctors')
    .select('user_id, full_name_th, specialization_th, is_active')
    .eq('user_id', id)
    .maybeSingle();
  if (!doc) return null;

  const { data: u } = await supabase.from('users').select('hospital_id').eq('id', doc.user_id).maybeSingle();
  const { data: h } = await supabase.from('hospitals').select('id, name, type').eq('id', u?.hospital_id).maybeSingle();

  return {
    user_id: doc.user_id,
    full_name_th: doc.full_name_th,
    specialization_th: doc.specialization_th,
    hospital_id: u?.hospital_id,
    hospital_name: h?.name || 'ไม่ระบุ',
    hospital_type: h?.type,
  };
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ Navigation
  const fromParam = searchParams.get('from');
  const backUrl = fromParam === 'care-pathway-dashboard' ? '/admin/care-pathway-dashboard' : '/admin/appointments/view';
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  const coachDropdownRef = useRef<HTMLDivElement>(null);

  // States
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [coachMissingWarning, setCoachMissingWarning] = useState(false);
  
  const [isCoachDropdownOpen, setIsCoachDropdownOpen] = useState(false);
  const [coachSearchTerm, setCoachSearchTerm] = useState('');
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    patient_id: '', staff_id: '', appointment_type: 'follow_up',
    appointment_date: '', appointment_time: '', duration_minutes: 30,
    location: 'clinic', notes: '',
  });

  const autoAppliedRef = useRef(false);

  // =====================================================
  // 📥 AUTH & Initial Load
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
        const uH = await getUserHospitalInfo(userData.id);
        setUserHospital(uH);
        
        // โหลดโรงพยาบาลทั้งหมดเพื่อใช้คำนวณเครือข่าย
        const { data: hData } = await supabase.from('hospitals').select('id, name, code, type, parent_id');
        setAllHospitals(hData || []);
      } catch (e) {
        console.error('❌ [init]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Click outside to close coach dropdown
  useEffect(() => {
    const fn = (ev: MouseEvent) => {
      if (coachDropdownRef.current && !coachDropdownRef.current.contains(ev.target as Node)) {
        setIsCoachDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // =====================================================
  // 🧠 AUTO-FILL Logic
  // =====================================================
  useEffect(() => {
    if (!urlPatientId || loading || autoAppliedRef.current || allHospitals.length === 0) return;
    autoAppliedRef.current = true;

    (async () => {
      // [STEP 1 & 2] Fetch & Enrich Patient
      const p = await fetchPatientById(urlPatientId);
      if (!p) {
        setError('ไม่พบข้อมูลผู้ป่วยที่ระบุ');
        return;
      }

      const h = allHospitals.find((x) => x.id === p.hospital_id);
      const parent = h?.parent_id ? allHospitals.find((x) => x.id === h.parent_id) : undefined;
      const enrichedPatient: Patient = {
        ...p,
        hospital_name: h?.name,
        hospital_type: h?.type,
        parent_hospital: parent,
      };

      setLockedPatient(enrichedPatient);
      setFormData((prev) => ({ ...prev, patient_id: enrichedPatient.id }));

      // [STEP 3] Compute Patient Network
      let networkIds = [enrichedPatient.hospital_id];
      if (h?.type === 'main') {
        const subs = allHospitals.filter((x) => x.parent_id === h.id).map((x) => x.id);
        networkIds = [...networkIds, ...subs];
      } else if (h?.type === 'sub' && h.parent_id) {
        networkIds = [...networkIds, h.parent_id];
      }

      // [STEP 4] Fetch Coaches in Network
      const coaches = await fetchCoachNetworkList(networkIds.filter(Boolean) as string[]);
      setAvailableCoaches(coaches);

      // [STEP 5] Lock Coach
      const targetCoachId = urlCoachId || enrichedPatient.coach_id || '';
      if (targetCoachId) {
        let found = coaches.find((c) => c.user_id === targetCoachId) || null;
        if (!found) {
          found = await fetchCoachById(targetCoachId);
          if (found) setAvailableCoaches((prev) => [found, ...prev]);
        }

        if (found) {
          setLockedCoach(found);
          setFormData((prev) => ({ ...prev, staff_id: found.user_id }));
          setCoachMissingWarning(false);
        } else {
          setLockedCoach(null);
          setCoachMissingWarning(true);
        }
      } else {
        setLockedCoach(null);
        setCoachMissingWarning(true);
      }
    })();
  }, [urlPatientId, loading, allHospitals]);

  // =====================================================
  // ⚙️ Handlers
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleUnlockCoach = () => {
    setLockedCoach(null);
    setCoachSearchTerm('');
    setIsCoachDropdownOpen(true);
  };

  const handleSelectCoach = (c: Coach) => {
    setLockedCoach(c);
    setCoachMissingWarning(false);
    setFormData((prev) => ({ ...prev, staff_id: c.user_id }));
    setIsCoachDropdownOpen(false);
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
      setSubmitting(false);
    }
  };

  const filteredCoaches = useMemo(() => {
    if (!coachSearchTerm.trim()) return availableCoaches;
    const term = coachSearchTerm.toLowerCase();
    return availableCoaches.filter((c) => {
      const name = (c.full_name_th || '').toLowerCase();
      const spec = (c.specialization_th || '').toLowerCase();
      const hosp = (c.hospital_name || '').toLowerCase();
      return name.includes(term) || spec.includes(term) || hosp.includes(term);
    });
  }, [availableCoaches, coachSearchTerm]);

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
          <button onClick={() => router.push(backUrl)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ {fromParam === 'care-pathway-dashboard' ? '(care-pathway-dashboard)' : ''}
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg"><CalendarPlus className="w-6 h-6" /></span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600 mt-1">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>
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

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6 pt-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* ===== SECTION 1: ผู้ป่วย (Locked) ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
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
                    {lockedPatient.hospital_name && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <Hospital className="w-3 h-3 text-gray-400" />
                        รพ.: {lockedPatient.hospital_name}
                        {lockedPatient.hospital_type === 'main' ? ' (แม่ข่าย)' : lockedPatient.hospital_type === 'sub' ? ' (ลูกข่าย)' : ''}
                        {lockedPatient.parent_hospital && <span className="text-gray-400"> → แม่ข่าย: {lockedPatient.parent_hospital.name}</span>}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg text-gray-500 text-center">ไม่พบข้อมูลผู้ป่วย</div>
          )}
        </div>

        {/* ===== SECTION 2: แพทย์/เจ้าหน้าที่ ===== */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติ ✓</span>}
            {coachMissingWarning && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⚠️ กรุณาเลือกผู้ดูแล</span>}
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
                          <User className="w-3 h-3 text-gray-400" /> ความเชี่ยวชาญ: {lockedCoach.specialization_th}
                        </span>
                      )}
                      {lockedCoach.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <Hospital className="w-3 h-3 text-gray-400" /> สังกัด: {lockedCoach.hospital_name}
                          {lockedCoach.hospital_type === 'main' ? ' (แม่ข่าย)' : lockedCoach.hospital_type === 'sub' ? ' (ลูกข่าย)' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleUnlockCoach} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                  เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : (
            <div ref={coachDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหา..."
                  value={coachSearchTerm}
                  onChange={(e) => { setCoachSearchTerm(e.target.value); setIsCoachDropdownOpen(true); }}
                  onFocus={() => setIsCoachDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isCoachDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-xs text-purple-800 font-medium flex items-center gap-2 sticky top-0">
                    <Hospital className="w-3 h-3" />
                    แสดงเฉพาะบุคลากรในเครือข่ายโรงพยาบาลของผู้ป่วย
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
                            {c.hospital_name || 'ไม่ระบุ รพ.'}
                            {c.hospital_type === 'main' ? ' (แม่ข่าย)' : c.hospital_type === 'sub' ? ' (ลูกข่าย)' : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหาในเครือข่ายนี้</div>
                  )}
                </div>
              )}
              {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
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
              <label className="block text-sm font-medium text-gray-700 mb-1"><Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">1 ชั่วโมง</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" />
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
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