// app/admin/staff/page.tsx
// ✅ แก้ไขล่าสุด: 28 เมษายน 2569
// ✅ การแก้ไข:
//    1. ลบ updated_at ออก (ตาราง users ไม่มีคอลัมน์นี้)
//    2. เพิ่มฟิลด์วันเกิด (วัน/เดือน/ปี พ.ศ.)
//    3. สร้างรหัสผ่านอัตโนมัติจากวันเกิด (dd-mm-yyyy)
//    4. เพิ่ม Checkbox สำหรับรีเซ็ตรหัสผ่านในหน้าแก้ไข

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getStaffList, addStaff, updateStaff, deactivateStaff, permanentlyDeleteStaff, restoreStaff, getDeactivatedStaff, getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { Users, Plus, Edit, Trash2, LogOut, ArrowLeft, UserCheck, UserX, Shield, Stethoscope, Heart, Archive, RotateCcw, Calendar, Key, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ✅ เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ✅ Interface สำหรับโรงพยาบาล
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

export default function StaffManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [deactivatedStaff, setDeactivatedStaff] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadStaffList();
    loadHospitals();
  }, [router]);

  const loadHospitals = async () => {
    try {
      console.log('🏥 Loading hospitals with hierarchy...');
      const data = await getHospitalsWithHierarchy();
      console.log('✅ Hospitals loaded:', data.length);
      setHospitals(data);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  const loadStaffList = async () => {
    try {
      const data = await getStaffList();
      setStaffList(data);
    } catch (error) {
      console.error('Error loading staff list:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeactivatedStaff = async () => {
    try {
      const data = await getDeactivatedStaff();
      setDeactivatedStaff(data);
    } catch (error) {
      console.error('Error loading deactivated staff:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleDeactivate = async (staffId: string, staffName: string) => {
    if (!confirm(`คุณต้องการปิดการใช้งาน "${staffName}" หรือไม่?`)) {
      return;
    }
    try {
      const result = await deactivateStaff(staffId);
      if (result.success) {
        alert('ปิดการใช้งานเจ้าหน้าที่สำเร็จ!');
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error deactivating staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleRestoreStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`คุณต้องการกู้คืน "${staffName}" กลับมาใช้งานหรือไม่?`)) {
      return;
    }
    try {
      const result = await restoreStaff(staffId);
      if (result.success) {
        alert('กู้คืนเจ้าหน้าที่สำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error restoring staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handlePermanentlyDeleteStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`⚠️ คำเตือน: คุณกำลังลบ "${staffName}" อย่างถาวร\n\nการกระทำนี้ไม่สามารถย้อนกลับได้\n\nคุณแน่ใจหรือไม่?`)) {
      return;
    }
    if (!confirm('⚠️ ยืนยันครั้งสุดท้าย: การลบถาวรจะไม่สามารถกู้คืนได้\n\nพิมพ์ "YES" เพื่อยืนยัน')) {
      return;
    }

    try {
      const result = await permanentlyDeleteStaff(staffId);
      if (result.success) {
        alert('ลบเจ้าหน้าที่ถาวรสำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error permanently deleting staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (staff: any) => {
    setSelectedStaff(staff);
    setShowEditModal(true);
  };

  const handleOpenDeactivatedModal = () => {
    setShowDeactivatedModal(true);
    loadDeactivatedStaff();
  };

  // ✅ ฟังก์ชันจัดกลุ่มโรงพยาบาลแบบ Hierarchical
  const getGroupedHospitals = () => {
    const mainHospitals = hospitals.filter(h => h.type === 'main');
    const subHospitals = hospitals.filter(h => h.type === 'sub');
    
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                👥 จัดการเจ้าหน้าที่
              </h1>
              <p className="text-gray-600">จัดการผู้ดูแลระบบ แพทย์ และเจ้าหน้าที่</p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleOpenDeactivatedModal}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                <Archive className="w-4 h-4" />
                ที่ปิดการใช้งาน ({deactivatedStaff.length})
              </button>
              
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                เพิ่มเจ้าหน้าที่
              </button>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">เจ้าหน้าที่ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{staffList.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ผู้ดูแลระบบ</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'admin').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">แพทย์</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'doctor').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <Heart className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">เจ้าหน้าที่</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'helper').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">บทบาท</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID Card</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ความเชี่ยวชาญ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่สร้าง</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลเจ้าหน้าที่</p>
                    </td>
                  </tr>
                ) : (
                  staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {staff.doctors?.full_name_th || '-'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {staff.doctors?.phone || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          staff.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          staff.role === 'doctor' ? 'bg-green-100 text-green-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {staff.role === 'admin' ? 'ผู้ดูแลระบบ' :
                           staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {staff.hospitals?.name || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-600">
                          {staff.id_card}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {staff.doctors?.specialization_th || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {staff.is_active ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <UserCheck className="w-4 h-4" />
                            ใช้งาน
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <UserX className="w-4 h-4" />
                            ปิดการใช้งาน
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(staff.created_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {staff.is_active && (
                            <>
                              <button
                                onClick={() => handleEdit(staff)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="แก้ไข"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeactivate(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="ปิดการใช้งาน"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <AddStaffModal
          hospitals={hospitals}
          getGroupedHospitals={getGroupedHospitals}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadStaffList();
          }}
          userId={user?.id}
        />
      )}

      {/* Edit Staff Modal */}
      {showEditModal && selectedStaff && (
        <EditStaffModal
          staff={selectedStaff}
          hospitals={hospitals}
          getGroupedHospitals={getGroupedHospitals}
          onClose={() => {
            setShowEditModal(false);
            setSelectedStaff(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedStaff(null);
            loadStaffList();
          }}
        />
      )}

      {/* Deactivated Staff Modal */}
      {showDeactivatedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Archive className="w-6 h-6 text-gray-600" />
                  เจ้าหน้าที่ที่ปิดการใช้งาน ({deactivatedStaff.length})
                </h2>
                <button
                  onClick={() => setShowDeactivatedModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                คลิก "กู้คืน" เพื่อนำกลับมาใช้งาน หรือ "ลบถาวร" เพื่อลบออกจากระบบอย่างถาวร
              </p>
            </div>

            <div className="p-6">
              {deactivatedStaff.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">ไม่มีเจ้าหน้าที่ที่ปิดการใช้งาน</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deactivatedStaff.map((staff) => (
                    <div key={staff.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-800">{staff.doctors?.full_name_th || '-'}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              staff.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                              staff.role === 'doctor' ? 'bg-green-100 text-green-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {staff.role === 'admin' ? 'ผู้ดูแลระบบ' :
                               staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>ID Card: {staff.id_card}</p>
                            <p>ความเชี่ยวชาญ: {staff.doctors?.specialization_th || '-'}</p>
                            <p>โรงพยาบาล: {staff.hospitals?.name || '-'}</p>
                            <p>ปิดการใช้งานเมื่อ: {new Date(staff.updated_at || staff.created_at).toLocaleString('th-TH')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleRestoreStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                            title="กู้คืน"
                          >
                            <RotateCcw className="w-4 h-4" />
                            กู้คืน
                          </button>
                          <button
                            onClick={() => handlePermanentlyDeleteStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
                            title="ลบถาวร"
                          >
                            <Trash2 className="w-4 h-4" />
                            ลบถาวร
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowDeactivatedModal(false)}
                className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Staff Modal Component
function AddStaffModal({
  hospitals,
  getGroupedHospitals,
  onClose,
  onSuccess,
  userId
}: {
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  onClose: () => void;
  onSuccess: () => void;
  userId: string
}) {
  const [formData, setFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'doctor' | 'helper',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
  });
  const [loading, setLoading] = useState(false);

  // ✅ ฟังก์ชันสร้างรหัสผ่านจากวันเกิด
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // ✅ ตรวจสอบว่ากรอกวันเกิดครบหรือไม่
      if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
        alert('กรุณากรอกวันเกิดให้ครบถ้วน');
        setLoading(false);
        return;
      }

      // ✅ สร้างรหัสผ่านจากวันเกิด (dd-mm-yyyy)
      const password = generatePassword();

      // ✅ รวมวันเกิดเป็น ค.ศ. (YYYY-MM-DD) สำหรับเก็บในฐานข้อมูล
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const result = await addStaff({
        ...formData,
        password: password, // ✅ ใช้รหัสผ่านที่สร้างจากวันเกิด
        birth_date: birthDate, // ✅ เพิ่ม birth_date
        created_by: userId,
      });

      if (result.success) {
        alert(`เพิ่มเจ้าหน้าที่สำเร็จ!\n\n🔐 รหัสผ่าน: ${password}\n(วัน-เดือน-ปีเกิด)`);
        onSuccess();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding staff:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">เพิ่มเจ้าหน้าที่ใหม่</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID Card *
              </label>
              <input
                type="text"
                value={formData.id_card}
                onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                required
                maxLength={13}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🔐 รหัสผ่าน (อัตโนมัติ)
              </label>
              <input
                type="text"
                value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)
              </p>
            </div>
          </div>

          {/* ✅ วันเกิด (3 ช่อง) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันเกิด *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={formData.birth_day}
                onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                required
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">วัน</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                value={formData.birth_month}
                onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })}
                required
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">เดือน</option>
                {THAI_MONTHS.map((month, index) => (
                  <option key={index + 1} value={index + 1}>{month}</option>
                ))}
              </select>
              <select
                value={formData.birth_year}
                onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
                required
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ปี พ.ศ.</option>
                {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-blue-600 mt-1">
              💡 รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อ-นามสกุล *
            </label>
            <input
              type="text"
              value={formData.full_name_th}
              onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                บทบาท *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'doctor' | 'helper' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="doctor">แพทย์</option>
                <option value="helper">เจ้าหน้าที่</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ความเชี่ยวชาญ
              </label>
              <input
                type="text"
                value={formData.specialization_th}
                onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* ✅ Dropdown เลือกโรงพยาบาล - แบบ Hierarchical */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โรงพยาบาลสังกัด
            </label>
            <select
              value={formData.hospital_id}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
            >
              <option value="">-- เลือกโรงพยาบาล --</option>
              
              {/* ✅ แม่ข่าย */}
              {mainHospitals.map((hospital) => (
                <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                  <option value={hospital.id}>
                    └ {hospital.name} ({hospital.code}) - แม่ข่าย
                  </option>
                  {/* ✅ ลูกข่ายของแม่ข่ายนี้ */}
                  {hospitalGroups.get(hospital.id)?.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {'   '}└─ {sub.name} ({sub.code})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 โรงพยาบาล: {hospitals.length} แห่ง
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ✅ Edit Staff Modal Component (แก้ไขแล้ว - ลบ updated_at)
function EditStaffModal({
  staff,
  hospitals,
  getGroupedHospitals,
  onClose,
  onSuccess
}: {
  staff: any;
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  onClose: () => void;
  onSuccess: () => void
}) {
  // ✅ แยกวันเกิดจาก staff.birth_date (YYYY-MM-DD)
  const parseBirthDate = (dateString: string | null) => {
    if (!dateString) return { day: '', month: '', year: '' };
    const date = new Date(dateString);
    return {
      day: date.getDate().toString(),
      month: (date.getMonth() + 1).toString(),
      year: (date.getFullYear() + 543).toString() // แปลงเป็น พ.ศ.
    };
  };

  const initialBirthDate = parseBirthDate(staff.birth_date);

  const [formData, setFormData] = useState({
    full_name_th: staff.doctors?.full_name_th || '',
    specialization_th: staff.doctors?.specialization_th || '',
    phone: staff.doctors?.phone || '',
    email: staff.doctors?.email || '',
    hospital_id: staff.hospital_id || '',
    birth_day: initialBirthDate.day,
    birth_month: initialBirthDate.month,
    birth_year: initialBirthDate.year,
  });

  const [loading, setLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState(false); // ✅ Checkbox รีเซ็ตรหัสผ่าน

  // ✅ ฟังก์ชันสร้างรหัสผ่านจากวันเกิด
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // ✅ รวมวันเกิดเป็น ค.ศ. (YYYY-MM-DD)
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      // ✅ 1. อัปเดตข้อมูลในตาราง doctors
      const result = await updateStaff(staff.id, {
        ...formData,
        birth_date: birthDate, // ✅ ส่ง birth_date ไปด้วย
      });
      
      if (!result.success) {
        alert('เกิดข้อผิดพลาด: ' + result.error);
        setLoading(false);
        return;
      }

      // ✅ 2. อัปเดต hospital_id และ birth_date ในตาราง users (ถ้ามีการเปลี่ยน)
      const updateData: any = {
        birth_date: birthDate,
        // ✅ ลบ updated_at ออก (ตาราง users ไม่มีคอลัมน์นี้)
      };

      if (formData.hospital_id !== staff.hospital_id) {
        updateData.hospital_id = formData.hospital_id;
      }

      // ✅ 3. ถ้าติ๊ก Checkbox → รีเซ็ตรหัสผ่านให้ตรงกับวันเกิดใหม่
      if (resetPassword) {
        const newPassword = generatePassword();
        updateData.password_hash = newPassword;
      }

      const { error: userError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', staff.id);

      if (userError) {
        console.error('Error updating user:', userError);
      }

      // ✅ แจ้งผลลัพธ์
      let message = 'แก้ไขข้อมูลสำเร็จ!';
      if (resetPassword) {
        message += `\n\n🔐 รีเซ็ตรหัสผ่านใหม่แล้ว: ${generatePassword()}`;
      }
      
      alert(message);
      onSuccess();
    } catch (error) {
      console.error('Error updating staff:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">✏️ แก้ไขข้อมูลเจ้าหน้าที่</h2>
          <p className="text-sm text-gray-500 mt-1">
            {staff.doctors?.full_name_th || '-'} | {staff.id_card}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ✅ ชื่อ-นามสกุล (แสดงก่อน) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อ-นามสกุล
            </label>
            <input
              type="text"
              value={formData.full_name_th}
              onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ✅ วันเกิด (3 ช่อง) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันเกิด
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={formData.birth_day}
                onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">วัน</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                value={formData.birth_month}
                onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">เดือน</option>
                {THAI_MONTHS.map((month, index) => (
                  <option key={index + 1} value={index + 1}>{month}</option>
                ))}
              </select>
              <select
                value={formData.birth_year}
                onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ปี พ.ศ.</option>
                {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ✅ Checkbox รีเซ็ตรหัสผ่าน */}
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              id="resetPassword"
              checked={resetPassword}
              onChange={(e) => setResetPassword(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="resetPassword" className="text-sm text-gray-700 flex items-center gap-2 flex-1 cursor-pointer">
              <Key className="w-4 h-4" />
              <span>รีเซ็ตรหัสผ่านให้ตรงกับวันเกิดใหม่</span>
              {generatePassword() && (
                <span className="font-mono font-bold text-blue-600">
                  ({generatePassword()})
                </span>
              )}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ความเชี่ยวชาญ
            </label>
            <input
              type="text"
              value={formData.specialization_th}
              onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น อายุรกรรม, ศัลยกรรม, เจ้าหน้าที่สาธารณสุข"
            />
          </div>

          {/* ✅ Dropdown เลือกโรงพยาบาล - แบบ Hierarchical */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โรงพยาบาลสังกัด
            </label>
            <select
              value={formData.hospital_id}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
            >
              <option value="">-- เลือกโรงพยาบาล --</option>
              
              {/* ✅ แม่ข่าย */}
              {mainHospitals.map((hospital) => (
                <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                  <option value={hospital.id}>
                    └ {hospital.name} ({hospital.code}) - แม่ข่าย
                  </option>
                  {/* ✅ ลูกข่ายของแม่ข่ายนี้ */}
                  {hospitalGroups.get(hospital.id)?.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {'   '}└─ {sub.name} ({sub.code})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 โรงพยาบาล: {hospitals.length} แห่ง
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0812345678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึก
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}