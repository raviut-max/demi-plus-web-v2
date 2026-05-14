// app/admin/settings/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin,
  getStaffList,
  addStaff,
  updateStaff,
  deactivateStaff,
  getHospitalsWithHierarchy,
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Lock,
  Building2,
  BookOpen,
  Shield,
  Users,
  Settings,
  UserCheck,
  Hospital,
  LogOut,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  UserPlus,
  Database,
  FileText,
  Activity,
  Edit,
  Trash2,
  X,
  Save,
  Calendar,
  Key,
  Phone,
  Mail,
  CheckCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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

interface SystemStats {
  totalHospitals: number;
  totalStaff: number;
  totalPatients: number;
  pendingApprovals: number;
}

interface StaffMember {
  id: string;
  id_card: string;
  full_name_th: string;
  role: 'admin' | 'doctor' | 'helper';
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;
  birth_date?: string;
  is_active: boolean;
  created_at: string;
  hospitals?: {
    name: string;
    code: string;
  };
  doctors?: {
    full_name_th: string;
    specialization_th: string;
    phone: string;
    email: string;
  };
}

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats>({
    totalHospitals: 0,
    totalStaff: 0,
    totalPatients: 0,
    pendingApprovals: 0,
  });

  // Staff Management States
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [staffFormData, setStaffFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'admin' | 'doctor' | 'helper',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
    admin_type: null as 'super' | 'hospital' | null,
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!isSuperAdmin(userData) && userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบระดับสูงเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadSystemStats();
    loadAccessibleHospitals(userData.id);
    setLoading(false);
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      await loadStaffList(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const loadStaffList = async (hospitalIds?: string[]) => {
    try {
      const allStaff = await getStaffList();
      let filteredStaff = allStaff;
      
      if (!isSuperAdmin(user) && hospitalIds && hospitalIds.length > 0) {
        filteredStaff = allStaff.filter(staff => {
          if (!staff.hospital_id) return true;
          return hospitalIds.includes(staff.hospital_id);
        });
      }
      
      setStaffList(filteredStaff);
    } catch (error) {
      console.error('Error loading staff list:', error);
    }
  };

  const loadSystemStats = async () => {
    try {
      const { count: hospitalsCount } = await supabase
        .from('hospitals')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: staffCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['admin', 'doctor', 'helper'])
        .eq('is_active', true);

      const { count: patientsCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: pendingCount } = await supabase
        .from('pending_staff')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setStats({
        totalHospitals: hospitalsCount || 0,
        totalStaff: staffCount || 0,
        totalPatients: patientsCount || 0,
        pendingApprovals: pendingCount || 0,
      });
    } catch (error) {
      console.error('Error loading system stats:', error);
    }
  };

  const loadHospitals = async () => {
    try {
      const data = await getHospitalsWithHierarchy();
      setHospitals(data);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '12345678') {
      setIsAuthenticated(true);
      setError('');
      loadHospitals();
    } else {
      setError('❌ รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  };

  const generatePassword = () => {
    if (!staffFormData.birth_day || !staffFormData.birth_month || !staffFormData.birth_year) return '';
    return `${staffFormData.birth_day.padStart(2, '0')}-${staffFormData.birth_month.padStart(2, '0')}-${staffFormData.birth_year}`;
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!staffFormData.birth_day || !staffFormData.birth_month || !staffFormData.birth_year) {
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    if (!isSuperAdmin(user) && staffFormData.role === 'admin') {
      alert('❌ คุณไม่มีสิทธิ์สร้างผู้ดูแลระบบใหม่');
      return;
    }

    if ((staffFormData.role === 'admin' || staffFormData.role === 'doctor' || staffFormData.role === 'helper') && !staffFormData.hospital_id) {
      alert('กรุณาเลือกโรงพยาบาลสังกัด');
      return;
    }

    try {
      const password = generatePassword();
      const birthYearAD = parseInt(staffFormData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${staffFormData.birth_month.padStart(2, '0')}-${staffFormData.birth_day.padStart(2, '0')}`;

      const result = await addStaff({
        ...staffFormData,
        password: password,
        birth_date: birthDate,
        created_by: user.id,
        admin_type: staffFormData.role === 'admin' ? staffFormData.admin_type : null,
      });

      if (result.success) {
        alert(`เพิ่มเจ้าหน้าที่สำเร็จ!\nรหัสผ่าน: ${password}\n(วัน-เดือน-ปีเกิด)`);
        setShowStaffModal(false);
        resetStaffForm();
        await loadStaffList(accessibleHospitalIds);
        await loadSystemStats();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error adding staff:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleDeactivateStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`คุณต้องการปิดการใช้งาน "${staffName}" ใช่หรือไม่?`)) return;

    try {
      const result = await deactivateStaff(staffId);
      if (result.success) {
        alert('ปิดการใช้งานสำเร็จ!');
        await loadStaffList(accessibleHospitalIds);
        await loadSystemStats();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error deactivating staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const resetStaffForm = () => {
    setStaffFormData({
      id_card: '',
      birth_day: '',
      birth_month: '',
      birth_year: '',
      full_name_th: '',
      role: 'doctor',
      specialization_th: '',
      phone: '',
      email: '',
      hospital_id: '',
      admin_type: null,
    });
    setEditingStaff(null);
  };

  const openAddStaffModal = () => {
    resetStaffForm();
    setShowStaffModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
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
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">⚙️ ตั้งค่าระบบ</h1>
              <p className="text-gray-600">จัดการการตั้งค่าระบบและข้อมูลพื้นฐาน</p>
            </div>

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
                        {isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}
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
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {!isAuthenticated ? (
          /* 🔐 หน้ายืนยันรหัสผ่าน */
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">ยืนยันตัวตน</h2>
              <p className="text-gray-600 text-sm">กรุณากรอกรหัสผ่านเพื่อเข้าถึงหน้าตั้งค่า</p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="กรอกรหัสผ่าน"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-red-700 text-sm">{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-all font-semibold"
              >
                ยืนยัน
              </button>
            </form>
          </div>
        ) : (
          /* ✅ หน้าจัดการหลังยืนยันรหัสผ่าน */
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">ยืนยันตัวตนสำเร็จ</p>
                <p className="text-sm text-green-700">คุณสามารถจัดการระบบได้ตอนนี้</p>
              </div>
            </div>

            {/* ✅ สถิติระบบ */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">โรงพยาบาล</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalHospitals}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">เจ้าหน้าที่</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalStaff}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ผู้ป่วย</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">รออนุมัติ</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.pendingApprovals}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ เมนูจัดการ - แบ่งเป็นหมวดหมู่ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 👥 หมวดเจ้าหน้าที่ - เพิ่มใหม่ */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    จัดการเจ้าหน้าที่
                  </h3>
                  <button
                    onClick={openAddStaffModal}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm font-medium"
                  >
                    <UserPlus className="w-4 h-4" />
                    เพิ่มเจ้าหน้าที่
                  </button>
                </div>

                {/* รายการเจ้าหน้าที่ */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">บทบาท</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID Card</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {staffList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
                                      {staff.doctors?.full_name_th || staff.full_name_th || '-'}
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
                                  {staff.role === 'admin' ? '🏥 Hospital Admin' :
                                   staff.role === 'doctor' ? '👨‍️ แพทย์' : '👩‍⚕️ เจ้าหน้าที่'}
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
                                {staff.is_active ? (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <CheckCircle className="w-4 h-4" />
                                    ใช้งาน
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-gray-400">
                                    ปิดการใช้งาน
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDeactivateStaff(staff.id, staff.doctors?.full_name_th || staff.full_name_th || 'เจ้าหน้าที่')}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="ปิดการใช้งาน"
                                  >
                                    <Trash2 className="w-4 h-4" />
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
              </div>

              {/* 📊 หมวดข้อมูลผู้ป่วย */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-green-600" />
                  จัดการข้อมูลผู้ป่วย
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => router.push('/admin/patients/import-excel')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-all">
                        <FileSpreadsheet className="w-7 h-7 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">นำเข้าจาก Excel</h3>
                        <p className="text-sm text-gray-500">Import ผู้ป่วยจำนวนมาก</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      อัปโหลดไฟล์ Excel เพื่อนำเข้าผู้ป่วยหลายรายพร้อมกัน พร้อมตรวจสอบและแก้ไขก่อนบันทึก
                    </p>
                  </button>

                  <button
                    onClick={() => router.push('/admin/patients/new')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-all">
                        <UserPlus className="w-7 h-7 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">เพิ่มผู้ป่วยใหม่</h3>
                        <p className="text-sm text-gray-500">เพิ่มทีละราย</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      เพิ่มผู้ป่วยใหม่ทีละราย พร้อมกรอกข้อมูลครบถ้วน
                    </p>
                  </button>

                  <button
                    onClick={() => router.push('/admin/patients')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-all">
                        <Users className="w-7 h-7 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">รายการผู้ป่วย</h3>
                        <p className="text-sm text-gray-500">ดูและแก้ไข</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      ดูรายการผู้ป่วยทั้งหมด ค้นหา และแก้ไขข้อมูล
                    </p>
                  </button>
                </div>
              </div>

              {/* 🏥 หมวดโรงพยาบาล */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Hospital className="w-5 h-5 text-blue-600" />
                  จัดการโรงพยาบาล
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => router.push('/admin/hospitals')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-all">
                        <Building2 className="w-7 h-7 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">จัดการโรงพยาบาล</h3>
                        <p className="text-sm text-gray-500">โรงพยาบาลแม่ข่ายและลูกข่าย</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      เพิ่ม/แก้ไข/ลบ ข้อมูลโรงพยาบาลและกำหนดความสัมพันธ์แม่ข่าย-ลูกข่าย
                    </p>
                  </button>

                  <button
                    onClick={() => router.push('/admin/knowledge')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-all">
                        <BookOpen className="w-7 h-7 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">จัดการความรู้</h3>
                        <p className="text-sm text-gray-500">บทความและวิดีโอ</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      เพิ่ม/แก้ไข/ลบ บทความและวิดีโอความรู้สำหรับผู้ป่วย
                    </p>
                  </button>
                </div>
              </div>

              {/* 🔙 ปุ่มออกจากระบบตั้งค่า */}
              <div className="lg:col-span-3 pt-6">
                <button
                  onClick={() => {
                    setIsAuthenticated(false);
                    setPassword('');
                  }}
                  className="w-full bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-all font-semibold"
                >
                  ออกจากระบบตั้งค่า
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal เพิ่ม/แก้ไขเจ้าหน้าที่ */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingStaff ? '✏️ แก้ไขข้อมูลเจ้าหน้าที่' : '➕ เพิ่มเจ้าหน้าที่ใหม่'}
              </h2>
              <button
                onClick={() => {
                  setShowStaffModal(false);
                  resetStaffForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              {/* ID Card & Password */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Card *</label>
                  <input
                    type="text"
                    value={staffFormData.id_card}
                    onChange={(e) => setStaffFormData({ ...staffFormData, id_card: e.target.value })}
                    required
                    maxLength={13}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">🔐 รหัสผ่าน (อัตโนมัติ)</label>
                  <input
                    type="text"
                    value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)</p>
                </div>
              </div>

              {/* Birth Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันเกิด *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={staffFormData.birth_day}
                    onChange={(e) => setStaffFormData({ ...staffFormData, birth_day: e.target.value })}
                    required
                    className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">วัน</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>

                  <select
                    value={staffFormData.birth_month}
                    onChange={(e) => setStaffFormData({ ...staffFormData, birth_month: e.target.value })}
                    required
                    className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">เดือน</option>
                    {THAI_MONTHS.map((month, index) => (
                      <option key={index + 1} value={index + 1}>{month}</option>
                    ))}
                  </select>

                  <select
                    value={staffFormData.birth_year}
                    onChange={(e) => setStaffFormData({ ...staffFormData, birth_year: e.target.value })}
                    required
                    className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">ปี พ.ศ.</option>
                    {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
                <input
                  type="text"
                  value={staffFormData.full_name_th}
                  onChange={(e) => setStaffFormData({ ...staffFormData, full_name_th: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท *</label>
                <select
                  value={staffFormData.role}
                  onChange={(e) => setStaffFormData({ 
                    ...staffFormData, 
                    role: e.target.value as 'admin' | 'doctor' | 'helper',
                    admin_type: e.target.value !== 'admin' ? null : staffFormData.admin_type
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {isSuperAdmin(user) && <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>}
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">👩‍️ เจ้าหน้าที่</option>
                </select>
                {!isSuperAdmin(user) && (
                  <p className="text-xs text-blue-600 mt-1">
                    ℹ️ Hospital Admin สามารถสร้างได้เฉพาะ แพทย์ และ เจ้าหน้าที่
                  </p>
                )}
              </div>

              {/* Admin Type Field (เฉพาะ Super Admin) */}
              {staffFormData.role === 'admin' && isSuperAdmin(user) && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-purple-800 mb-2">
                    <Shield className="w-4 h-4 inline mr-1" />
                    ประเภทผู้ดูแลระบบ *
                  </label>
                  <select
                    value={staffFormData.admin_type || ''}
                    onChange={(e) => setStaffFormData({ 
                      ...staffFormData, 
                      admin_type: e.target.value as 'super' | 'hospital' || null 
                    })}
                    required
                    className="w-full px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- เลือกประเภท --</option>
                    <option value="super">👑 Super Admin (เข้าถึงทั้งหมด)</option>
                    <option value="hospital">🏥 Hospital Admin (เข้าถึงเฉพาะโรงพยาบาล)</option>
                  </select>
                </div>
              )}

              {/* Specialization */}
              {(staffFormData.role === 'doctor' || staffFormData.role === 'helper') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ความเชี่ยวชาญ</label>
                  <input
                    type="text"
                    value={staffFormData.specialization_th}
                    onChange={(e) => setStaffFormData({ ...staffFormData, specialization_th: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={staffFormData.role === 'helper' ? 'เช่น เจ้าหน้าที่สาธารณสุข, พยาบาล' : 'เช่น อายุรกรรม, ศัลยกรรม'}
                  />
                </div>
              )}

              {/* Hospital Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  โรงพยาบาลสังกัด {staffFormData.role !== 'admin' ? '*' : ''}
                </label>
                <select
                  value={staffFormData.hospital_id}
                  onChange={(e) => setStaffFormData({ ...staffFormData, hospital_id: e.target.value })}
                  required={staffFormData.role !== 'admin'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>
                  {hospitals.filter(h => isSuperAdmin(user) || accessibleHospitalIds.includes(h.id)).map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      🏥 {hospital.name} ({hospital.code}) - {hospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="tel"
                    value={staffFormData.phone}
                    onChange={(e) => setStaffFormData({ ...staffFormData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    อีเมล
                  </label>
                  <input
                    type="email"
                    value={staffFormData.email}
                    onChange={(e) => setStaffFormData({ ...staffFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  บันทึก
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowStaffModal(false);
                    resetStaffForm();
                  }}
                  className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}