// app/admin/patients/page.tsx
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แสดงผู้ป่วยเฉพาะใน รพ.แม่ข่าย/ลูกข่ายที่ผู้ใช้เข้าถึงได้
//    2. ✅ กรองตัวเลือกโรงพยาบาลใน dropdown ตามสิทธิ์
//    3. ✅ ลบการค้นหาด้วยโค้ชออก
//    4. ✅ รวมช่องค้นหาทั้งหมดไว้ในบรรทัดเดียว
//    5. ✅ ปุ่มดูรายละเอียด (ตา) ไปที่ /admin/patients/[id] โดยตรง
//    6. ✅ เพิ่ม Badge แสดงประเภทโรงพยาบาลในตาราง
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getPatientList, getAccessibleHospitalIds, getUserHospitalInfo, isSuperAdmin, deletePatient, restorePatient, getDeletedPatients, getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { Search, Plus, Eye, Trash2, RotateCcw, Filter, UserPlus, LogOut, ArrowLeft, Hospital, Building2, UserCheck, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedPamLevel, setSelectedPamLevel] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadHospitals();
  }, [router]);

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      // ✅ โหลดผู้ป่วยหลังจากได้สิทธิ์แล้ว
      loadPatients(ids);
      if (showDeleted) loadDeletedPatients(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  // ✅ โหลดรายชื่อโรงพยาบาลแบบ Hierarchical (สำหรับ dropdown)
  const loadHospitals = async () => {
    try {
      const data = await getHospitalsWithHierarchy();
      setHospitals(data);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  // ✅ โหลดผู้ป่วย (กรองตามโรงพยาบาลที่เข้าถึงได้)
  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      let query = supabase
        .from('profiles')
        .select(`*, hospitals ( id, name, code, type )`)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // ✅ กรองตามโรงพยาบาลที่เข้าถึงได้
      if (hospitalIds && hospitalIds.length > 0) {
        query = query.in('hospital_id', hospitalIds);
      }

      // ✅ กรองตามคำค้นหา
      if (searchTerm) {
        query = query.or(
          `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,hospital_number.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
        );
      }

      // ✅ กรองตามโรงพยาบาลที่เลือก
      if (selectedHospital) {
        query = query.eq('hospital_id', selectedHospital);
      }

      // ✅ กรองตาม PAM Level
      if (selectedPamLevel) {
        query = query.eq('pam_level', selectedPamLevel);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading patients:', error);
        return;
      }

      const patientsWithData = data?.map(patient => ({
        ...patient,
        full_name: patient.first_name && patient.last_name
          ? `${patient.first_name} ${patient.last_name}`
          : '',
      })) || [];

      setPatients(patientsWithData);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดผู้ป่วยที่ถูกลบ (กรองตามสิทธิ์)
  const loadDeletedPatients = async (hospitalIds?: string[]) => {
    try {
      const data = await getDeletedPatients();
      
      // ✅ กรองตามโรงพยาบาลที่เข้าถึงได้
      let filteredData = data;
      if (hospitalIds && hospitalIds.length > 0) {
        filteredData = data.filter(p => 
          !p.hospital_id || hospitalIds.includes(p.hospital_id)
        );
      }

      // ✅ กรองตามคำค้นหา
      if (searchTerm) {
        filteredData = filteredData.filter(p => 
          p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.hospital_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      setDeletedPatients(filteredData);
    } catch (error) {
      console.error('Error loading deleted patients:', error);
    }
  };

  // ✅ Handle search changes (รวมทุกฟิลเตอร์ในฟังก์ชันเดียว)
  const handleSearch = () => {
    setLoading(true);
    if (showDeleted) {
      loadDeletedPatients(accessibleHospitalIds);
    } else {
      loadPatients(accessibleHospitalIds);
    }
  };

  // ✅ Handle clear filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedHospital('');
    setSelectedPamLevel('');
    setLoading(true);
    if (showDeleted) {
      loadDeletedPatients(accessibleHospitalIds);
    } else {
      loadPatients(accessibleHospitalIds);
    }
  };

  // ✅ Handle delete patient (Soft Delete)
  const handleDelete = async (patientId: string, patientName: string) => {
    if (!confirm(`คุณต้องการลบผู้ป่วย "${patientName}" หรือไม่?\n\nผู้ป่วยจะย้ายไปอยู่ในรายการ "ที่ถูกลบ" และสามารถกู้คืนได้`)) {
      return;
    }
    
    setDeletingId(patientId);
    try {
      const result = await deletePatient(patientId);
      if (result.success) {
        alert('✅ ลบผู้ป่วยสำเร็จ!');
        loadPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('เกิดข้อผิดพลาดในการลบ');
    } finally {
      setDeletingId(null);
    }
  };

  // ✅ Handle restore patient
  const handleRestore = async (patientId: string, patientName: string) => {
    if (!confirm(`คุณต้องการกู้คืนผู้ป่วย "${patientName}" กลับมาหรือไม่?`)) {
      return;
    }
    
    try {
      const result = await restorePatient(patientId);
      if (result.success) {
        alert('✅ กู้คืนผู้ป่วยสำเร็จ!');
        loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Restore error:', error);
      alert('เกิดข้อผิดพลาดในการกู้คืน');
    }
  };

  // ✅ Handle permanent delete
  const handlePermanentDelete = async (patientId: string, patientName: string) => {
    if (!confirm(`⚠️ คำเตือน: คุณกำลังลบ "${patientName}" อย่างถาวร!\n\nการกระทำนี้ไม่สามารถย้อนกลับได้ คุณแน่ใจหรือไม่?`)) {
      return;
    }
    if (!confirm('ยืนยันครั้งสุดท้าย: พิมพ์ "YES" เพื่อยืนยันการลบถาวร') || prompt('พิมพ์ "YES" เพื่อยืนยัน') !== 'YES') {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', patientId);
      
      if (error) throw error;
      
      await supabase.from('users').delete().eq('id', patientId);
      
      alert('✅ ลบผู้ป่วยถาวรสำเร็จ!');
      loadDeletedPatients(accessibleHospitalIds);
    } catch (error: any) {
      console.error('Permanent delete error:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  // ✅ Handle logout
  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ✅ Group hospitals for dropdown display
  const getGroupedHospitals = () => {
    // ✅ กรองเฉพาะโรงพยาบาลที่ผู้ใช้เข้าถึงได้
    const availableHospitals = accessibleHospitalIds.length > 0 && !isSuperAdmin(user)
      ? hospitals.filter(h => accessibleHospitalIds.includes(h.id))
      : hospitals;

    const mainHospitals = availableHospitals.filter(h => h.type === 'main');
    const subHospitals = availableHospitals.filter(h => h.type === 'sub');
    
    const hospitalGroups = new Map<string, Hospital[]>();
    subHospitals.forEach(sub => {
      if (sub.parent_id) {
        if (!hospitalGroups.has(sub.parent_id)) {
          hospitalGroups.set(sub.parent_id, []);
        }
        hospitalGroups.get(sub.parent_id)!.push(sub);
      }
    });

    return { mainHospitals, hospitalGroups };
  };

  // ✅ Loading state
  if (loading && patients.length === 0 && deletedPatients.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูลผู้ป่วย...</p>
        </div>
      </div>
    );
  }

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ Dashboard
              </button>
              <h1 className="text-3xl font-bold text-gray-800">
                👥 จัดการผู้ป่วย
              </h1>
              <p className="text-gray-600">ดูและจัดการข้อมูลผู้ป่วยทั้งหมด</p>
            </div>

            {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 Admin' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>

          {/* ✅ Search Bar - รวมทั้งหมดในบรรทัดเดียว */}
          <div className="mt-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex flex-wrap items-center gap-3">
              {/* 🔍 Search Input */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, นามสกุล, HN, เบอร์โทร..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* 🏥 Hospital Filter - แสดงเฉพาะ รพ.ที่เข้าถึงได้ */}
              <select
                value={selectedHospital}
                onChange={(e) => { setSelectedHospital(e.target.value); handleSearch(); }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-w-[180px] bg-white"
              >
                <option value="">🏥 ทุกโรงพยาบาล</option>
                {mainHospitals.map((hospital) => (
                  <optgroup key={hospital.id} label={`${hospital.name} (${hospital.code})`}>
                    <option value={hospital.id}>
                      └ {hospital.name} ({hospital.code}) - แม่ข่าย
                    </option>
                    {hospitalGroups.get(hospital.id)?.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {'   '}└─ {sub.name} ({sub.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* 📊 PAM Level Filter */}
              <select
                value={selectedPamLevel}
                onChange={(e) => { setSelectedPamLevel(e.target.value); handleSearch(); }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-w-[140px] bg-white"
              >
                <option value="">📊 ทุกระดับ</option>
                <option value="L1">🔴 L1 - Red Zone</option>
                <option value="L2">🟢 L2 - Green Zone</option>
                <option value="L3">🟡 L3 - Intensive</option>
                <option value="L4">🟢 L4 - Champion</option>
              </select>

              {/* 🔍 Search Button */}
              <button
                onClick={handleSearch}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
              >
                <Search className="w-4 h-4" />
                ค้นหา
              </button>

              {/* 🔄 Clear Button */}
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all text-sm"
              >
                ล้างฟิลเตอร์
              </button>

              {/* 🗑️ Toggle Deleted */}
              <button
                onClick={() => { setShowDeleted(!showDeleted); setLoading(true); if (!showDeleted) loadDeletedPatients(accessibleHospitalIds); else loadPatients(accessibleHospitalIds); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm ${
                  showDeleted 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {showDeleted ? 'แสดงผู้ป่วยปกติ' : 'แสดงที่ถูกลบ'}
              </button>

              {/* ➕ Add Patient Button */}
              {!showDeleted && (
                <button
                  onClick={() => router.push('/admin/patients/new')}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มผู้ป่วย
                </button>
              )}
            </div>
            
            {/* ✅ แสดงจำนวนผลลัพธ์และสิทธิ์ */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {showDeleted 
                  ? `🗑️ แสดงผู้ป่วยที่ถูกลบ: ${deletedPatients.length} ราย` 
                  : `📋 แสดงผู้ป่วย: ${patients.length} ราย`}
                {accessibleHospitalIds.length > 0 && !isSuperAdmin(user) && (
                  <span className="ml-2 text-xs text-blue-600">
                    🔒 จาก {accessibleHospitalIds.length} โรงพยาบาลที่คุณมีสิทธิ์
                  </span>
                )}
              </p>
              {(searchTerm || selectedHospital || selectedPamLevel) && (
                <p className="text-sm text-gray-500">
                  ฟิลเตอร์: 
                  {searchTerm && <span className="ml-1">🔍 "{searchTerm}"</span>}
                  {selectedHospital && <span className="ml-1">🏥 รพ.</span>}
                  {selectedPamLevel && <span className="ml-1">📊 {selectedPamLevel}</span>}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {!showDeleted ? (
          /* ✅ Patients Table */
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ผู้ป่วย</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">HN</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM Level</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โทรศัพท์</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่สร้าง</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {patients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <UserPlus className="w-12 h-12 text-gray-300" />
                          <p>ไม่พบข้อมูลผู้ป่วย</p>
                          {accessibleHospitalIds.length > 0 && !isSuperAdmin(user) && (
                            <p className="text-sm text-blue-600">
                              🔒 คุณเห็นเฉพาะผู้ป่วยในโรงพยาบาลของคุณ
                            </p>
                          )}
                          <button
                            onClick={() => router.push('/admin/patients/new')}
                            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                          >
                            เพิ่มผู้ป่วยคนแรก
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    patients.map((patient) => (
                      <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold">
                                {patient.first_name?.[0] || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{patient.full_name}</p>
                              <p className="text-sm text-gray-500">
                                {patient.gender === 'male' ? '👨 ชาย' : '👩 หญิง'} | 
                                อายุ: {patient.birth_date ? new Date().getFullYear() - new Date(patient.birth_date).getFullYear() : '-'} ปี
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-gray-600">{patient.hospital_number}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-600">{patient.hospitals?.name || '-'}</span>
                            {patient.hospitals && (
                              <span className={`text-xs ${
                                patient.hospitals.type === 'main' 
                                  ? 'text-blue-600' 
                                  : 'text-green-600'
                              }`}>
                                {patient.hospitals.type === 'main' ? '🏥 แม่ข่าย' : '🏥 ลูกข่าย'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            patient.pam_level === 'L1' ? 'bg-red-100 text-red-700' :
                            patient.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                            patient.pam_level === 'L3' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {patient.pam_level || 'L1'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                            patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {patient.zone || 'Green Zone'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{patient.phone || '-'}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(patient.created_at).toLocaleDateString('th-TH')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {/* ✅ Eye Icon - ไปที่ /admin/patients/[id] โดยตรง */}
                            <button
                              onClick={() => router.push(`/admin/patients/${patient.id}`)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="ดูรายละเอียด"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(patient.id, patient.full_name)}
                              disabled={deletingId === patient.id}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="ลบผู้ป่วย"
                            >
                              {deletingId === patient.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ✅ Deleted Patients Table */
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-red-50 border-b border-red-200 px-6 py-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">รายการผู้ป่วยที่ถูกลบ</span>
                <span className="text-sm text-red-600">({deletedPatients.length} ราย)</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ผู้ป่วย</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">HN</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่ลบ</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deletedPatients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <Trash2 className="w-12 h-12 text-gray-300" />
                          <p>ไม่มีผู้ป่วยที่ถูกลบ</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    deletedPatients.map((patient) => (
                      <tr key={patient.id} className="hover:bg-red-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <span className="text-gray-600 font-semibold">
                                {patient.first_name?.[0] || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{patient.full_name}</p>
                              <p className="text-sm text-gray-500">{patient.hospital_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-gray-600">{patient.hospital_number}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">{patient.hospitals?.name || '-'}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {patient.updated_at ? new Date(patient.updated_at).toLocaleDateString('th-TH') : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRestore(patient.id, patient.full_name)}
                              className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all"
                            >
                              <RotateCcw className="w-3 h-3" />
                              กู้คืน
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(patient.id, patient.full_name)}
                              className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                              ลบถาวร
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}