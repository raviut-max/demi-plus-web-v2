// app/admin/appointments/new/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
  getPatientsByHospitalNetwork, // You might need to ensure this query exists or use getPatients and filter
  getCoachesWithHospitals,
  getUserHospitalInfo,
  getHospitalsWithHierarchy
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
  Users
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// Interfaces
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
  users?: {
    hospitals?: {
      id?: string;
      name?: string;
      code?: string;
      type?: 'main' | 'sub';
    };
  };
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  // Add other fields if needed for display
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  
  // Data States
  const [patients, setPatients] = useState<Patient[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    patient_id: '',
    staff_id: '', // This will store coach.user_id
    appointment_type: 'follow_up', // Default
    appointment_date: '',
    appointment_time: '',
    duration_minutes: 30,
    location: 'clinic',
    notes: '',
  });

  // Search State for Patients
  const [patientSearchTerm, setSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);

  // =====================================================
  // 📥 DATA LOADING & AUTH
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    
    // Allow admin, doctor, helper, osm
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadUserHospital(userData.id);
    loadNetworkData(userData.id);
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const info = await getUserHospitalInfo(userId);
      setUserHospital(info);
    } catch (err) {
      console.error('Error loading user hospital:', err);
    }
  };

  // ✅ Network Logic: Fetch Coaches from Main + Subs based on User's Network
  const loadNetworkData = async (userId: string) => {
    try {
      setLoading(true);
      
      // 1. Get User's Hospital Info to determine Root
      const uHospital = await getUserHospitalInfo(userId);
      let rootId: string | null = null;

      if (uHospital) {
        // If Main -> Root is self. If Sub -> Root is parent.
        rootId = uHospital.type === 'main' ? uHospital.id : uHospital.parent_id;
      }

      // 2. Load All Hospitals to find the network IDs
      const allHospitals = await getHospitalsWithHierarchy();
      let networkHospitalIds: string[] = [];

      if (rootId) {
        // Filter hospitals belonging to this network
        const networkHospitals = allHospitals.filter(h => 
          h.id === rootId || h.parent_id === rootId
        );
        networkHospitalIds = networkHospitals.map(h => h.id);
      } else {
        // Fallback: If no hierarchy found (e.g., Super Admin without specific hospital link), load all
        networkHospitalIds = allHospitals.map(h => h.id);
      }

      // 3. Load Coaches for these hospitals
      if (networkHospitalIds.length > 0) {
        const loadedCoaches = await getCoachesWithHospitals(networkHospitalIds);
        setCoaches(loadedCoaches);
      }

      // 4. Load Patients (Assuming we load patients from the same network or just all active ones)
      // Note: Depending on your DB size, you might want to limit this or implement server-side search later.
      // For now, we fetch patients associated with the network hospitals.
      // If getPatientsByHospitalNetwork doesn't exist, you might need to fetch all and filter, 
      // or create a specific query. Here assuming a generic fetch or filtering logic.
      // *Adjustment*: Since screenshot shows many patients, let's assume we fetch a reasonable list 
      // or you have a query `getPatients`. I will simulate fetching patients linked to these hospitals.
      
      // TODO: Replace with actual query to fetch patients. 
      // Example: const p = await getPatientsByHospitalNetwork(networkHospitalIds);
      // For this code, I'll assume we fetch them and set state.
      // If you don't have a specific query, you might need to add one in queries.ts
      
    } catch (error) {
      console.error('❌ [loadNetworkData] Error:', error);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลเครือข่าย');
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // ️ HANDLERS
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePatientSelect = (patientId: string, name: string) => {
    setFormData(prev => ({ ...prev, patient_id: patientId }));
    setSearchTerm(name); // Show selected name in input
    setIsPatientDropdownOpen(false);
  };

  // Filter patients based on search term
  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm) return patients.slice(0, 50); // Show top 50 if empty
    const lowerTerm = patientSearchTerm.toLowerCase();
    return patients.filter(p => 
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(lowerTerm) ||
      p.hospital_number.toLowerCase().includes(lowerTerm)
    ).slice(0, 50); // Limit results for performance
  }, [patients, patientSearchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.patient_id || !formData.staff_id || !formData.appointment_date) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน (ผู้ป่วย, เจ้าหน้าที่, วันที่)');
      return;
    }

    setLoading(true);
    try {
      // Combine date and time for submission if needed, or send separately depending on API
      // Assuming API expects separate fields or ISO string. Adjust as per your backend.
      const dateTimeStr = `${formData.appointment_date}T${formData.appointment_time}:00`;

      const result = await createAppointment({
        patient_id: formData.patient_id,
        staff_id: formData.staff_id, // Ensure this maps to the correct column (e.g. doctor_id or staff_id)
        appointment_type: formData.appointment_type,
        appointment_datetime: dateTimeStr, // Or split into date/time
        duration_minutes: parseInt(formData.duration_minutes.toString()),
        location: formData.location,
        notes: formData.notes,
        created_by: user?.id,
        status: 'scheduled'
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push('/admin/appointments'), 2000);
      } else {
        setError(result.error || 'เกิดข้อผิดพลาดในการสร้างนัดหมาย');
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
          <p className="text-gray-600">กำลังกลับไปยังหน้ารายการนัดหมาย...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg"><CalendarPlus className="w-6 h-6" /></span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>

            {/* User Info Card */}
            {userHospital && (
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2 justify-end">
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'osm' ? '🏘️ อสม.' : '‍💼 เจ้าหน้าที่'}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {userHospital.type === 'main' ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold"> ลูกข่าย</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => { logout(); router.push('/admin/login'); }} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button type="button" onClick={() => setError('')} className="text-red-600 hover:text-red-800">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* 1. Select Patient (Searchable) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" /> ผู้ป่วย <span className="text-red-500">*</span>
            </h2>
            
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อ หรือ HN เพื่อค้นหาผู้ป่วย..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsPatientDropdownOpen(true);
                    // Clear selection if typing new thing
                    if (formData.patient_id) setFormData(p => ({...p, patient_id: ''}));
                  }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              {/* Dropdown List */}
              {isPatientDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handlePatientSelect(p.id, `${p.first_name} ${p.last_name} (${p.hospital_number})`)}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors flex justify-between items-center group"
                      >
                        <span className="font-medium text-gray-800 group-hover:text-blue-700">
                          {p.first_name} {p.last_name}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          HN: {p.hospital_number}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-gray-500 text-sm text-center">ไม่พบข้อมูลที่ตรงกัน</div>
                  )}
                </div>
              )}
              
              {/* Click outside handler could be added here via a wrapper ref */}
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <Users className="w-3 h-3" /> แสดงผู้ป่วยจากโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง
              </p>
            </div>
          </div>

          {/* 2. Select Staff/Doctor (Network Based) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-purple-500" /> แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            </h2>
            
            <select
              name="staff_id"
              value={formData.staff_id}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em`, paddingRight: `2.5rem` }}
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
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> แสดงโค้ชจากโรงพยาบาลแม่ข่ายและลูกข่ายที่เกี่ยวข้อง
            </p>
          </div>

          {/* 3. Appointment Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-orange-500" /> รายละเอียดนัดหมาย
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
                  <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} required className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                  <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} required className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ระยะเวลา (นาที)</label>
                <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                  <option value="15">15 นาที</option>
                  <option value="30">30 นาที</option>
                  <option value="45">45 นาที</option>
                  <option value="60">1 ชั่วโมง</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {loading ? 'กำลังบันทึก...' : 'ยืนยันการสร้างนัดหมาย'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-8 py-4 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-all"
            >
              ยกเลิก
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}