// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 9 มิถุนายน 2569
// ✅ การแก้ไข:
//    1. ✅ เปลี่ยน Dropdown ผู้ป่วย → Searchable Input (พิมพ์ค้นหาได้)
//    2. ✅ Dropdown แพทย์/เจ้าหน้าที่ ใช้ Network-based (แม่ข่าย+ลูกข่าย)
//    3. ✅ คงโครงสร้างเดิมทั้งหมดไว้ (Validation, Error Handling, UI Sections)
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  getPatientsByHospitalNetwork
} from '@/lib/supabase/queries';
import {
  CalendarPlus,
  AlertCircle,
  Loader2,
  ArrowLeft,
  User,
  Stethoscope,
  LogOut,
  CheckCircle,
  XCircle,
  Search,
  Users,
  Clock,
  MapPin,
  FileText
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Coach {
  id: string;
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  is_active: boolean;
  is_verified: boolean;
  users?: {
    hospital_id?: string;
    role?: string;
    admin_type?: string | null;
    is_active?: boolean;
    hospitals?: {
      id?: string;
      name?: string;
      code?: string;
      type?: 'main' | 'sub';
      parent_id?: string | null;
    };
  };
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  phone?: string;
  hospital_id?: string;
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auth & User State
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);

  // Data State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  // UI State
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Patient Search State
  const [patientSearchTerm, setSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [selectedPatientDisplay, setSelectedPatientDisplay] = useState('');

  // Form State
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
  // 📥 AUTH & DATA LOADING
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    // ✅ อนุญาตเฉพาะ admin, doctor, helper, osm
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    console.log('👤 [NewAppointment] User:', userData);
    setUser(userData);

    loadUserHospital(userData.id);
    loadNetworkData(userData.id);
  }, [router]);

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้ (สำหรับ Header)
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error(' [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดข้อมูลเครือข่ายโรงพยาบาล + โค้ช + ผู้ป่วย (Network-based)
  const loadNetworkData = async (userId: string) => {
    try {
      setLoading(true);

      // 1. หา Root ของเครือข่าย
      const uHospital = await getUserHospitalInfo(userId);
      const allHospitals = await getHospitalsWithHierarchy();

      let networkHospitals: Hospital[] = [];

      if (uHospital) {
        let rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id;

        if (rootId) {
          networkHospitals = allHospitals.filter(h =>
            h.id === rootId || h.parent_id === rootId
          );
          console.log('🏥 [loadNetworkData] Network Hospitals:', networkHospitals.length);
        } else {
          networkHospitals = [uHospital as Hospital];
        }
      } else {
        networkHospitals = allHospitals;
      }

      setHospitals(networkHospitals);

      // 2. โหลดโค้ชในเครือข่าย
      const networkHospitalIds = networkHospitals.map(h => h.id);
      await loadCoaches(networkHospitalIds);

      // 3. โหลดผู้ป่วยในเครือข่าย
      await loadPatients(networkHospitalIds);

    } catch (error) {
      console.error('❌ [loadNetworkData] Error:', error);
      setError('⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูลเครือข่าย');
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดโค้ช
  const loadCoaches = async (hospitalIds: string[]) => {
    try {
      console.log('👨‍⚕️ [loadCoaches] Loading coaches for hospitals:', hospitalIds);
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
      console.log('👨⚕️ [loadCoaches] Loaded:', allCoaches.length, 'coaches');
    } catch (error) {
      console.error('❌ [loadCoaches] Error:', error);
      setError('⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูลโค้ช');
    }
  };

  // ✅ โหลดผู้ป่วย
  const loadPatients = async (hospitalIds: string[]) => {
    try {
      console.log('🧑‍🤝‍🧑 [loadPatients] Loading patients for hospitals:', hospitalIds);
      const allPatients = await getPatientsByHospitalNetwork(hospitalIds);
      setPatients(allPatients);
      console.log('‍🤝‍ [loadPatients] Loaded:', allPatients.length, 'patients');
    } catch (error) {
      console.error('❌ [loadPatients] Error:', error);
      setError('⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย');
    }
  };

  // =====================================================
  // ️ HANDLERS
  // =====================================================

  // ✅ คลิกนอก Dropdown เพื่อปิด
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPatientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // ✅ ล้าง validation error เมื่อผู้ใช้แก้ไข
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // ✅ เลือกผู้ป่วยจาก Dropdown
  const handlePatientSelect = (patient: Patient) => {
    setFormData(prev => ({ ...prev, patient_id: patient.id }));
    setSelectedPatientDisplay(`${patient.first_name} ${patient.last_name} (${patient.hospital_number})`);
    setSearchTerm(`${patient.first_name} ${patient.last_name} (${patient.hospital_number})`);
    setIsPatientDropdownOpen(false);

    if (validationErrors.patient_id) {
      setValidationErrors(prev => ({ ...prev, patient_id: '' }));
    }
  };

  // ✅ กรองผู้ป่วยตามคำค้นหา
  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const lowerTerm = patientSearchTerm.toLowerCase();
    return patients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(lowerTerm) ||
      p.hospital_number.toLowerCase().includes(lowerTerm) ||
      (p.phone && p.phone.includes(patientSearchTerm))
    ).slice(0, 50);
  }, [patients, patientSearchTerm]);

  // ✅ จัดกลุ่มโรงพยาบาล (แม่ข่าย → ลูกข่าย)
  const getGroupedHospitals = () => {
    const mainHospitals = hospitals.filter((h) => h.type === 'main');
    const subHospitals = hospitals.filter((h) => h.type === 'sub');
    const hospitalGroups = new Map<string, Hospital[]>();

    subHospitals.forEach((sub) => {
      if (sub.parent_id) {
        if (!hospitalGroups.has(sub.parent_id)) {
          hospitalGroups.set(sub.parent_id, []);
        }
        hospitalGroups.get(sub.parent_id)!.push(sub);
      }
    });

    return { mainHospitals, hospitalGroups };
  };

  // =====================================================
  // ✅ VALIDATION
  // =====================================================
  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!formData.patient_id) {
      errors.patient_id = 'กรุณาเลือกผู้ป่วย';
    }

    if (!formData.staff_id) {
      errors.staff_id = 'กรุณาเลือกแพทย์/เจ้าหน้าที่';
    }

    if (!formData.appointment_date) {
      errors.appointment_date = 'กรุณาเลือกวันที่นัดหมาย';
    }

    if (!formData.appointment_time) {
      errors.appointment_time = 'กรุณาเลือกเวลานัดหมาย';
    }

    // ตรวจสอบว่าเวลาที่เลือกไม่อยู่ในอดีต
    if (formData.appointment_date && formData.appointment_time) {
      const selectedDateTime = new Date(`${formData.appointment_date}T${formData.appointment_time}`);
      const now = new Date();
      if (selectedDateTime <= now) {
        errors.appointment_time = 'กรุณาเลือกเวลาในอนาคต';
      }
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      setError(`❌ ${firstError}`);
      return false;
    }

    return true;
  };

  // =====================================================
  // 📤 SUBMIT
  // =====================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    console.log('📝 [handleSubmit] Form submitted');
    console.log('📋 [handleSubmit] Form data:', formData);

    if (!validateForm()) {
      return;
    }

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
        status: 'scheduled'
      });

      setLoading(false);

      if (result.success) {
        console.log('✅ [handleSubmit] Appointment created successfully');
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/appointments');
        }, 2000);
      } else {
        console.error('❌ [handleSubmit] Creation failed:', result.error);

        // ✅ แปลงข้อผิดพลาดเป็นภาษาไทย
        let thaiError = 'เกิดข้อผิดพลาดในการสร้างนัดหมาย';

        if (result.error?.includes('23505') || result.error?.includes('duplicate key')) {
          thaiError = '❌ นัดหมายนี้ซ้ำกับที่มีอยู่ในระบบ กรุณาตรวจสอบ';
        } else if (result.error?.includes('23503')) {
          thaiError = '❌ ข้อมูลที่อ้างอิงไม่มีในระบบ กรุณาตรวจสอบ';
        } else if (result.error?.includes('22007')) {
          thaiError = '❌ รูปแบบวันที่/เวลาไม่ถูกต้อง';
        } else if (result.error?.includes('22001')) {
          thaiError = '❌ ข้อมูลยาวเกินไป';
        }

        setError(thaiError);
      }
    } catch (err: any) {
      console.error('❌ [handleSubmit] Creation error:', err);

      let thaiError = 'เกิดข้อผิดพลาดในการสร้างนัดหมาย';

      if (err.message?.includes('23505') || err.message?.includes('duplicate key')) {
        thaiError = '❌ นัดหมายนี้ซ้ำกับที่มีอยู่ในระบบ';
      } else if (err.message?.includes('23503')) {
        thaiError = '❌ ข้อมูลที่อ้างอิงไม่มีในระบบ';
      } else if (err.message?.includes('22007')) {
        thaiError = '❌ รูปแบบวันที่/เวลาไม่ถูกต้อง';
      } else if (err.message?.includes('22001')) {
        thaiError = '❌ ข้อมูลยาวเกินไป';
      }

      setError(thaiError);
      setLoading(false);
    }
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================

  // ✅ Success Screen
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
          <p className="text-gray-600">กำลังกลับไปยังหน้ารายการนัดหมาย...</p>
          <p className="text-sm text-gray-500 mt-2">กรุณารอสักครู่</p>
        </div>
      </div>
    );
  }

  // ✅ Loading Screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="min-h-screen bg-gray-50 pb-12">

      {/* ===================================================== */}
      {/*  HEADER                                               */}
      {/* ===================================================== */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg">
                  <CalendarPlus className="w-6 h-6" />
                </span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>

            {/* ✅ User Info Card */}
            {userHospital && (
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2 justify-end">
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                        user?.role === 'doctor' ? '👨‍️ แพทย์' :
                          user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                </div>

                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex items-center gap-1 mb-1 justify-end">
                    <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {userHospital.type === 'main' ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold"> ลูกข่าย</span>
                    )}
                    {userHospital.type === 'sub' && userHospital.parent_hospital && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => { logout(); router.push('/admin/login'); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/*  INFO BANNER                                          */}
      {/* ===================================================== */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">📋 ข้อมูลการสร้างนัดหมาย</p>
            <ul className="space-y-1">
              <li>• ผู้จัดทำสังกัด: <strong>{userHospital?.name || 'ไม่ได้กำหนด'}</strong></li>
              <li>• ผู้ป่วยที่เลือกได้: {patients.length} คน (ในเครือข่ายของคุณ)</li>
              <li>• แพทย์/เจ้าหน้าที่ที่เลือกได้: {coaches.length} คน (ในเครือข่ายของคุณ)</li>
              <li>• โรงพยาบาลในเครือข่าย: {hospitals.length} แห่ง</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* 📝 FORM                                                 */}
      {/* ===================================================== */}
      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">

        {/* ✅ Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-600 hover:text-red-800"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ----------------------------------------------------- */}
        {/* SECTION 1: เลือกผู้ป่วย (Searchable)                   */}
        {/* ----------------------------------------------------- */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
          </h2>

          <div ref={dropdownRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="พิมพ์ชื่อ หรือ HN เพื่อค้นหาผู้ป่วย..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsPatientDropdownOpen(true);
                  // ล้าง selection เมื่อพิมพ์ใหม่
                  if (formData.patient_id) {
                    setFormData(prev => ({ ...prev, patient_id: '' }));
                    setSelectedPatientDisplay('');
                  }
                  if (validationErrors.patient_id) {
                    setValidationErrors(prev => ({ ...prev, patient_id: '' }));
                  }
                }}
                onFocus={() => setIsPatientDropdownOpen(true)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${validationErrors.patient_id ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
              />
            </div>

            {/* ✅ Dropdown List */}
            {isPatientDropdownOpen && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handlePatientSelect(p)}
                      className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 transition-colors flex justify-between items-center group ${formData.patient_id === p.id ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                    >
                      <div>
                        <span className="font-medium text-gray-800 group-hover:text-blue-700">
                          {p.first_name} {p.last_name}
                        </span>
                        {p.phone && (
                          <span className="text-xs text-gray-500 ml-2"> {p.phone}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        HN: {p.hospital_number}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-4 text-gray-500 text-sm text-center">
                    ไม่พบข้อมูลที่ตรงกับการค้นหา
                  </div>
                )}
              </div>
            )}

            {validationErrors.patient_id && (
              <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>
            )}
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> แสดงผู้ป่วยจากโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง ({patients.length} คน)
            </p>
          </div>
        </div>

        {/* ----------------------------------------------------- */}
        {/* SECTION 2: เลือกแพทย์/เจ้าหน้าที่ (Network-based)       */}
        {/* ----------------------------------------------------- */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
          </h2>

          <select
            name="staff_id"
            value={formData.staff_id}
            onChange={handleChange}
            required
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white appearance-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '1.25em 1.25em',
              paddingRight: '2.5rem'
            }}
          >
            <option value="">-- เลือกแพทย์/เจ้าหน้าที่ --</option>
            {coaches.map((coach) => {
              const hospName = coach.users?.hospitals?.name || 'ไม่ระบุรพ.';
              const spec = coach.specialization_th || '';
              return (
                <option key={coach.user_id} value={coach.user_id}>
                  {coach.full_name_th} {spec ? `(${spec})` : ''} - {hospName}
                </option>
              );
            })}
          </select>

          {validationErrors.staff_id && (
            <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>
          )}
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
            <Stethoscope className="w-3 h-3" /> แสดงโค้ชจากโรงพยาบาลแม่ข่ายและลูกข่ายที่เกี่ยวข้อง ({coaches.length} คน)
          </p>
        </div>

        {/* ----------------------------------------------------- */}
        {/* SECTION 3: รายละเอียดนัดหมาย                           */}
        {/* ----------------------------------------------------- */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">3</span>
            รายละเอียดนัดหมาย
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* ประเภทนัดหมาย */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ประเภทนัดหมาย <span className="text-red-500">*</span>
              </label>
              <select
                name="appointment_type"
                value={formData.appointment_type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                <option value="follow_up">ติดตามผล</option>
                <option value="consultation">ปรึกษาแพทย์</option>
                <option value="checkup">ตรวจสุขภาพ</option>
                <option value="lab">เจาะเลือด/แลป</option>
                <option value="procedure">หัตถการ</option>
              </select>
            </div>

            {/* สถานที่ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                <option value="clinic">คลินิก</option>
                <option value="ward">หอผู้ป่วย</option>
                <option value="online">ออนไลน์ (Telemed)</option>
                <option value="home_visit">เยี่ยมบ้าน</option>
                <option value="emergency">ห้องฉุกเฉิน</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* วันที่และเวลา */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่และเวลา <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  name="appointment_date"
                  value={formData.appointment_date}
                  onChange={handleChange}
                  min={new Date().toISOString().split('T')[0]}
                  className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none ${validationErrors.appointment_date ? 'border-red-500' : 'border-gray-300'}`}
                />
                <input
                  type="time"
                  name="appointment_time"
                  value={formData.appointment_time}
                  onChange={handleChange}
                  className={`w-32 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none ${validationErrors.appointment_time ? 'border-red-500' : 'border-gray-300'}`}
                />
              </div>
              {(validationErrors.appointment_date || validationErrors.appointment_time) && (
                <p className="text-xs text-red-600 mt-1">
                  💡 {validationErrors.appointment_date || validationErrors.appointment_time}
                </p>
              )}
            </div>

            {/* ระยะเวลา */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)
              </label>
              <select
                name="duration_minutes"
                value={formData.duration_minutes}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">1 ชั่วโมง</option>
                <option value="90">1 ชั่วโมง 30 นาที</option>
                <option value="120">2 ชั่วโมง</option>
              </select>
            </div>
          </div>

          {/* หมายเหตุ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            />
          </div>
        </div>

        {/* ----------------------------------------------------- */}
        {/* SUBMIT BUTTONS                                         */}
        {/* ----------------------------------------------------- */}
        <div className="flex gap-4 pt-4 pb-8">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                ยืนยันการสร้างนัดหมาย
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all"
          >
            ยกเลิก
          </button>
        </div>

      </form>
    </div>
  );
}