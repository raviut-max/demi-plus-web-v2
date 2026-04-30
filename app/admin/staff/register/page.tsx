// app/admin/staff/register/page.tsx
// ✅ หน้าลงทะเบียนบุคลากรใหม่ (Standalone)
// ✅ สร้างรหัสผ่านอัตโนมัติจากวันเกิด (dd-mm-yyyy)
// ✅ เลือกบทบาทได้เฉพาะ Doctor และ Helper (ไม่มี Admin)

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getHospitalsWithHierarchy, addStaff } from '@/lib/supabase/queries';
import { 
  ArrowLeft, 
  UserPlus, 
  Calendar, 
  Key, 
  Save, 
  X,
  User,
  Phone,
  Mail,
  Building2,
  Stethoscope,
  Shield,
  LogOut,
  CheckCircle
} from 'lucide-react';

// ✅ เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

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

export default function StaffRegisterPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

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

  useEffect(() => {
    console.log('🔍 [StaffRegister] Component mounted');
    
    const userData = checkSession();
    if (!userData) {
      console.warn('⚠️ [StaffRegister] No session found - Redirecting to login');
      router.push('/admin/login');
      return;
    }

    if (userData.role !== 'admin') {
      console.error('❌ [StaffRegister] User not admin:', userData.role);
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }

    setUser(userData);
    loadHospitals();
  }, [router]);

  const loadHospitals = async () => {
    try {
      console.log('🏥 [loadHospitals] Fetching hospitals with hierarchy...');
      const data = await getHospitalsWithHierarchy();
      console.log(`✅ [loadHospitals] Loaded ${data.length} hospitals`);
      setHospitals(data);
    } catch (error) {
      console.error('❌ [loadHospitals] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  // ✅ สร้างรหัสผ่านจากวันเกิด
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    const password = `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
    console.log('🔐 [generatePassword] Generated:', password);
    return password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 [StaffRegister] Form submitted');
    console.log('📋 [StaffRegister] Form data:', formData);
    
    // ✅ ตรวจสอบว่ากรอกวันเกิดครบหรือไม่
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      console.error('❌ [StaffRegister] Birth date incomplete');
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    setLoading(true);

    try {
      // ✅ สร้างรหัสผ่านจากวันเกิด
      const password = generatePassword();
      setGeneratedPassword(password);
      console.log('🔐 [StaffRegister] Password:', password);

      // ✅ แปลงวันเกิดเป็น ค.ศ.
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;
      console.log('📅 [StaffRegister] Birth date (AD):', birthDate);

      // ✅ เรียก API เพิ่มบุคลากร
      console.log('💾 [StaffRegister] Calling addStaff API...');
      const result = await addStaff({
        ...formData,
        password: password,
        birth_date: birthDate,
        created_by: user.id,
      });

      if (result.success) {
        console.log('✅ [StaffRegister] Staff added successfully');
        setShowPassword(true);
      } else {
        console.error('❌ [StaffRegister] API error:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [StaffRegister] Exception:', error);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

  // ✅ จัดกลุ่มโรงพยาบาลแบบ Hierarchical
  const getGroupedHospitals = () => {
    console.log('🏥 [getGroupedHospitals] Grouping hospitals...');
    
    const mainHospitals = hospitals.filter(h => h.type === 'main');
    const subHospitals = hospitals.filter(h => h.type === 'sub');
    
    console.log(`📊 [getGroupedHospitals] Main: ${mainHospitals.length}, Sub: ${subHospitals.length}`);
    
    const hospitalGroups = new Map<string, Hospital[]>();
    
    subHospitals.forEach(sub => {
      if (sub.parent_id) {
        if (!hospitalGroups.has(sub.parent_id)) {
          hospitalGroups.set(sub.parent_id, []);
        }
        hospitalGroups.get(sub.parent_id)!.push(sub);
      }
    });

    console.log('✅ [getGroupedHospitals] Grouped into', hospitalGroups.size, 'groups');
    return { mainHospitals, hospitalGroups };
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  // ✅ หน้าแสดงรหัสผ่าน
  if (showPassword) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <button
              onClick={() => router.push('/admin/staff')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าจัดการเจ้าหน้าที่
            </button>
            
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  ✅ ลงทะเบียนสำเร็จ
                </h1>
                <p className="text-gray-600">บุคลากรได้รับการสร้างในระบบเรียบร้อยแล้ว</p>
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              ลงทะเบียนบุคลากรสำเร็จ!
            </h2>
            
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-5 h-5 text-yellow-600" />
                <h3 className="text-lg font-bold text-yellow-800">
                  รหัสผ่านสำหรับเข้าสู่ระบบ
                </h3>
              </div>
              
              <div className="bg-white rounded-lg p-4 mb-3">
                <p className="text-3xl font-mono font-bold text-yellow-700">
                  {generatedPassword}
                </p>
              </div>
              
              <p className="text-sm text-yellow-700">
                💡 รหัสผ่านนี้สร้างจากวันเกิด (วัน-เดือน-ปี พ.ศ.)<br/>
                <span className="font-semibold">กรุณาแจ้งรหัสผ่านนี้ให้บุคลากรทราบ</span>
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowPassword(false);
                  setFormData({
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
                  });
                  setGeneratedPassword('');
                }}
                className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                ลงทะเบียนบุคคลใหม่
              </button>
              
              <button
                onClick={() => router.push('/admin/staff')}
                className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                กลับหน้าจัดการ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/staff')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าจัดการเจ้าหน้าที่
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📝 ลงทะเบียนบุคลากรใหม่
              </h1>
              <p className="text-gray-600">เพิ่มแพทย์หรือเจ้าหน้าที่เข้าสู่ระบบ</p>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ID Card & Password Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  ID Card / เลขบัตรประชาชน *
                </label>
                <input
                  type="text"
                  value={formData.id_card}
                  onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                  required
                  maxLength={13}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="13 หลัก"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Key className="w-4 h-4 inline mr-1" />
                  รหัสผ่าน (สร้างอัตโนมัติ)
                </label>
                <input
                  type="text"
                  value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)
                </p>
              </div>
            </div>

            {/* Birth Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                วันเกิด *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={formData.birth_day}
                  onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                  required
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                💡 รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด
              </p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                ชื่อ-นามสกุล *
              </label>
              <input
                type="text"
                value={formData.full_name_th}
                onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="เช่น สมชาย ใจดี"
              />
            </div>

            {/* Role & Specialization */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" />
                  บทบาท *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'doctor' | 'helper' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">👩‍ เจ้าหน้าที่</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  💡 ไม่สามารถสร้าง Admin ได้จากหน้านี้
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Stethoscope className="w-4 h-4 inline mr-1" />
                  ความเชี่ยวชาญ
                </label>
                <input
                  type="text"
                  value={formData.specialization_th}
                  onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="เช่น อายุรกรรม, ศัลยกรรม, เจ้าหน้าที่สาธารณสุข"
                />
              </div>
            </div>

            {/* Hospital Selection - Hierarchical */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                โรงพยาบาลสังกัด
              </label>
              <select
                value={formData.hospital_id}
                onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-64 overflow-y-auto"
              >
                <option value="">-- เลือกโรงพยาบาล --</option>
                
                {/* Main Hospitals */}
                {mainHospitals.map((hospital) => (
                  <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                    <option value={hospital.id}>
                      └ {hospital.name} ({hospital.code}) - แม่ข่าย
                    </option>
                    {/* Sub Hospitals */}
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

            {/* Phone & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-1" />
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0812345678"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  อีเมล
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-500 text-white font-bold py-4 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    กำลังลงทะเบียน...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    ลงทะเบียนบุคลากร
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => router.push('/admin/staff')}
                className="px-8 bg-gray-500 text-white font-bold py-4 rounded-lg hover:bg-gray-600 transition-all flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}