// app/admin/patients/new/page.tsx
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แสดงข้อมูลผู้ลงทะเบียน (ชื่อ, โรงพยาบาล)
//    2. ✅ แสดงโรงพยาบาลใน dropdown โค้ช
//    3. ✅ ข้อความ error เป็นภาษาไทยที่เข้าใจง่าย
//    4. ✅ แก้ไข numeric overflow และ validation
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  registerPatient,
  getCoaches,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
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
  Calendar,
  Clock
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

export default function NewPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [villages, setVillages] = useState<any[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
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
    coach_id: '',
    village_id: '',
  });

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
    console.log('👤 [NewPatient] User:', userData);
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadCoaches();
  }, [router]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================
  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      console.log('🏥 [loadUserHospital] Loading for user:', userId);
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ [loadUserHospital] User hospital:', hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้ (Super Admin vs Hospital Admin)
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🔍 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      console.log('🏥 [loadAccessibleHospitals] Hospital IDs:', ids);
      
      // ✅ โหลดรายการโรงพยาบาลทั้งหมด (แบบมีลำดับชั้น)
      const allHospitals = await getHospitalsWithHierarchy();
      
      // ✅ กรองโรงพยาบาลตามสิทธิ์
      let filteredHospitals = allHospitals;
      if (ids.length > 0 && !isSuperAdmin(user)) {
        console.log('🔒 [loadAccessibleHospitals] Hospital Admin - filtering hospitals');
        filteredHospitals = allHospitals.filter(h => ids.includes(h.id));
      } else {
        console.log('👑 [loadAccessibleHospitals] Super Admin - showing all hospitals');
      }
      
      setHospitals(filteredHospitals);
      console.log('🏥 [loadAccessibleHospitals] Filtered hospitals:', filteredHospitals.length);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    }
  };

  // ✅ โหลดโค้ช (กรองตามโรงพยาบาลที่เข้าถึงได้)
  const loadCoaches = async () => {
    try {
      console.log('👨‍⚕️ [loadCoaches] Loading coaches...');
      const allCoaches = await getCoaches();
      
      // ✅ กรองโค้ชตามโรงพยาบาลที่เข้าถึงได้
      let filteredCoaches = allCoaches;
      if (accessibleHospitalIds.length > 0 && !isSuperAdmin(user)) {
        console.log('🔒 [loadCoaches] Hospital Admin - filtering coaches');
        filteredCoaches = allCoaches.filter(coach => 
          coach.hospital_id && accessibleHospitalIds.includes(coach.hospital_id)
        );
      } else {
        console.log('👑 [loadCoaches] Super Admin - showing all coaches');
      }
      
      setCoaches(filteredCoaches);
      console.log('👨‍⚕️ [loadCoaches] Filtered coaches:', filteredCoaches.length);
    } catch (error) {
      console.error('❌ [loadCoaches] Error:', error);
    }
  };

  const handleHospitalChange = (hospitalId: string) => {
    console.log('🏥 [handleHospitalChange] Selected hospital:', hospitalId);
    setFormData({ ...formData, hospital_id: hospitalId, village_id: '' });
    
    const loadVillages = async () => {
      try {
        const { data, error } = await supabase
          .from('villages')
          .select('*')
          .eq('hospital_id', hospitalId)
          .eq('is_active', true)
          .order('village_no');
        
        if (error) throw error;
        setVillages(data || []);
        console.log('🏘️ [loadVillages] Loaded:', data?.length || 0, 'villages');
      } catch (error) {
        console.error('❌ [loadVillages] Error:', error);
      }
    };

    loadVillages();
  };

  const generatePasswordFromBirthDate = (day: string, month: string, year: string) => {
    if (!day || !month || !year) return '';
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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

  // ✅ ฟังก์ชันจัดกลุ่มโรงพยาบาล (แม่ข่าย → ลูกข่าย)
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

  // ✅ ฟังก์ชันแปลง error messages ให้เข้าใจง่าย
  const getFriendlyErrorMessage = (error: any): string => {
    if (!error) return '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    
    // ตรวจสอบ constraint violations
    if (error.message?.includes('profiles_current_weight_check')) {
      return '❌ น้ำหนักไม่ถูกต้อง\n\n💡 กรุณากรอกน้ำหนักในช่วง 30-200 กิโลกรัม\n- ค่าที่กรอกต้องอยู่ระหว่าง 30-200 กก.';
    }
    
    if (error.message?.includes('profiles_height_check')) {
      return '❌ ส่วนสูงไม่ถูกต้อง\n\n💡 กรุณากรอกส่วนสูงในช่วง 100-250 เซนติเมตร\n- ค่าที่กรอกต้องอยู่ระหว่าง 100-250 ซม.';
    }
    
    if (error.message?.includes('profiles_waist_circumference_check')) {
      return '❌ รอบเอวไม่ถูกต้อง\n\n💡 กรุณากรอกรอบเอวในช่วง 26-200 เซนติเมตร\n- ค่าที่กรอกต้องอยู่ระหว่าง 26-200 ซม.';
    }
    
    if (error.message?.includes('profiles_diabetes_type_check')) {
      return '❌ ประเภทเบาหวานไม่ถูกต้อง\n\n💡 กรุณาเลือกประเภทเบาหวานจากเมนู\n- ต้องเป็น: กลุ่มเสี่ยง หรือ เบาหวาน เท่านั้น';
    }
    
    if (error.message?.includes('profiles_gender_check')) {
      return '❌ เพศไม่ถูกต้อง\n\n💡 กรุณาเลือกเพศจากเมนู\n- ต้องเป็น: ชาย หรือ หญิง เท่านั้น';
    }
    
    if (error.message?.includes('numeric field overflow')) {
      return '❌ ข้อมูลตัวเลขมีค่ามากเกินกำหนด\n\n💡 กรุณาตรวจสอบค่าที่กรอก\n- ค่าตัวเลขบางตัวมีจำนวนหลักมากเกินไป\n- กรุณาลองกรอกใหม่อีกครั้ง';
    }
    
    if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      return '❌ มีข้อมูลซ้ำในระบบ\n\n💡 เลขบัตรประชาชนหรือ HN นี้มีอยู่ในระบบแล้ว\n- กรุณาตรวจสอบเลขบัตรประชาชน 13 หลัก\n- หรือตรวจสอบเลข HN (Hospital Number)';
    }
    
    if (error.message?.includes('id_card')) {
      return '❌ เลขบัตรประชาชนไม่ถูกต้อง\n\n💡 กรุณากรอกเลขบัตรประชาชน 13 หลัก\n- ต้องเป็นตัวเลขเท่านั้น\n- ไม่มีช่องว่างหรือตัวอักษร';
    }
    
    if (error.message?.includes('hospital_number')) {
      return '❌ เลข HN (Hospital Number) ไม่ถูกต้อง\n\n💡 กรุณาตรวจสอบเลข HN\n- เลข HN นี้มีอยู่ในระบบแล้ว\n- หรือรูปแบบไม่ถูกต้อง';
    }
    
    // Default error
    return `❌ เกิดข้อผิดพลาด: ${error.message}\n\n💡 กรุณาตรวจสอบข้อมูลที่กรอกหรือติดต่อผู้ดูแลระบบ`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    console.log('📝 [handleSubmit] Form submitted');
    console.log('📋 [handleSubmit] Form data:', formData);
    console.log('🏥 [handleSubmit] Accessible hospitals:', accessibleHospitalIds);
    console.log('👑 [handleSubmit] Is Super Admin:', isSuperAdmin(user));

    // ✅ Validation พื้นฐาน
    if (formData.password !== formData.confirmPassword) {
      setError('❌ รหัสผ่านไม่ตรงกัน\n\n💡 กรุณาตรวจสอบรหัสผ่านและยืนยันรหัสผ่าน\n- รหัสผ่านทั้งสองช่องต้องตรงกัน');
      return;
    }

    if (formData.id_card.length !== 13) {
      setError('❌ เลขบัตรประชาชนต้อง 13 หลัก\n\n💡 กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก\n- ตรวจสอบว่าไม่มีช่องว่างหรือตัวอักษร');
      return;
    }

    if (!formData.first_name || !formData.last_name || !formData.hospital_number) {
      setError('❌ กรุณากรอกข้อมูลจำเป็นให้ครบถ้วน\n\n💡 ข้อมูลที่ต้องกรอก:\n- ชื่อ\n- นามสกุล\n- HN (Hospital Number)');
      return;
    }

    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      setError('❌ กรุณากรอกวันเกิดให้ครบถ้วน\n\n💡 กรุณาเลือก\n- วัน\n- เดือน\n- ปี พ.ศ.');
      return;
    }

    if (!addressData.province || !addressData.district || !addressData.subdistrict) {
      setError('❌ กรุณาเลือกที่อยู่ให้ครบถ้วน\n\n💡 กรุณาเลือก\n- จังหวัด\n- อำเภอ/เขต\n- ตำบล');
      return;
    }

    // ✅ ตรวจสอบว่าเลือกโรงพยาบาลแล้ว
    if (!formData.hospital_id) {
      setError('❌ กรุณาเลือกโรงพยาบาลสังกัด\n\n💡 กรุณาเลือกรโรงพยาบาลที่ผู้ป่วยจะสังกัด\n- เลือกรายการจาก dropdown ด้านบน');
      return;
    }

    // ✅ ตรวจสอบสิทธิ์การเลือกโรงพยาบาล (Hospital Admin ต้องเลือกใน scope ของตัวเอง)
    if (accessibleHospitalIds.length > 0 && !isSuperAdmin(user)) {
      if (!accessibleHospitalIds.includes(formData.hospital_id)) {
        setError('❌ คุณไม่มีสิทธิ์เลือกโรงพยาบาลนี้\n\n💡 กรุณาเลือกโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง\n- ติดต่อผู้ดูแลระบบหากคุณต้องการเพิ่มสิทธิ์');
        return;
      }
    }

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
        coach_id: formData.coach_id || undefined,
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
        
        // ✅ บันทึก hospital_id
        hospital_id: formData.hospital_id || undefined,
        
        emergency_contact_name: formData.emergency_contact_name || undefined,
        emergency_contact_phone: formData.emergency_contact_phone || undefined,
        emergency_contact_relationship: formData.emergency_contact_relationship || undefined,
        occupation: formData.occupation || undefined,
        education_level: formData.education_level || undefined,
        
        village_id: formData.village_id || undefined,
        
        pam_level: 'L0',
        pam_score: 0,
        zone: 'Zero Zone',
        
        created_by: user?.id,
      });

      setLoading(false);

      if (result.success) {
        console.log('✅ [handleSubmit] Patient registered successfully');
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/patients');
        }, 2000);
      } else {
        console.error('❌ [handleSubmit] Registration failed:', result.error);
        const friendlyError = getFriendlyErrorMessage(result.error);
        setError(friendlyError);
      }
    } catch (err: any) {
      console.error('❌ [handleSubmit] Registration error:', err);
      const friendlyError = getFriendlyErrorMessage(err);
      setError(friendlyError);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ลงทะเบียนสำเร็จ!</h2>
          <p className="text-gray-600">กำลังไปยังหน้ารายการผู้ป่วย...</p>
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
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
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
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>

                  {/* ✅ แสดงข้อมูลโรงพยาบาล */}
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    {/* ✅ Badge ประเภทโรงพยาบาล */}
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

                      {/* ✅ แสดงแม่ข่าย (ถ้าเป็นลูกข่าย) */}
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
                onClick={() => {
                  logout();
                  router.push('/admin/login');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Info Banner - แสดงข้อมูลผู้ลงทะเบียน */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <UserCheck className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-2">
                👤 ผู้ลงทะเบียน
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-blue-700">
                    <span className="font-medium">ชื่อ:</span> {user?.full_name_th || 'ผู้ดูแลระบบ'}
                  </p>
                  <p className="text-blue-600">
                    <span className="font-medium">บทบาท:</span> {user?.role === 'admin' ? 'ผู้ดูแลระบบ' : user?.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                  </p>
                </div>
                {userHospital && (
                  <div>
                    <p className="text-blue-700">
                      <span className="font-medium">โรงพยาบาล:</span> {userHospital.name} ({userHospital.code})
                    </p>
                    <p className="text-blue-600">
                      <span className="font-medium">ประเภท:</span> {userHospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'}
                    </p>
                  </div>
                )}
                <div className="md:col-span-2 flex items-center gap-4 text-blue-600 mt-2 pt-2 border-t border-blue-200">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner - แสดงโรงพยาบาลที่ผู้ป่วยจะสังกัด */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <div className="text-sm text-indigo-800">
            <p className="font-semibold mb-1">📋 ข้อมูลการลงทะเบียน</p>
            <ul className="space-y-1">
              <li>• ผู้ป่วยจะสังกัดโรงพยาบาล: <strong>{userHospital?.name || 'ไม่ได้กำหนด'}</strong></li>
              <li>• รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด (dd-mm-yyyy)</li>
              <li>• โรงพยาบาลที่เลือกได้: {hospitals.length} แห่ง</li>
              <li>• โค้ชที่เลือกได้: {coaches.length} คน</li>
              {accessibleHospitalIds.length > 0 && !isSuperAdmin(user) && (
                <li className="text-indigo-600">• 🔒 แสดงเฉพาะโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง</li>
              )}
              {isSuperAdmin(user) && (
                <li className="text-purple-600">• 👑 Super Admin - เข้าถึงได้ทั้งหมด</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">
        
        {/* ✅ Error Message - แสดงแบบสวยงาม */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800 mb-2">
                  ⚠️ พบข้อผิดพลาดในการลงทะเบียน
                </h3>
                <div className="text-red-700 text-sm whitespace-pre-line">
                  {error}
                </div>
              </div>
            </div>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เลขบัตรประชาชน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="id_card"
                value={formData.id_card}
                onChange={handleChange}
                maxLength={13}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="กรุณากรอกเลขบัตรประชาชน 13 หลัก"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 กรอกเลขบัตรประชาชน 13 หลัก (ไม่มีช่องว่าง)
              </p>
            </div>

            <div>
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

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                placeholder="ระบบจะสร้างอัตโนมัติ"
              />
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="ชื่อ"
              />
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="นามสกุล"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HN (Hospital Number) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="hospital_number"
                value={formData.hospital_number}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="HN-001"
              />
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

            <div className="md:col-span-2">
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

        {/* 3. ข้อมูลสุขภาพ */}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ประเภทเบาหวาน
              </label>
              <select
                name="diabetes_type"
                value={formData.diabetes_type}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">-- เลือก --</option>
                <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>
                <option value="เบาหวาน">เบาหวาน</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ค่าน้ำตาลในเลือด (mg/dL)
              </label>
              <input
                type="number"
                name="blood_sugar"
                value={formData.blood_sugar}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="เช่น 110"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ค่า HbA1c ล่าสุด
              </label>
              <input
                type="number"
                name="hba1c_level"
                value={formData.hba1c_level}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="7.5"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมายเหตุ (คำแนะนำเพิ่มเติม)
              </label>
              <input
                type="text"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="เช่น แพ้ถั่ว แพ้นม เป็นต้น"
              />
            </div>
          </div>
        </div>

        {/* 4. ที่อยู่และโรงพยาบาล */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            ที่อยู่และโรงพยาบาลสังกัด
          </h2>
        
          {/* ✅ Dropdown เลือกโรงพยาบาล - แบบ Hierarchical (กรองตามสิทธิ์) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              🏥 โรงพยาบาลสังกัด <span className="text-red-500">*</span>
            </label>
            <select
              name="hospital_id"
              value={formData.hospital_id}
              onChange={(e) => handleHospitalChange(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent max-h-64 overflow-y-auto"
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
              💡 เลือกโรงพยาบาลที่ผู้ป่วยสังกัด (แม่ข่ายหรือลูกข่าย)
            </p>
            {hospitals.length === 0 && (
              <p className="text-xs text-orange-500 mt-1">
                ⚠️ ยังไม่มีข้อมูลโรงพยาบาลในระบบ
              </p>
            )}
            {accessibleHospitalIds.length > 0 && !isSuperAdmin(user) && (
              <p className="text-xs text-blue-600 mt-1">
                🔒 แสดงโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง ({hospitals.length} แห่ง)
              </p>
            )}
            {isSuperAdmin(user) && (
              <p className="text-xs text-purple-600 mt-1">
                👑 Super Admin - แสดงโรงพยาบาลทั้งหมด ({hospitals.length} แห่ง)
              </p>
            )}
          </div>
        
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {formData.hospital_id && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หมู่บ้าน
                </label>
                <select
                  name="village_id"
                  value={formData.village_id}
                  onChange={(e) => setFormData({...formData, village_id: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="">-- เลือกหมู่บ้าน --</option>
                  {villages.map(village => (
                    <option key={village.id} value={village.id}>
                      หมู่ {village.village_no} {village.village_name}
                    </option>
                  ))}
                </select>
              </div>
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
                    placeholder="เช่น อพาร์ทเมนท์, อาคาร, ชั้น, รายละเอียดเพิ่มเติม"
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

        {/* 6. กำหนดโค้ช (กรองตามโรงพยาบาล) */}
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">-- เลือกโค้ช --</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.full_name_th} {coach.specialization_th ? `(${coach.specialization_th})` : ''}
                  {coach.hospitals?.name ? ` - ${coach.hospitals.name}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              🔒 แสดงโค้ชจากโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง ({coaches.length} คน)
            </p>
            {isSuperAdmin(user) && (
              <p className="text-xs text-purple-600 mt-1">
                👑 Super Admin - แสดงโค้ชทั้งหมด
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังลงทะเบียน...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                ลงทะเบียนผู้ป่วย
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