// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: รองรับ Auto-fill ผู้ป่วย/ผู้ดูแล + กรองโค้ชตามเครือข่าย รพ. ของผู้ป่วย + นำทางกลับที่ถูกต้อง
'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
  getUserHospitalInfo,
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard, RefreshCcw
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null;
}
interface UserHospital {
  id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}
interface Coach {
  user_id: string; full_name_th: string; specialization_th?: string; is_active: boolean;
  users?: { hospital_id?: string };
}
interface Patient {
  id: string; first_name: string; last_name: string; hospital_number: string;
  id_card?: string; phone?: string; hospital_id?: string; hospital_name?: string;
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ 1. อ่านพารามิเตอร์จาก URL
  const fromParam = searchParams.get('from') || 'appointments/view';
  const backUrl = fromParam === 'care-pathway-dashboard' ? '/admin/care-pathway-dashboard' : '/admin/appointments/view';
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  // Refs
  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  // Auth & User State
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);

  // Data State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientNetworkCoaches, setPatientNetworkCoaches] = useState<Coach[]>([]); // ✅ โค้ชในเครือข่าย รพ. ของผู้ป่วย
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  
  // Search States
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  // ✅ State สำหรับล็อกข้อมูลที่มาจาก URL
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    patient_id: '', staff_id: '', appointment_type: 'follow_up',
    appointment_date: '', appointment_time: '', duration_minutes: 30,
    location: 'clinic', notes: '',
  });

  // =====================================================
  // 📥 AUTH & DATA LOADING
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
  }, [router]);

  useEffect(() => {
    if (user && urlPatientId) {
      initializeFromUrl();
    } else if (user) {
      loadGeneralNetworkData();
    }
  }, [user, urlPatientId]);

  const loadUserHospital = async (userId: string) => {
    try { setUserHospital(await getUserHospitalInfo(userId)); } catch (e) { console.error(e); }
  };

  // ✅ ฟังก์ชันหลัก: โหลดข้อมูลตาม Patient ID และกรองโค้ชตามเครือข่าย รพ. ของผู้ป่วย
  const initializeFromUrl = async () => {
    setLoading(true);
    try {
      // 1. ดึงข้อมูลผู้ป่วย
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number, id_card, phone, hospital_id, hospitals(name)')
        .eq('id', urlPatientId)
        .maybeSingle();
      
      if (pErr || !prof) throw new Error('ไม่พบข้อมูลผู้ป่วย');

      const patientData: Patient = {
        ...prof,
        hospital_name: (prof as any).hospitals?.name || 'ไม่ระบุ'
      };
      setLockedPatient(patientData);
      setFormData(prev => ({ ...prev, patient_id: patientData.id }));

      // 2. หาเครือข่ายโรงพยาบาลของผู้ป่วย (แม่ข่าย + ลูกข่าย)
      const { data: hosp } = await supabase
        .from('hospitals')
        .select('id, type, parent_id')
        .eq('id', patientData.hospital_id)
        .maybeSingle();

      let targetHospitalIds: string[] = [patientData.hospital_id!];
      if (hosp) {
        if (hosp.type === 'main') {
          const { data: subs } = await supabase.from('hospitals').select('id').eq('parent_id', hosp.id);
          if (subs) targetHospitalIds = [...targetHospitalIds, ...subs.map((s: any) => s.id)];
        } else if (hosp.type === 'sub' && hosp.parent_id) {
          targetHospitalIds.push(hosp.parent_id);
        }
      }

      // 3. ดึงรายชื่อแพทย์/เจ้าหน้าที่ ในเครือข่าย รพ. ของผู้ป่วยเท่านั้น
      const { data: coachesData } = await supabase
        .from('doctors')
        .select(`user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey(hospital_id)`)
        .in('users.hospital_id', targetHospitalIds)
        .eq('is_active', true);

      const validCoaches: Coach[] = (coachesData || []).map((c: any) => ({
        user_id: c.user_id,
        full_name_th: c.full_name_th,
        specialization_th: c.specialization_th,
        is_active: c.is_active,
        users: { hospital_id: c.users?.hospital_id }
      }));
      setPatientNetworkCoaches(validCoaches);

      // 4. ถ้ามี coach_id ใน URL ให้ล็อกไว้
      if (urlCoachId) {
        const foundCoach = validCoaches.find(c => c.user_id === urlCoachId);
        if (foundCoach) {
          setLockedCoach(foundCoach);
          setFormData(prev => ({ ...prev, staff_id: foundCoach.user_id }));
        }
      }

    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // โหลดข้อมูลทั่วไป (กรณีเข้าหน้าปกติโดยไม่มี patient_id)
  const loadGeneralNetworkData = async () => {
    setLoading(true);
    try {
      const uHospital = await getUserHospitalInfo(user.id);
      const allHospitals = await (async () => {
        const { data } = await supabase.from('hospitals').select('id, type, parent_id');
        return data || [];
      })();

      let networkHospitals: any[] = [];
      if (uHospital) {
        const rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id;
        networkHospitals = allHospitals.filter(h => h.id === rootId || h.parent_id === rootId);
      } else {
        networkHospitals = allHospitals;
      }

      const networkIds = networkHospitals.map((h: any) => h.id);

      // โหลดผู้ป่วยในเครือข่าย
      const { data: pats } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number, id_card, hospital_id, hospitals(name)')
        .in('hospital_id', networkIds);
      
      setPatients((pats || []).map((p: any) => ({ ...p, hospital_name: p.hospitals?.name || 'ไม่ระบุ' })));

      // โหลดโค้ชในเครือข่าย
      const { data: coachesData } = await supabase
        .from('doctors')
        .select(`user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey(hospital_id)`)
        .in('users.hospital_id', networkIds)
        .eq('is_active', true);

      setPatientNetworkCoaches((coachesData || []).map((c: any) => ({
        user_id: c.user_id,
        full_name_th: c.full_name_th,
        specialization_th: c.specialization_th,
        is_active: c.is_active,
        users: { hospital_id: c.users?.hospital_id }
      })));

    } catch (err) {
      console.error('❌ Network Data Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node)) setIsPatientDropdownOpen(false);
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node)) setIsStaffDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // =====================================================
  // ⚙️ HANDLERS & LOGIC
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const term = patientSearchTerm.toLowerCase();
    return patients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
      p.hospital_number.toLowerCase().includes(term) ||
      (p.id_card && p.id_card.includes(term))
    ).slice(0, 50);
  }, [patients, patientSearchTerm]);

  const filteredStaff = useMemo(() => {
    if (!staffSearchTerm.trim()) return patientNetworkCoaches.slice(0, 50);
    const term = staffSearchTerm.toLowerCase();
    return patientNetworkCoaches.filter(c =>
      c.full_name_th.toLowerCase().includes(term) ||
      (c.specialization_th && c.specialization_th.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [patientNetworkCoaches, staffSearchTerm]);

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};
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
    setLoading(true);
    try {
      const dateTimeStr = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const result = await createAppointment({
        patient_id: formData.patient_id, staff_id: formData.staff_id,
        appointment_type: formData.appointment_type, appointment_datetime: dateTimeStr,
        duration_minutes: parseInt(formData.duration_minutes.toString()),
        location: formData.location, notes: formData.notes || undefined,
        created_by: user?.id, status: 'scheduled'
      });
      if (result.success) {
        router.push(backUrl); // ✅ กลับไปหน้าที่ถูกต้อง
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) { setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'); }
    finally { setLoading(false); }
  };

  // ✅ ปลดล็อกผู้ป่วย (แสดงช่องค้นหา)
  const unlockPatient = () => {
    setLockedPatient(null);
    setFormData(prev => ({ ...prev, patient_id: '' }));
    setPatientSearchTerm('');
  };

  // ✅ ปลดล็อกผู้ดูแล (แสดง Dropdown)
  const unlockCoach = () => {
    setLockedCoach(null);
    setFormData(prev => ({ ...prev, staff_id: '' }));
    setStaffSearchTerm('');
    setIsStaffDropdownOpen(true);
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
        <p className="text-gray-600">กำลังกลับไปยังหน้าก่อนหน้านี้...</p>
      </div>
    </div>
  );

  if (!user && !loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ✅ ปุ่มกลับใช้ backUrl */}
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

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* SECTION 1: ผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
          </h2>
          
          {/* ✅ กรณีล็อกผู้ป่วยจาก URL */}
          {lockedPatient ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ป่วยที่เลือกจากระบบ
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">HN: {lockedPatient.hospital_number}</span>
                      {lockedPatient.id_card && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <IdCard className="w-3 h-3 text-gray-400" /> บัตร: {lockedPatient.id_card}
                        </span>
                      )}
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <Hospital className="w-3 h-3 text-gray-400" /> รพ.: {lockedPatient.hospital_name}
                      </span>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={unlockPatient} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3" /> เปลี่ยนผู้ป่วย
                </button>
              </div>
            </div>
          ) : (
            /* กรณีค้นหาผู้ป่วยเอง */
            <div ref={patientDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" placeholder="พิมพ์ชื่อ, HN หรือ เลขบัตรประชาชน เพื่อค้นหา..."
                  value={patientSearchTerm}
                  onChange={(e) => { setPatientSearchTerm(e.target.value); setIsPatientDropdownOpen(true); }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isPatientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div key={p.id} onClick={() => {
                        setFormData(prev => ({ ...prev, patient_id: p.id }));
                        setPatientSearchTerm(`${p.first_name} ${p.last_name} (${p.hospital_number})`);
                        setIsPatientDropdownOpen(false);
                        setLockedPatient(p); // ล็อกทันทีที่เลือก
                      }} className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-gray-800 text-base">{p.first_name} {p.last_name}</span>
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">HN: {p.hospital_number}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                            <IdCard className="w-3 h-3 text-gray-400" /> บัตร: {p.id_card || '-'}
                          </span>
                          <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                            <Hospital className="w-3 h-3 text-gray-400" /> รพ.: {p.hospital_name || 'ไม่ระบุ'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>}
                </div>
              )}
              {validationErrors.patient_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>}
            </div>
          )}
        </div>

        {/* SECTION 2: แพทย์/เจ้าหน้าที่ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
          </h2>
          
          {/* ✅ กรณีล็อกผู้ดูแลจาก URL */}
          {lockedCoach ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Stethoscope className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ดูแลที่เลือกจากระบบ
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        ความเชี่ยวชาญ: {lockedCoach.specialization_th || 'ไม่ระบุ'}
                      </span>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={unlockCoach} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-1">
                  <RefreshCcw className="w-3 h-3" /> เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : (
            /* กรณีเลือกผู้ดูแลเอง (Dropdown จะแสดงเฉพาะโค้ชในเครือข่าย รพ. ของผู้ป่วย) */
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" placeholder="พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => { setStaffSearchTerm(e.target.value); setIsStaffDropdownOpen(true); }}
                  onFocus={() => setIsStaffDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((c) => (
                      <div key={c.user_id} onClick={() => {
                        setFormData(prev => ({ ...prev, staff_id: c.user_id }));
                        setStaffSearchTerm(`${c.full_name_th} ${c.specialization_th ? `(${c.specialization_th})` : ''}`);
                        setIsStaffDropdownOpen(false);
                        setLockedCoach(c); // ล็อกทันทีที่เลือก
                      }} className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex justify-between">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                        </div>
                      </div>
                    ))
                  ) : <div className="p-4 text-center text-gray-500">ไม่พบเจ้าหน้าที่ในเครือข่ายโรงพยาบาลนี้</div>}
                </div>
              )}
              {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Hospital className="w-3 h-3" /> แสดงเฉพาะบุคลากรในเครือข่ายโรงพยาบาลของผู้ป่วย
              </p>
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

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          {/* ✅ ปุ่มยกเลิกใช้ backUrl */}
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