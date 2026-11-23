// app/admin/appointments/new/page.tsx
'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard, Building2, Bug
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
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  id_card?: string;
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
// 🧰 Helper Functions
// =====================================================

// 1. Fetch patient directly by ID
async function fetchPatientById(id: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, hospital_number, id_card, phone, hospital_id, coach_id')
    .eq('id', id)
    .maybeSingle();
    
  if (error || !data) return null;
  return data as Patient;
}

// 2. Fetch coaches within specific hospital network IDs
async function fetchCoachNetworkList(ids: string[]): Promise<Coach[]> {
  if (!ids || ids.length === 0) return [];
  
  const { data, error } = await supabase
    .from('doctors')
    .select(`
      id,
      user_id,
      full_name_th,
      specialization_th,
      is_active,
      users!doctors_user_id_fkey (
        hospital_id,
        hospitals (
          id,
          name,
          type
        )
      )
    `)
    .eq('is_active', true)
    .in('users.hospital_id', ids)
    .order('full_name_th', { ascending: true });

  if (error || !data) return [];

  return data.map((d: any) => {
    const u = d.users;
    const h = u?.hospitals;
    return {
      id: d.id,
      user_id: d.user_id,
      full_name_th: d.full_name_th,
      specialization_th: d.specialization_th,
      is_active: d.is_active,
      hospital_id: u?.hospital_id,
      hospital_name: h?.name,
      hospital_type: h?.type,
    };
  });
}

// 3. Fallback fetch coach by ID (if not in network list)
async function fetchCoachByAnyId(coachId: string): Promise<Coach | null> {
  const { data, error } = await supabase
    .from('doctors')
    .select(`
      id,
      user_id,
      full_name_th,
      specialization_th,
      is_active,
      users!doctors_user_id_fkey (
        hospital_id,
        hospitals (
          id,
          name,
          type
        )
      )
    `)
    .eq('user_id', coachId)
    .maybeSingle();

  if (error || !data) return null;

  const u = data.users;
  const h = u?.hospitals;
  return {
    id: data.id,
    user_id: data.user_id,
    full_name_th: data.full_name_th,
    specialization_th: data.specialization_th,
    is_active: data.is_active,
    hospital_id: u?.hospital_id,
    hospital_name: h?.name,
    hospital_type: h?.type,
  };
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. URL Params
  const fromParam = searchParams.get('from');
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  // Back URL logic
  const backUrl = useMemo(() => {
    if (fromParam === 'care-pathway-dashboard') return '/admin/care-pathway-dashboard';
    if (fromParam === 'appointments-view') return '/admin/appointments/view';
    if (fromParam === 'patient-detail' && urlPatientId) return `/admin/patients/${urlPatientId}`;
    return '/admin/appointments/view';
  }, [fromParam, urlPatientId]);

  // Refs
  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  // States
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [networkCoaches, setNetworkCoaches] = useState<Coach[]>([]);
  
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [coachMissingWarning, setCoachMissingWarning] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  
  // Search states for dropdowns
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  // Form state
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

  // =====================================================
  // 📥 AUTH & DATA LOADING
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
    loadInitialData(userData.id);
  }, [router]);

  const loadInitialData = async (userId: string) => {
    try {
      setLoading(true);
      const [uHospital, allH] = await Promise.all([
        getUserHospitalInfo(userId),
        getHospitalsWithHierarchy(),
      ]);
      setUserHospital(uHospital);
      setAllHospitals(allH || []);

      // Load all patients for search dropdown (filtered by user's hospital network)
      let netHospitals: Hospital[] = [];
      if (uHospital) {
        const rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id || uHospital.id;
        netHospitals = (allH || []).filter((h: any) => h.id === rootId || h.parent_id === rootId);
      } else {
        netHospitals = allH || [];
      }
      
      const netIds = netHospitals.map((h: any) => h.id);
      if (netIds.length > 0) {
        const { data: pats } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, hospital_number, id_card, hospital_id')
          .in('hospital_id', netIds)
          .order('first_name', { ascending: true });
        setPatients(pats || []);
      }

      // If URL has patient_id, auto-apply
      if (urlPatientId && !autoAppliedRef.current) {
        await applyAutoPatient(urlPatientId, urlCoachId || undefined);
      }
    } catch (err) {
      console.error('❌ [loadInitialData]', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลเริ่มต้น');
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // ⚙️ AUTO-SELECT LOGIC
  // =====================================================
  const applyAutoPatient = async (pId: string, cId?: string) => {
    autoAppliedRef.current = true;
    
    // 1. Fetch patient directly
    const p = await fetchPatientById(pId);
    if (!p) {
      setError(`ไม่พบข้อมูลผู้ป่วย (ID: ${pId})`);
      return;
    }

    // 2. Enrich hospital info
    const h = allHospitals.find((x) => x.id === p.hospital_id);
    const parent = h?.parent_id ? allHospitals.find((x) => x.id === h.parent_id) : undefined;
    const enrichedPatient: Patient = {
      ...p,
      hospital_name: h?.name,
      hospital_code: h?.code,
      hospital_type: h?.type,
      parent_id: h?.parent_id,
      parent_hospital: parent,
    };

    setLockedPatient(enrichedPatient);
    setFormData((prev) => ({ ...prev, patient_id: enrichedPatient.id }));
    setPatientSearchTerm(`${enrichedPatient.first_name} ${enrichedPatient.last_name} (${enrichedPatient.hospital_number})`);

    // 3. Calculate network IDs
    let networkIds: string[] = [];
    if (enrichedPatient.hospital_id) {
      if (enrichedPatient.hospital_type === 'main') {
        // Main hospital: include itself and all subs
        const subs = allHospitals.filter((x) => x.parent_id === enrichedPatient.hospital_id).map((x) => x.id);
        networkIds = [enrichedPatient.hospital_id, ...subs];
      } else if (enrichedPatient.hospital_type === 'sub' && enrichedPatient.parent_id) {
        // Sub hospital: include itself and main
        networkIds = [enrichedPatient.hospital_id, enrichedPatient.parent_id];
      } else {
        networkIds = [enrichedPatient.hospital_id];
      }
    }

    // 4. Fetch coaches in this network
    const coaches = await fetchCoachNetworkList(networkIds);
    setNetworkCoaches(coaches);

    // 5. Lock coach
    const targetCoachId = cId || enrichedPatient.coach_id || '';
    if (targetCoachId) {
      let found = coaches.find((c) => c.user_id === targetCoachId) || null;
      if (!found) {
        // Fallback: fetch directly by ID
        found = await fetchCoachByAnyId(targetCoachId);
        if (found) {
          setNetworkCoaches((prev) => [found!, ...prev]); // Add to list so it shows in dropdown
        }
      }

      if (found) {
        setLockedCoach(found);
        setFormData((prev) => ({ ...prev, staff_id: found!.user_id }));
        setStaffSearchTerm(`${found.full_name_th}${found.specialization_th ? ` (${found.specialization_th})` : ''}`);
        setCoachMissingWarning(false);
      } else {
        setLockedCoach(null);
        setCoachMissingWarning(true);
      }
    } else {
      setCoachMissingWarning(true);
    }
  };

  // =====================================================
  // ⚙️ HANDLERS
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleUnlockPatient = () => {
    setLockedPatient(null);
    setLockedCoach(null);
    setCoachMissingWarning(false);
    setFormData((prev) => ({ ...prev, patient_id: '', staff_id: '' }));
    setPatientSearchTerm('');
    setStaffSearchTerm('');
    autoAppliedRef.current = false;
  };

  const handleUnlockCoach = () => {
    setLockedCoach(null);
    setStaffSearchTerm('');
    setIsStaffDropdownOpen(true);
  };

  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const term = patientSearchTerm.toLowerCase();
    return patients
      .filter(
        (p) =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
          (p.hospital_number || '').toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [patients, patientSearchTerm]);

  const filteredStaff = useMemo(() => {
    if (!staffSearchTerm.trim()) return networkCoaches.slice(0, 50);
    const term = staffSearchTerm.toLowerCase();
    return networkCoaches
      .filter(
        (c) =>
          c.full_name_th.toLowerCase().includes(term) ||
          (c.specialization_th && c.specialization_th.toLowerCase().includes(term)) ||
          (c.hospital_name && c.hospital_name.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [networkCoaches, staffSearchTerm]);

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
        setSuccess(true);
        setTimeout(() => router.push(backUrl), 1000);
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setLoading(false);
    }
  };

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node)) {
        setIsPatientDropdownOpen(false);
      }
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node)) {
        setIsStaffDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
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
            <ArrowLeft className="w-4 h-4" /> กลับ
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

        {/* SECTION 1: ผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
            {lockedPatient && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติ ✓</span>}
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
                    <p className="text-lg font-bold text-gray-800">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">HN: {lockedPatient.hospital_number}</span>
                      {lockedPatient.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <Hospital className="w-3 h-3 text-gray-400" /> รพ.: {lockedPatient.hospital_name}
                          {lockedPatient.parent_hospital && <span className="text-gray-400"> (แม่ข่าย: {lockedPatient.parent_hospital.name})</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={handleUnlockPatient} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors">
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
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isPatientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          applyAutoPatient(p.id);
                          setIsPatientDropdownOpen(false);
                        }}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <span className="font-bold text-gray-800">{p.first_name} {p.last_name}</span>
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">HN: {p.hospital_number}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>
                  )}
                </div>
              )}
              {validationErrors.patient_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>}
            </div>
          )}
        </div>

        {/* SECTION 2: แพทย์/เจ้าหน้าที่ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติ ✓</span>}
            {coachMissingWarning && !lockedCoach && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⚠️ กรุณาเลือกผู้ดูแลเอง</span>}
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
                    if (formData.staff_id) {
                      setFormData((p) => ({ ...p, staff_id: '' }));
                      setStaffSearchTerm('');
                    }
                  }}
                  onFocus={() => setIsStaffDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {/* Debug / Info Header */}
                  <div className="px-4 py-2 bg-cyan-50 border-b border-cyan-100 text-xs text-cyan-800 font-medium flex items-center gap-2 sticky top-0">
                    <Building2 className="w-3 h-3" />
                    แสดงเฉพาะบุคลากรในเครือข่าย รพ. ของผู้ป่วย
                  </div>
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((c) => (
                      <div
                        key={c.user_id}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, staff_id: c.user_id }));
                          setStaffSearchTerm(`${c.full_name_th}${c.specialization_th ? ` (${c.specialization_th})` : ''}`);
                          setLockedCoach(c);
                          setCoachMissingWarning(false);
                          setIsStaffDropdownOpen(false);
                        }}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
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

        {/* SECTION 3: รายละเอียดนัดหมาย */}
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

        {/* Debug Section */}
        <div className="bg-gray-100 rounded-xl p-4 border border-gray-300">
          <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
            <Bug className="w-4 h-4" /> Debug Info
          </h3>
          <div className="text-xs font-mono text-gray-600 space-y-1">
            <p>URL patient_id: {urlPatientId || 'None'}</p>
            <p>URL coach_id: {urlCoachId || 'None'}</p>
            <p>Locked Patient ID: {lockedPatient?.id || 'None'}</p>
            <p>Locked Coach ID: {lockedCoach?.user_id || 'None'}</p>
            <p>Network Coaches Count: {networkCoaches.length}</p>
            <p>Form Patient ID: {formData.patient_id || 'None'}</p>
            <p>Form Staff ID: {formData.staff_id || 'None'}</p>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          <button type="button" onClick={() => router.push(backUrl)} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">
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