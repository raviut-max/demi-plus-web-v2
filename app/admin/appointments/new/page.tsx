// app/admin/appointments/new/page.tsx
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
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}

interface UserHospital {
  id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}

interface Coach {
  id: string; user_id: string; full_name_th: string; specialization_th?: string; is_active: boolean;
  users?: { hospital_id?: string; role?: string; hospitals?: { id?: string; name?: string; code?: string; type?: 'main' | 'sub'; } };
}

interface Patient {
  id: string; 
  first_name: string; 
  last_name: string; 
  hospital_number: string;
  id_card?: string; 
  phone?: string; 
  hospital_id?: string;
  hospital_name?: string; // เพิ่มชื่อกันไว้เลยเพื่อความสะดวก
  hospital_code?: string;
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

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

  // Search States
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

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
    loadNetworkData(userData.id);
  }, [router]);

  // Handle Click Outside
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

  const loadNetworkData = async (userId: string) => {
    try {
      setLoading(true);
      const uHospital = await getUserHospitalInfo(userId);
      const allHospitals = await getHospitalsWithHierarchy();
      let networkHospitals: Hospital[] = [];
      let rootId: string | null = null;

      if (uHospital) {
        rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id;
        if (rootId) networkHospitals = allHospitals.filter(h => h.id === rootId || h.parent_id === rootId);
        else networkHospitals = [uHospital as Hospital];
      } else { networkHospitals = allHospitals; }

      setHospitals(networkHospitals);
      const networkIds = networkHospitals.map(h => h.id);
      
      // โหลดข้อมูลแบบ Parallel เพื่อความเร็ว
      await Promise.all([
        loadCoaches(networkIds),
        loadPatients(networkIds)
      ]);
    } catch (err) { 
      console.error('❌ Network Data Error:', err); 
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลเครือข่าย'); 
    } finally { 
      setLoading(false); 
    }
  };

  const loadCoaches = async (ids: string[]) => {
    try { setCoaches(await getCoachesWithHospitals(ids)); } catch (e) { console.error(e); }
  };

  const loadPatients = async (ids: string[]) => {
    try {
      if (typeof getPatientsByHospitalNetwork !== 'function') { 
        console.warn('Function getPatientsByHospitalNetwork not found'); 
        return; 
      }
      const data = await getPatientsByHospitalNetwork(ids);
      setPatients(data);
    } catch (e) { 
      console.error('❌ Load Patients Error:', e); 
    }
  };

  // =====================================================
  // ️ HANDLERS & LOGIC
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  // Filter Patients Logic (ค้นหาจาก ชื่อ, HN, เลขบัตร)
  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const term = patientSearchTerm.toLowerCase();
    return patients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
      p.hospital_number.toLowerCase().includes(term) ||
      (p.id_card && p.id_card.includes(term))
    ).slice(0, 50);
  }, [patients, patientSearchTerm]);

  // Filter Staff Logic
  const filteredStaff = useMemo(() => {
    if (!staffSearchTerm.trim()) return coaches.slice(0, 50);
    const term = staffSearchTerm.toLowerCase();
    return coaches.filter(c =>
      c.full_name_th.toLowerCase().includes(term) ||
      (c.specialization_th && c.specialization_th.toLowerCase().includes(term))
    ).slice(0, 50);
  }, [coaches, staffSearchTerm]);

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
      if (result.success) { setSuccess(true); setTimeout(() => router.push('/admin/appointments'), 2000); }
      else { setError(result.error || 'เกิดข้อผิดพลาด'); }
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
        <p className="text-gray-600">กำลังกลับไปยังหน้ารายการ...</p>
      </div>
    </div>
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
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

      {/* Info Banner */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">📋 ข้อมูลเครือข่าย</p>
          <ul className="list-disc list-inside space-y-1">
            <li>ผู้ป่วยที่แสดง: {patients.length} คน (จากเครือข่ายของคุณ)</li>
            <li>แพทย์/เจ้าหน้าที่ที่แสดง: {coaches.length} คน (จากเครือข่ายของคุณ)</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* SECTION 1: เลือกผู้ป่วย (Searchable + Detailed Info) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
          </h2>
          <div ref={patientDropdownRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" 
                placeholder="พิมพ์ชื่อ, HN หรือ เลขบัตรประชาชน เพื่อค้นหา..."
                value={patientSearchTerm}
                onChange={(e) => {
                  setPatientSearchTerm(e.target.value); 
                  setIsPatientDropdownOpen(true);
                  if (formData.patient_id) { 
                    setFormData(p => ({...p, patient_id: ''})); 
                    setPatientSearchTerm(''); 
                  }
                }}
                onFocus={() => setIsPatientDropdownOpen(true)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'}`}
              />
            </div>
            
            {/* Dropdown List */}
            {isPatientDropdownOpen && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((p) => (
                    <div 
                      key={p.id} 
                      onClick={() => {
                        setFormData(prev => ({ ...prev, patient_id: p.id }));
                        setPatientSearchTerm(`${p.first_name} ${p.last_name} (${p.hospital_number})`);
                        setIsPatientDropdownOpen(false);
                      }} 
                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-gray-800 text-base">{p.first_name} {p.last_name}</span>
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">HN: {p.hospital_number}</span>
                        </div>
                      </div>
                      
                      {/* แสดงรายละเอียดเพิ่มเติม: เลขบัตร + โรงพยาบาล */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                          <IdCard className="w-3 h-3 text-gray-400" /> 
                          บัตร: {p.id_card || '-'}
                        </span>
                        <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                          <Hospital className="w-3 h-3 text-gray-400" /> 
                          รพ.: {p.hospital_name || 'ไม่ระบุ'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>
                )}
              </div>
            )}
            
            {validationErrors.patient_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>}
            <p className="text-xs text-gray-400 mt-2">* ค้นหาได้จาก: ชื่อ-สกุล, เลข HN, หรือเลขบัตรประชาชน</p>
          </div>
        </div>

        {/* SECTION 2: เลือกแพทย์/เจ้าหน้าที่ (Searchable) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
          </h2>
          <div ref={staffDropdownRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" 
                placeholder="พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหาโค้ช..."
                value={staffSearchTerm}
                onChange={(e) => {
                  setStaffSearchTerm(e.target.value); 
                  setIsStaffDropdownOpen(true);
                  if (formData.staff_id) { 
                    setFormData(p => ({...p, staff_id: ''})); 
                    setStaffSearchTerm(''); 
                  }
                }}
                onFocus={() => setIsStaffDropdownOpen(true)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`}
              />
            </div>
            {isStaffDropdownOpen && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((c) => (
                    <div 
                      key={c.user_id} 
                      onClick={() => {
                        setFormData(prev => ({ ...prev, staff_id: c.user_id }));
                        setStaffSearchTerm(`${c.full_name_th} ${c.specialization_th ? `(${c.specialization_th})` : ''}`);
                        setIsStaffDropdownOpen(false);
                      }} 
                      className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                    >
                      <div className="font-medium text-gray-800">{c.full_name_th}</div>
                      <div className="text-xs text-gray-500 mt-1 flex justify-between">
                        <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{c.users?.hospitals?.name || 'ไม่ระบุรพ.'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>
                )}
              </div>
            )}
            {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
          </div>
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

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          <button type="button" onClick={() => router.back()} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}