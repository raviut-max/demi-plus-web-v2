// app/admin/patients/new-demo/page.tsx
// ✅ สำหรับลงทะเบียนผู้ป่วยเดโม (Demo Patient)
// ✅ การแก้ไขจากหน้าผู้ป่วยปกติ:
//    1. ✅ สร้างเลขบัตรประชาชนอัตโนมัติ (ขึ้นต้นด้วย D)
//    2. ✅ สร้าง HN อัตโนมัติ (ขึ้นต้นด้วย DEMO-)
//    3. ✅ ลบฟิลด์ diabetes_type, blood_sugar, hba1c_level
//    4. ✅ เพิ่มฟิลด์ is_demo, demo_group_id, demo_scenario, demo_expires_at


'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  getDemoGroups,
  generateDemoIdCard,
  generateDemoHN,
  registerDemoPatient
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
  XCircle,
  Sparkles,
  Database
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

// ✅ Interface สำหรับโค้ช
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

// ✅ Interface สำหรับ Demo Groups
interface DemoGroup {
  id: string;
  group_code: string;
  group_name: string;
  group_name_th: string;
  description: string;
  group_type: 'training' | 'testing' | 'showcase' | 'workshop';
  max_participants: number;
  current_participants: number;
}

export default function NewDemoPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [demoGroups, setDemoGroups] = useState<DemoGroup[]>([]);
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
    // ไม่ใช้ id_card (สร้างอัตโนมัติ)
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    // ไม่ใช้ hospital_number (สร้างอัตโนมัติ)
    birth_day: '',
    birth_month: '',
    birth_year: '',
    gender: 'female',
    phone: '',
    email: '',
    current_weight: '',
    height: '',
    waist_circumference: '',
    // ❌ ลบ diabetes_type, blood_sugar, hba1c_level
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
    coach_id: '',
    // ✅ ฟิลด์เฉพาะ Demo
    demo_group_id: '',
    demo_scenario: '',
    demo_expires_days: '30',
  });

  const [generatedData, setGeneratedData] = useState({
    id_card: '',
    hospital_number: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    
    // ✅ เฉพาะ admin, doctor, helper เท่านั้นที่สร้าง Demo ได้
    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง (เฉพาะ Admin, Doctor, Helper)');
      router.push('/admin/login');
      return;
    }
    
    console.log('👤 [NewDemoPatient] User:', userData);
    setUser(userData);
    
    // โหลดข้อมูลโรงพยาบาลของผู้ใช้ และ ข้อมูลเครือข่าย
    loadUserHospital(userData.id);
    loadNetworkData(userData.id);
    loadDemoGroups();
    generateDemoData();
  }, [router]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================
  
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  const loadNetworkData = async (userId: string) => {
    try {
      setLoading(true);
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
      const networkHospitalIds = networkHospitals.map(h => h.id);
      await loadCoaches(networkHospitalIds);
    } catch (error) {
      console.error('❌ [loadNetworkData] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCoaches = async (hospitalIds: string[]) => {
    try {
      console.log('👨‍⚕️ [loadCoaches] Loading coaches for hospitals:', hospitalIds);
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
      console.log('👨‍⚕️ [loadCoaches] Loaded:', allCoaches.length, 'coaches');
    } catch (error) {
      console.error('❌ [loadCoaches] Error:', error);
      setError('⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูลโค้ช');
    }
  };

  const loadDemoGroups = async () => {
    try {
      const groups = await getDemoGroups();
      setDemoGroups(groups);
      console.log('📋 [loadDemoGroups] Loaded:', groups.length, 'demo groups');
    } catch (error) {
      console.error('❌ [loadDemoGroups] Error:', error);
    }
  };

  const generateDemoData = async () => {
    try {
      const idCard = await generateDemoIdCard();
      const hn = await generateDemoHN();
      setGeneratedData({
        id_card: idCard,
        hospital_number: hn,
      });
    } catch (error) {
      console.error('❌ [generateDemoData] Error:', error);
    }
  };

  const handleHospitalChange = (hospitalId: string) => {
    console.log('🏥 [handleHospitalChange] Selected hospital:', hospitalId);
    setFormData({ ...formData, hospital_id: hospitalId });
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
    
    // ✅ ล้าง error เมื่อผู้ใช้เริ่มแก้ไข
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

  // ✅ Validate ฟอร์มก่อนส่ง
  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};
    
    // ✅ ตรวจสอบชื่อ-นามสกุล
    if (!formData.first_name) errors.first_name = 'กรุณากรอกชื่อ';
    if (!formData.last_name) errors.last_name = 'กรุณากรอกนามสกุล';
    
    // ✅ ตรวจสอบวันเกิด
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      errors.birth_date = 'กรุณากรอกวันเกิดให้ครบถ้วน';
    }
    
    // ✅ ตรวจสอบที่อยู่
    if (!addressData.province || !addressData.district || !addressData.subdistrict) {
      errors.address = 'กรุณาเลือกที่อยู่ให้ครบถ้วน';
    }
    
    // ✅ ตรวจสอบโรงพยาบาล
    if (!formData.hospital_id) {
      errors.hospital_id = 'กรุณาเลือกโรงพยาบาลสังกัด';
    }
    
    // ✅ ตรวจสอบกลุ่ม Demo
    if (!formData.demo_group_id) {
      errors.demo_group_id = 'กรุณาเลือกกลุ่ม Demo';
    }
    
    // ✅ ตรวจสอบรหัสผ่าน
    if (formData.password !== formData.confirmPassword) {
      errors.password = 'รหัสผ่านไม่ตรงกัน';
    }
    
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
    
    console.log('📝 [handleSubmit] Demo Patient form submitted');
    console.log('📋 [handleSubmit] Form data:', formData);
    console.log('🔢 [handleSubmit] Generated data:', generatedData);
    
    // ✅ Validate ฟอร์มก่อน
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;
      
      const result = await registerDemoPatient({
        id_card: generatedData.id_card,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        hospital_number: generatedData.hospital_number,
        birth_date: birthDate,
        gender: formData.gender,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        current_weight: formData.current_weight ? parseFloat(formData.current_weight) : undefined,
        height: formData.height ? parseFloat(formData.height) : undefined,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : undefined,
        coach_id: formData.coach_id || undefined,
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
        demo_group_id: formData.demo_group_id || undefined,
        demo_scenario: formData.demo_scenario || undefined,
        demo_expires_days: parseInt(formData.demo_expires_days) || 30,
        pam_level: 'L0',
        pam_score: 0,
        zone: 'Zero Zone',
        created_by: user?.id,
      });
      
      setLoading(false);
      
      if (result.success) {
        console.log('✅ [handleSubmit] Demo patient registered successfully');
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/patients?filter=demo');
        }, 2000);
      } else {
        console.error('❌ [handleSubmit] Registration failed:', result.error);
        let thaiError = 'เกิดข้อผิดพลาดในการลงทะเบียน';
        
        if (result.error?.includes('23505') || result.error?.includes('duplicate key')) {
          if (result.error?.includes('id_card')) {
            thaiError = '❌ เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว กรุณาลองใหม่อีกครั้ง';
          } else if (result.error?.includes('hospital_number')) {
            thaiError = '❌ เลข HN นี้มีอยู่ในระบบแล้ว กรุณาลองใหม่อีกครั้ง';
          } else {
            thaiError = '❌ ข้อมูลนี้ซ้ำกับที่มีอยู่ในระบบ กรุณาตรวจสอบ';
          }
        } else if (result.error?.includes('23503')) {
          thaiError = '❌ ข้อมูลที่อ้างอิงไม่มีในระบบ กรุณาตรวจสอบ';
        }
        
        setError(thaiError);
      }
    } catch (err: any) {
      console.error('❌ [handleSubmit] Registration error:', err);
      let thaiError = 'เกิดข้อผิดพลาดในการลงทะเบียน';
      
      if (err.message?.includes('23505') || err.message?.includes('duplicate key')) {
        if (err.message?.includes('id_card')) {
          thaiError = '❌ เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว';
        } else if (err.message?.includes('hospital_number')) {
          thaiError = '❌ เลข HN นี้มีอยู่ในระบบแล้ว';
        } else {
          thaiError = '❌ ข้อมูลซ้ำกับที่มีอยู่ในระบบ';
        }
      } else if (err.message?.includes('23503')) {
        thaiError = '❌ ข้อมูลที่อ้างอิงไม่มีในระบบ';
      } else if (err.message?.includes('22007')) {
        thaiError = '❌ รูปแบบวันที่ไม่ถูกต้อง';
      } else if (err.message?.includes('22001')) {
        thaiError = '❌ ข้อมูลยาวเกินไป';
      }
      
      setError(thaiError);
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ลงทะเบียนผู้ป่วยเดโมสำเร็จ!</h2>
          <p className="text-gray-600">กำลังไปยังหน้ารายการผู้ป่วยเดโม...</p>
          <p className="text-sm text-gray-500 mt-2">กรุณารอสักครู่</p>
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

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50">
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
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-800">
                  🧪 ลงทะเบียนผู้ป่วยเดโมใหม่
                </h1>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                  DEMO MODE
                </span>
              </div>
              <p className="text-gray-600">
                สร้างข้อมูลผู้ป่วยจำลองสำหรับการฝึกซ้อมหรือทดสอบระบบ
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-purple-50 to-pink-50 px-4 py-3 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-purple-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-purple-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
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
                onClick={handleLogout}
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
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-purple-800">
            <p className="font-semibold mb-1">🎯 ข้อมูลสำคัญ - ผู้ป่วยเดโม</p>
            <ul className="space-y-1">
              <li>• <strong>เลขบัตรประชาชน:</strong> ระบบสร้างอัตโนมัติ (ขึ้นต้นด้วย D) - {generatedData.id_card}</li>
              <li>• <strong>HN:</strong> ระบบสร้างอัตโนมัติ (DEMO-XXXXXX) - {generatedData.hospital_number}</li>
              <li>• <strong>รหัสผ่าน:</strong> สร้างอัตโนมัติจากวันเกิด (dd-mm-yyyy)</li>
              <li>• <strong>ข้อมูลนี้จะไม่ถูกนับในสถิติโรงพยาบาลจริง</strong></li>
            </ul>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6 pb-8">
        {/* ✅ แสดงข้อผิดพลาด (ถ้ามี) */}
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

        {/* 1. ข้อมูลบัญชี (Auto-generated) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-purple-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">1</span>
            ข้อมูลบัญชีผู้ใช้ (สร้างอัตโนมัติ)
            <Database className="w-4 h-4 text-purple-500" />
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เลขบัตรประชาชน (Auto)
              </label>
              <input
                type="text"
                value={generatedData.id_card}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-purple-50 cursor-not-allowed font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 ขึ้นต้นด้วย D (Demo) 13 หลัก
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HN (Auto)
              </label>
              <input
                type="text"
                value={generatedData.hospital_number}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-purple-50 cursor-not-allowed font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 DEMO-XXXXXX
              </p>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                placeholder="ระบบจะสร้างอัตโนมัติ"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 รหัสผ่านเริ่มต้น: วันเกิดในรูปแบบ dd-mm-yyyy (ปี พ.ศ.)
              </p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  validationErrors.first_name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="ชื่อ"
              />
              {validationErrors.first_name && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.first_name}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                นามสกุล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  validationErrors.last_name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="นามสกุล"
              />
              {validationErrors.last_name && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.last_name}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันเกิด <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  name="birth_day"
                  value={formData.birth_day}
                  onChange={handleChange}
                  required
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                >
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                
                <select
                  name="birth_month"
                  value={formData.birth_month}
                  onChange={handleChange}
                  required
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                >
                  <option value="">เดือน</option>
                  {THAI_MONTHS.map((month, index) => (
                    <option key={index + 1} value={index + 1}>{month}</option>
                  ))}
                </select>
                
                <select
                  name="birth_year"
                  value={formData.birth_year}
                  onChange={handleChange}
                  required
                  className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                >
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              {validationErrors.birth_date && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.birth_date}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เพศ <span className="text-red-500">*</span>
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="male">ชาย</option>
                <option value="female">หญิง</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0812345678"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="email@example.com"
              />
            </div>
          </div>
        </div>

        {/* 3. ข้อมูลสุขภาพ (ไม่มี diabetes_type, blood_sugar, hba1c_level) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">3</span>
            ข้อมูลสุขภาพ
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                น้ำหนัก (kg)
              </label>
              <input
                type="number"
                name="current_weight"
                value={formData.current_weight}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="75.5"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ส่วนสูง (cm)
              </label>
              <input
                type="number"
                name="height"
                value={formData.height}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="170"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รอบเอว (cm)
              </label>
              <input
                type="number"
                name="waist_circumference"
                value={formData.waist_circumference}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="92"
              />
            </div>
            
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมายเหตุ (คำแนะนำเพิ่มเติม)
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="เช่น แพ้ถั่ว แพ้นม เป็นต้น"
              />
            </div>
          </div>
        </div>

        {/* 4. ที่อยู่และโรงพยาบาลสังกัด */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            ที่อยู่และโรงพยาบาลสังกัด
          </h2>
          
          {/* ✅ Dropdown เลือกโรงพยาบาล */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              🏥 โรงพยาบาลสังกัด <span className="text-red-500">*</span>
            </label>
            <select
              name="hospital_id"
              value={formData.hospital_id}
              onChange={(e) => handleHospitalChange(e.target.value)}
              required
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent max-h-64 overflow-y-auto ${
                validationErrors.hospital_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">-- เลือกโรงพยาบาล --</option>
              {mainHospitals.map((hospital) => (
                <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
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
            {validationErrors.hospital_id && (
              <p className="text-xs text-red-600 mt-1">💡 {validationErrors.hospital_id}</p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เลขที่
                  </label>
                  <input
                    type="text"
                    name="house_number"
                    value={formData.house_number}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="123"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ที่อยู่เพิ่มเติม (ถ้ามี)
                  </label>
                  <input
                    type="text"
                    name="address_line1"
                    value={formData.address_line1}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="เช่น อพาร์ทเมนท์, อาคาร, ชั้น"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมู่ที่/ชุมชน
              </label>
              <input
                type="text"
                name="village_no"
                value={formData.village_no}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="หมู่ 5"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมู่บ้าน
              </label>
              <input
                type="text"
                name="village_name"
                value={formData.village_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="หมู่บ้านสุขใจ"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ซอย
              </label>
              <input
                type="text"
                name="soi"
                value={formData.soi}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="ซอย 5"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ถนน
              </label>
              <input
                type="text"
                name="road"
                value={formData.road}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="ถนนสุขุมวิท"
              />
            </div>
            
            <div className="md:col-span-2">
              <ThaiAddressSelector 
                onAddressChange={handleAddressChange}
              />
              {validationErrors.address && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.address}</p>
              )}
            </div>
          </div>
        </div>

        {/* 5. ผู้ติดต่อฉุกเฉิน */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">5</span>
            ผู้ติดต่อฉุกเฉิน
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อผู้ติดต่อ
              </label>
              <input
                type="text"
                name="emergency_contact_name"
                value={formData.emergency_contact_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="ชื่อ-นามสกุล"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                name="emergency_contact_phone"
                value={formData.emergency_contact_phone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="0812345678"
              />
            </div>
            
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ความสัมพันธ์
              </label>
              <input
                type="text"
                name="emergency_contact_relationship"
                value={formData.emergency_contact_relationship}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="เช่น สามี, ภรรยา, ลูก"
              />
            </div>
          </div>
        </div>

        {/* 6. กำหนดโค้ช */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-bold">6</span>
            กำหนดโค้ช/หมอผู้ดูแล
          </h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โค้ช/หมอผู้ดูแล
            </label>
            <select
              name="coach_id"
              value={formData.coach_id}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-96 overflow-y-auto"
            >
              <option value="">-- เลือกโค้ช --</option>
              {coaches.map((coach) => {
                const hospitalName = coach.users?.hospitals?.name || 'ไม่มีโรงพยาบาล';
                const specialization = coach.specialization_th || 'ไม่ระบุ';
                return (
                  <option key={coach.id} value={coach.user_id}>
                    {coach.full_name_th} | {specialization} | {hospitalName}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              👨⚕️ แสดงโค้ช: {coaches.length} คน
            </p>
          </div>
        </div>

        {/* 7. การตั้งค่า Demo (ใหม่) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-purple-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">7</span>
            การตั้งค่าผู้ป่วยเดโม
            <Sparkles className="w-4 h-4 text-purple-500" />
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                กลุ่ม Demo <span className="text-red-500">*</span>
              </label>
              <select
                name="demo_group_id"
                value={formData.demo_group_id}
                onChange={handleChange}
                required
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                  validationErrors.demo_group_id ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">-- เลือกกลุ่ม Demo --</option>
                {demoGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.group_name_th} ({group.group_type})
                  </option>
                ))}
              </select>
              {validationErrors.demo_group_id && (
                <p className="text-xs text-red-600 mt-1">💡 {validationErrors.demo_group_id}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                💡 ใช้สำหรับจัดกลุ่มผู้ป่วยเดโม
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                สถานการณ์ Demo
              </label>
              <select
                name="demo_scenario"
                value={formData.demo_scenario}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">-- ไม่ระบุ --</option>
                <option value="NEW_DM">เพิ่งวินิจฉัยใหม่</option>
                <option value="NON_COMPLIANT">คนไข้ไม่ร่วมมือ</option>
                <option value="WELL_CONTROLLED">ควบคุมได้ดี</option>
                <option value="ELDERLY_COMPLEX">ผู้สูงอายุที่มีโรคแทรกซ้อน</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                💡 สถานการณ์จำลองสำหรับฝึกหัด
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันหมดอายุ (วัน)
              </label>
              <input
                type="number"
                name="demo_expires_days"
                value={formData.demo_expires_days}
                onChange={handleChange}
                min="1"
                max="365"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="30"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 ข้อมูลจะถูกลบอัตโนมัติหลังจากนี้ (ค่าเริ่มต้น: 30 วัน)
              </p>
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังลงทะเบียนผู้ป่วยเดโม...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                ลงทะเบียนผู้ป่วยเดโม
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}