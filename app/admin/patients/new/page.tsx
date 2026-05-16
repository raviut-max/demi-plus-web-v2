'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  registerPatient,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  UserPlus,
  AlertCircle,
  Loader2,
  ArrowLeft,
  UserCheck,
  Hospital,
  Building2,
  LogOut,
  CheckCircle,
  XCircle
} from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📅 เดือนภาษาไทย (สำหรับ dropdown วันเกิด)
// =====================================================
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
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

// ✅ Interface สำหรับโค้ช (ถ้ามี)
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

export default function NewPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [addressData, setAddressData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  });

  const [formData, setFormData] = useState({
    id_card: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    hospital_number: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    gender: 'male',
    phone: '',
    email: '',
    current_weight: '',
    height: '',
    waist_circumference: '',
    diabetes_type: '',
    blood_sugar: '',
    hba1c_level: '',
    notes: '',
    house_number: '',
    address_line1: '',
    soi: '',
    road: '',
    village_no: '',
    village_name: '',
    hospital_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    occupation: '',
    education_level: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    // ✅ 1. อนุญาตให้ OSM เข้าถึงหน้านี้ได้
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadData(userData);
  }, [router]);

  // ฟังก์ชันโหลดข้อมูลเริ่มต้น
  const loadData = async (userData: any) => {
    setLoading(true);
    try {
      // 1. โหลดข้อมูลโรงพยาบาลของผู้ใช้
      const hospitalInfo = await getUserHospitalInfo(userData.id);
      setUserHospital(hospitalInfo);

      // 2. โหลดโรงพยาบาลที่เกี่ยวข้อง (Logic ใหม่)
      if (hospitalInfo) {
        await loadFilteredHospitals(hospitalInfo);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 2. Logic การกรองโรงพยาบาลแบบใหม่ (Network-based)
  const loadFilteredHospitals = async (currentHospital: UserHospital) => {
    try {
      // ดึงโรงพยาบาลทั้งหมดในระบบมาก่อน
      const allHospitals = await getHospitalsWithHierarchy();
      
      let filteredHospitals: Hospital[] = [];

      if (currentHospital.type === 'main') {
        // กรณีที่ 1: ผู้ใช้อยู่ รพ.แม่ข่าย
        // ให้แสดง รพ.แม่ข่ายของตัวเอง + ลูกข่ายทั้งหมด
        filteredHospitals = allHospitals.filter(h => 
          h.id === currentHospital.id || h.parent_id === currentHospital.id
        );
      } else {
        // กรณีที่ 2: ผู้ใช้อยู่ รพ.ลูกข่าย
        // ให้หา รพ.แม่ข่าย (parent_id) แล้วแสดงแม่ข่ายนั้น + ลูกข่ายทั้งหมดในเครือ
        const parentHospital = allHospitals.find(h => h.id === currentHospital.parent_id);
        
        if (parentHospital) {
          filteredHospitals = allHospitals.filter(h => 
            h.id === parentHospital.id || h.parent_id === parentHospital.id
          );
        } else {
          // กรณีหาแม่ข่ายไม่เจอ (Fallback) แสดงแค่ของตัวเอง
          filteredHospitals = [currentHospital as Hospital];
        }
      }

      // เรียงลำดับ: แม่ข่ายขึ้นก่อน แล้วตามด้วยลูกข่าย
      filteredHospitals.sort((a, b) => {
        if (a.type === 'main' && b.type === 'sub') return -1;
        if (a.type === 'sub' && b.type === 'main') return 1;
        return a.name.localeCompare(b.name);
      });

      setHospitals(filteredHospitals);
    } catch (error) {
      console.error('Error loading filtered hospitals:', error);
    }
  };

  const generatePasswordFromBirthDate = (day: string, month: string, year: string) => {
    if (!day || !month || !year) return '';
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    // ล้าง error เมื่อผู้ใช้เริ่มแก้ไข
    if (validationErrors[name]) {
      setValidationErrors({
        ...validationErrors,
        [name]: ''
      });
    }
  };

  useEffect(() => {
    if (formData.birth_day && formData.birth_month && formData.birth_year) {
      const autoPassword = generatePasswordFromBirthDate(
        formData.birth_day,
        formData.birth_month,
        formData.birth_year
      );
      setFormData(prev => ({
        ...prev,
        password: autoPassword,
        confirmPassword: autoPassword,
      }));
    }
  }, [formData.birth_day, formData.birth_month, formData.birth_year]);

  const handleAddressChange = (data: {
    province: string;
    district: string;
    subdistrict: string;
    postalCode: string;
  }) => {
    setAddressData(data);
  };

  // ✅ Validate ฟอร์มก่อนส่ง
  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};
    if (!formData.id_card) errors.id_card = 'กรุณากรอกเลขบัตรประชาชน';
    else if (formData.id_card.replace(/\D/g, '').length !== 13) errors.id_card = 'เลขบัตรประชาชนต้อง 13 หลัก';

    if (!formData.first_name) errors.first_name = 'กรุณากรอกชื่อ';
    if (!formData.last_name) errors.last_name = 'กรุณากรอกนามสกุล';
    if (!formData.hospital_number) errors.hospital_number = 'กรุณากรอกเลขที่ผู้ป่วย (HN)';
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) errors.birth_date = 'กรุณากรอกวันเกิดให้ครบถ้วน';
    if (!addressData.province || !addressData.district || !addressData.subdistrict) errors.address = 'กรุณาเลือกที่อยู่ให้ครบถ้วน';
    if (!formData.hospital_id) errors.hospital_id = 'กรุณาเลือกโรงพยาบาลสังกัด';
    if (formData.password !== formData.confirmPassword) errors.password = 'รหัสผ่านไม่ตรงกัน';

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      setError(`❌ ${firstError}`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    if (!validateForm()) return;

    setLoading(true);

    try {
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const result = await registerPatient({
        id_card: formData.id_card,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        hospital_number: formData.hospital_number,
        birth_date: birthDate,
        gender: formData.gender,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        current_weight: formData.current_weight ? parseFloat(formData.current_weight) : undefined,
        height: formData.height ? parseFloat(formData.height) : undefined,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : undefined,
        diabetes_type: formData.diabetes_type || undefined,
        blood_sugar: formData.blood_sugar ? parseFloat(formData.blood_sugar) : undefined,
        hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : undefined,
        notes: formData.notes || undefined,
        house_number: formData.house_number || undefined,
        address_line1: formData.address_line1 || undefined,
        soi: formData.soi || undefined,
        road: formData.road || undefined,
        village_no: formData.village_no || undefined,
        village_name: formData.village_name || undefined,
        subdistrict: addressData.subdistrict || undefined,
        district: addressData.district || undefined,
        province: addressData.province || undefined,
        postal_code: addressData.postalCode || undefined,
        hospital_id: formData.hospital_id || undefined,
        emergency_contact_name: formData.emergency_contact_name || undefined,
        emergency_contact_phone: formData.emergency_contact_phone || undefined,
        emergency_contact_relationship: formData.emergency_contact_relationship || undefined,
        occupation: formData.occupation || undefined,
        education_level: formData.education_level || undefined,
        pam_level: 'L0',
        pam_score: 0,
        zone: 'Zero Zone',
        created_by: user?.id,
      });

      setLoading(false);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/patients');
        }, 2000);
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      console.error('❌ Registration error:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการลงทะเบียน');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ลงทะเบียนสำเร็จ!</h2>
          <p className="text-gray-600">กำลังไปยังหน้ารายการผู้ป่วย...</p>
        </div>
      </div>
    );
  }

  if (!user) {
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
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📝 ลงทะเบียนผู้ป่วยใหม่
              </h1>
              <p className="text-gray-600">
                กรอกข้อมูลผู้ป่วยเพื่อสร้างบัญชีและโปรไฟล์
              </p>
            </div>

            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                         user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
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
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
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
                onClick={() => { logout(); router.push('/admin/login'); }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">📋 ข้อมูลการลงทะเบียน</p>
            <ul className="space-y-1">
              <li>
                • ผู้จัดทำสังกัด: <strong>
                  {userHospital?.name || 'ไม่ได้กำหนด'}
                  {userHospital?.type === 'main' ? ' (แม่ข่าย)' : userHospital?.type === 'sub' ? ' (ลูกข่าย)' : ''}
                </strong>
              </li>
              <li>• รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด (dd-mm-yyyy)</li>
              <li>• โรงพยาบาลที่เลือกได้: {hospitals.length} แห่ง (ในเครือข่ายของคุณ)</li>
            </ul>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6 pb-8">
        
        {/* แสดงข้อผิดพลาด */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
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

        {/* 1. ข้อมูลบัญชี */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ข้อมูลบัญชีผู้ใช้
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลขบัตรประชาชน <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="id_card"
                value={formData.id_card}
                onChange={handleChange}
                maxLength={13}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${validationErrors.id_card ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="กรุณากรอกเลขบัตรประชาชน 13 หลัก"
              />
              {validationErrors.id_card && <p className="text-xs text-red-600 mt-1">{validationErrors.id_card}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="password"
                value={formData.password}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                placeholder="ระบบจะสร้างอัตโนมัติ"
              />
              <p className="text-xs text-gray-500 mt-1">💡 รหัสผ่าน = วันเกิด (dd-mm-yyyy)</p>
            </div>
          </div>
        </div>

        {/* 2. ข้อมูลส่วนตัว */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm font-bold">2</span>
            ข้อมูลส่วนตัว
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ <span className="text-red-500">*</span></label>
              <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} required className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 ${validationErrors.first_name ? 'border-red-500' : 'border-gray-300'}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล <span className="text-red-500">*</span></label>
              <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} required className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 ${validationErrors.last_name ? 'border-red-500' : 'border-gray-300'}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HN (เลขที่ผู้ป่วย) <span className="text-red-500">*</span></label>
              <input type="text" name="hospital_number" value={formData.hospital_number} onChange={handleChange} required className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 ${validationErrors.hospital_number ? 'border-red-500' : 'border-gray-300'}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันเกิด <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                <select name="birth_day" value={formData.birth_day} onChange={handleChange} required className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (<option key={day} value={day}>{day}</option>))}
                </select>
                <select name="birth_month" value={formData.birth_month} onChange={handleChange} required className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                  <option value="">เดือน</option>
                  {THAI_MONTHS.map((month, index) => (<option key={index + 1} value={index + 1}>{month}</option>))}
                </select>
                <select name="birth_year" value={formData.birth_year} onChange={handleChange} required className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (<option key={year} value={year}>{year}</option>))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เพศ <span className="text-red-500">*</span></label>
              <select name="gender" value={formData.gender} onChange={handleChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>

        {/* 3. ข้อมูลสุขภาพ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">3</span>
            ข้อมูลสุขภาพ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนัก (kg)</label><input type="number" name="current_weight" value={formData.current_weight} onChange={handleChange} step="0.1" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ส่วนสูง (cm)</label><input type="number" name="height" value={formData.height} onChange={handleChange} step="0.1" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (cm)</label><input type="number" name="waist_circumference" value={formData.waist_circumference} onChange={handleChange} step="0.1" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ประเภทเบาหวาน</label>
              <select name="diabetes_type" value={formData.diabetes_type} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                <option value="">-- เลือก --</option>
                <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>
                <option value="เบาหวาน">เบาหวาน</option>
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ค่าน้ำตาลในเลือด (mg/dL)</label><input type="number" name="blood_sugar" value={formData.blood_sugar} onChange={handleChange} step="0.1" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ค่า HbA1c ล่าสุด</label><input type="number" name="hba1c_level" value={formData.hba1c_level} onChange={handleChange} step="0.1" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500" /></div>
          </div>
        </div>

        {/* 4. ที่อยู่และโรงพยาบาล */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            ที่อยู่และโรงพยาบาลสังกัด
          </h2>
          
          {/* ✅ Dropdown เลือกโรงพยาบาล (Logic ใหม่) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">🏥 โรงพยาบาลสังกัด <span className="text-red-500">*</span></label>
            <select
              name="hospital_id"
              value={formData.hospital_id}
              onChange={handleChange}
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 max-h-64 overflow-y-auto ${validationErrors.hospital_id ? 'border-red-500' : 'border-gray-300'}`}
            >
              <option value="">-- เลือกโรงพยาบาล --</option>
              {/* แสดงกลุ่มแม่ข่าย */}
              {hospitals.filter(h => h.type === 'main').map((hospital) => (
                <optgroup key={hospital.id} label={`🏥 ${hospital.name} (แม่ข่าย)`}>
                  <option value={hospital.id}>
                    └ {hospital.name} ({hospital.code})
                  </option>
                  {/* แสดงลูกข่ายในเครือ */}
                  {hospitals.filter(sub => sub.parent_id === hospital.id).map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {'   '}└─ {sub.name} ({sub.code})
                    </option>
                  ))}
                </optgroup>
              ))}
              {/* กรณีที่ไม่มีแม่ข่ายในลิสต์ (Fallback) */}
              {hospitals.filter(h => h.type === 'sub').map((sub) => (
                 <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 แสดงเฉพาะโรงพยาบาลในเครือข่ายของคุณ (แม่ข่าย + ลูกข่าย)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><div className="grid grid-cols-3 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">เลขที่</label><input type="text" name="house_number" value={formData.house_number} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div><div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่เพิ่มเติม</label><input type="text" name="address_line1" value={formData.address_line1} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">หมู่ที่/ชุมชน</label><input type="text" name="village_no" value={formData.village_no} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">หมู่บ้าน</label><input type="text" name="village_name" value={formData.village_name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ซอย</label><input type="text" name="soi" value={formData.soi} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ถนน</label><input type="text" name="road" value={formData.road} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500" /></div>
            <div className="md:col-span-2"><ThaiAddressSelector onAddressChange={handleAddressChange} /></div>
          </div>
        </div>

        {/* 5. ผู้ติดต่อฉุกเฉิน */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">5</span>
            ผู้ติดต่อฉุกเฉิน
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ติดต่อ</label><input type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label><input type="tel" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" /></div>
            <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-700 mb-1">ความสัมพันธ์</label><input type="text" name="emergency_contact_relationship" value={formData.emergency_contact_relationship} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500" /></div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />กำลังลงทะเบียน...</>) : (<><UserPlus className="w-5 h-5" />ลงทะเบียนผู้ป่วย</>)}
          </button>
          <button type="button" onClick={() => router.back()} className="px-6 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}