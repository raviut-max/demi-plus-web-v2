// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: รองรับ Auto-select จาก URL, ปุ่มเปลี่ยนผู้ดูแลแบบกรองตามเครือข่าย รพ. ผู้ป่วย, และการกลับหน้าที่ถูกต้อง
'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
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
  id: string; user_id: string; full_name_th: string; specialization_th?: string; is_active: boolean;
  users?: { hospital_id?: string; hospitals?: { id?: string; name?: string } };
}
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  hospital_id?: string;
  hospitals?: { name: string } | null;
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ 1. อ่านพารามิเตอร์จาก URL
  const fromParam = searchParams.get('from');
  const urlPatientId = searchParams.get('patient_id');
  const urlCoachId = searchParams.get('coach_id');

  // ✅ กำหนด URL กลับให้ถูกต้องตามที่มา
  const backUrl = fromParam === 'care-pathway-dashboard' 
    ? '/admin/care-pathway-dashboard' 
    : '/admin/appointments/view';

  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Search States (สำหรับกรณีไม่ได้ส่ง ID มาใน URL)
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  // ✅ States สำหรับ Auto-select และ "เปลี่ยนผู้ดูแล"
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [showCoachDropdown, setShowCoachDropdown] = useState(false);
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(event.target as Node)) setIsPatientDropdownOpen(false);
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node)) setIsStaffDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadUserHospital = async (userId: string) => {
    try { setUserHospital(await getUserHospitalInfo(userId)); } catch (e) { console.error(e); }
  };

  // =====================================================
  // ✅ 2. Auto-Select Logic: ดึงข้อมูลผู้ป่วยและโค้ชจาก URL
  // =====================================================
  useEffect(() => {
    const autoSelectData = async () => {
      if (urlPatientId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, hospital_number, hospital_id, hospitals(name)')
          .eq('id', urlPatientId)
          .maybeSingle();
        if (p) {
          setLockedPatient(p as Patient);
          setFormData(prev => ({ ...prev, patient_id: p.id }));
        }
      }

      if (urlCoachId) {
        const { data: c } = await supabase
          .from('doctors')
          .select('id, user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey(hospital_id, hospitals(id, name))')
          .eq('user_id', urlCoachId)
          .maybeSingle();
        if (c) {
          setLockedCoach(c as Coach);
          setFormData(prev => ({ ...prev, staff_id: c.user_id }));
        }
      }
    };
    autoSelectData();
  }, [urlPatientId, urlCoachId]);

  // =====================================================
  // ✅ 3. Logic: โหลดรายชื่อโค้ชตามเครือข่าย รพ. ของผู้ป่วย
  // =====================================================
  const handleOpenCoachDropdown = async () => {
    setShowCoachDropdown(true);
    if (lockedPatient?.hospital_id && availableCoaches.length === 0) {
      // หาเครือข่ายโรงพยาบาล (แม่ข่าย + ลูกข่าย) ของผู้ป่วย
      const { data: hosp } = await supabase
        .from('hospitals')
        .select('id, type, parent_id')
        .eq('id', lockedPatient.hospital_id)
        .maybeSingle();

      let targetHospIds = [lockedPatient.hospital_id];
      if (hosp) {
        if (hosp.type === 'sub' && hosp.parent_id) {
          targetHospIds.push(hosp.parent_id); // รวมแม่ข่าย
        } else if (hosp.type === 'main') {
          const { data: subs } = await supabase.from('hospitals').select('id').eq('parent_id', hosp.id);
          if (subs) targetHospIds = [...targetHospIds, ...subs.map((s: any) => s.id)]; // รวมลูกข่าย
        }
      }

      // ดึงโค้ชที่อยู่ในเครือข่ายนี้
      const { data: coachesData } = await supabase
        .from('doctors')
        .select('id, user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey(hospital_id, hospitals(id, name))')
        .in('users.hospital_id', targetHospIds)
        .eq('is_active', true);
      
      setAvailableCoaches(coachesData || []);
    }
  };

  const handleSelectCoach = (coach: Coach) => {
    setLockedCoach(coach);
    setFormData(prev => ({ ...prev, staff_id: coach.user_id }));
    setShowCoachDropdown(false);
  };

  // =====================================================
  // ⚙️ HANDLERS & LOGIC (สำหรับกรณีค้นหาเอง)
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const loadNetworkData = async () => {
    setLoading(true);
    try {
      const uHospital = await getUserHospitalInfo(user.id);
      const allHospitals = await (async () => {
        const { data } = await supabase.from('hospitals').select('id, type, parent_id, name, code');
        return data || [];
      })();
      
      let networkHospitals: any[] = [];
      if (uHospital) {
        const rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id;
        networkHospitals = allHospitals.filter((h: any) => h.id === rootId || h.parent_id === rootId);
      } else {
        networkHospitals = allHospitals;
      }
      
      const networkIds = networkHospitals.map((h: any) => h.id);
      
      const { data: p } = await supabase.from('profiles').select('id, first_name, last_name, hospital_number, hospital_id, hospitals(name)').in('hospital_id', networkIds);
      setPatients(p || []);

      const { data: c } = await supabase.from('doctors').select('id, user_id, full_name_th, specialization_th, is_active, users!doctors_user_id_fkey(hospital_id, hospitals(id, name))').in('users.hospital_id', networkIds).eq('is_active', true);
      setCoaches(c || []);
    } catch (err) {
      console.error('❌ Network Data Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const term = patientSearchTerm.toLowerCase();
    return patients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
      p.hospital_number.toLowerCase().includes(term)
    ).slice(0, 50);
  }, [patients, patientSearchTerm]);

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

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ✅ ปุ่มกลับใช้ backUrl ที่คำนวณไว้ */}
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
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* SECTION 1: ผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
          </h2>
          
          {/* ✅ แสดงการ์ดผู้ป่วยแบบล็อก ถ้ามี URL ส่งมา */}
          {lockedPatient ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> ผู้ป่วยที่ต้องการนัดหมาย (เลือกอัตโนมัติ)
                  </p>
                  <p className="text-lg font-bold text-gray-800">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">HN: {lockedPatient.hospital_number}</span>
                    {lockedPatient.hospitals && (
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                        <Hospital className="w-3 h-3 text-gray-400" /> รพ.: {lockedPatient.hospitals.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* กรณีไม่มี URL: ให้ค้นหาเอง */
            <div ref={patientDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" placeholder="พิมพ์ชื่อ หรือ HN เพื่อค้นหา..."
                  value={patientSearchTerm}
                  onChange={(e) => {
                    setPatientSearchTerm(e.target.value); 
                    setIsPatientDropdownOpen(true);
                    if (!urlPatientId) loadNetworkData(); // โหลดข้อมูลเมื่อเริ่มพิมพ์
                  }}
                  onFocus={() => { setIsPatientDropdownOpen(true); if (!urlPatientId) loadNetworkData(); }}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isPatientDropdownOpen && patients.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredPatients.map((p) => (
                    <div key={p.id} onClick={() => {
                      setFormData(prev => ({ ...prev, patient_id: p.id }));
                      setPatientSearchTerm(`${p.first_name} ${p.last_name} (${p.hospital_number})`);
                      setIsPatientDropdownOpen(false);
                    }} className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <div className="font-bold text-gray-800">{p.first_name} {p.last_name}</div>
                      <div className="text-xs text-gray-500">HN: {p.hospital_number} | {p.hospitals?.name}</div>
                    </div>
                  ))}
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

          {/* ✅ แสดงการ์ดโค้ชแบบล็อก + ปุ่มเปลี่ยน */}
          {lockedCoach && !showCoachDropdown ? (
            <div className="border-2 border-purple-300 bg-purple-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                    <Stethoscope className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ดูแลที่เลือก (เลือกอัตโนมัติ)
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200">{lockedCoach.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                      <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200">
                        <Hospital className="w-3 h-3 text-gray-400" /> {lockedCoach.users?.hospitals?.name || 'ไม่ระบุรพ.'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* ✅ ปุ่มเปลี่ยนผู้ดูแล */}
                <button
                  type="button"
                  onClick={handleOpenCoachDropdown}
                  className="px-3 py-1.5 text-xs border border-purple-300 bg-white text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-1"
                >
                  <RefreshCcw className="w-3 h-3" /> เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : showCoachDropdown ? (
            /* ✅ Dropdown แสดงรายชื่อโค้ชในเครือข่าย รพ. ผู้ป่วย */
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm text-gray-600">เลือกผู้ดูแลจากเครือข่ายโรงพยาบาลของผู้ป่วย:</p>
                <button type="button" onClick={() => { setShowCoachDropdown(false); setFormData(prev => ({...prev, staff_id: ''})); }} className="text-xs text-red-600 hover:underline">ยกเลิก</button>
              </div>
              <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto bg-white">
                {availableCoaches.length > 0 ? (
                  availableCoaches.map((c) => (
                    <div key={c.user_id} onClick={() => handleSelectCoach(c)} className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <div className="font-medium text-gray-800">{c.full_name_th}</div>
                      <div className="text-xs text-gray-500">{c.specialization_th || 'ไม่ระบุ'} | {c.users?.hospitals?.name}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> กำลังโหลดรายชื่อ...
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* กรณีไม่มี URL: ให้ค้นหาเอง */
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" placeholder="พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => {
                    setStaffSearchTerm(e.target.value); 
                    setIsStaffDropdownOpen(true);
                    loadNetworkData();
                  }}
                  onFocus={() => { setIsStaffDropdownOpen(true); loadNetworkData(); }}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {isStaffDropdownOpen && coaches.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {coaches.filter(c => c.full_name_th.toLowerCase().includes(staffSearchTerm.toLowerCase())).map((c) => (
                    <div key={c.user_id} onClick={() => {
                      setFormData(prev => ({ ...prev, staff_id: c.user_id }));
                      setStaffSearchTerm(c.full_name_th);
                      setIsStaffDropdownOpen(false);
                    }} className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <div className="font-medium text-gray-800">{c.full_name_th}</div>
                      <div className="text-xs text-gray-500">{c.specialization_th || 'ไม่ระบุ'} | {c.users?.hospitals?.name}</div>
                    </div>
                  ))}
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

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          {/* ✅ ปุ่มยกเลิกก็ใช้ backUrl เช่นกัน */}
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