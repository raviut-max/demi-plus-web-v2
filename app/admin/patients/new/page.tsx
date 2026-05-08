// app/admin/patients/new/page.tsx
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แสดงชื่อโค้ชพร้อมชื่อโรงพยาบาลใน dropdown
//    2. ✅ แปลง error messages เป็นภาษาไทยที่เข้าใจง่าย
//    3. ✅ เพิ่ม validation ก่อน submit
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getHospitalsWithHierarchy, getAccessibleHospitalIds, getCoaches } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Save, AlertCircle, CheckCircle, UserPlus } from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export default function NewPatientPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [validationSuccess, setValidationSuccess] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  
  // ✅ State สำหรับที่อยู่จาก ThaiAddressSelector
  const [addressData, setAddressData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  });

  const [formData, setFormData] = useState({
    // ข้อมูลส่วนตัว
    id_card: '',
    password: '',
    confirmPassword: '',
    first_name: '',
    last_name: '',
    hospital_number: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    gender: '',
    phone: '',
    email: '',
    
    // ข้อมูลสุขภาพ
    current_weight: '',
    height: '',
    waist_circumference: '',
    diabetes_type: '',
    blood_sugar: '',
    hba1c_level: '',
    notes: '',
    occupation: '',
    education_level: '',
    
    // ที่อยู่
    house_number: '',
    address_line1: '',
    soi: '',
    road: '',
    village_no: '',
    village_name: '',
    
    // โรงพยาบาลและโค้ช
    hospital_id: '',
    coach_id: '',
    
    // ผู้ติดต่อฉุกเฉิน
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
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
    
    setUser(userData);
    loadAccessibleHospitals(userData.id);
    loadCoaches();
  }, [router]);

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🏥 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('✅ [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      console.log('📋 [loadAccessibleHospitals] Hospital IDs:', ids);
      
      // ✅ โหลดรายการโรงพยาบาลแบบมีลำดับชั้น
      const allHospitals = await getHospitalsWithHierarchy();
      console.log('🏥 [loadAccessibleHospitals] Total hospitals:', allHospitals.length);
      
      // ✅ กรองโรงพยาบาลตามสิทธิ์
      let filteredHospitals = allHospitals;
      if (ids.length > 0 && userData.role !== 'admin') {
        console.log('🔒 [loadAccessibleHospitals] Hospital Admin - filtering hospitals');
        filteredHospitals = allHospitals.filter(h => ids.includes(h.id));
        console.log(' [loadAccessibleHospitals] Filtered hospitals:', filteredHospitals.length);
      } else {
        console.log('👑 [loadAccessibleHospitals] Super Admin - showing all coaches');
      }
      
      setHospitals(filteredHospitals);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดโค้ช (แสดงชื่อพร้อมโรงพยาบาล)
  const loadCoaches = async () => {
    try {
      console.log('👨‍️ [loadCoaches] Loading coaches...');
      const allCoaches = await getCoaches();
      console.log('👑 [loadCoaches] Super Admin:', user?.role === 'admin' && accessibleHospitalIds.length === 0);
      
      // ✅ กรองโค้ชตามโรงพยาบาลที่เข้าถึงได้
      let filteredCoaches = allCoaches;
      if (accessibleHospitalIds.length > 0) {
        console.log('🔒 [loadCoaches] Hospital Admin - filtering coaches');
        filteredCoaches = allCoaches.filter(coach => 
          coach.hospital_id && accessibleHospitalIds.includes(coach.hospital_id)
        );
        console.log(' [loadCoaches] Filtered coaches:', filteredCoaches.length);
      } else {
        console.log('👑 [loadCoaches] Super Admin - showing all coaches');
      }
      
      setCoaches(filteredCoaches);
      console.log('✅ [loadCoaches] Loaded:', filteredCoaches.length, 'coaches');
    } catch (error) {
      console.error('❌ [loadCoaches] Error:', error);
    }
  };

  // ✅ ฟังก์ชันจัดกลุ่มโรงพยาบาล (แม่ข่าย → ลูกข่าย)
  const getGroupedHospitals = () => {
    const mainHospitals = hospitals.filter((h) => h.type === 'main');
    const subHospitals = hospitals.filter((h) => h.type === 'sub');
    const hospitalGroups = new Map<string, any[]>();
    
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

  // ✅ แปลง error messages เป็นภาษาไทย
  const getFriendlyErrorMessage = (error: any): string => {
    if (!error) return '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    
    const errorCode = error.code;
    const errorMessage = error.message || '';
    
    // ✅ ตรวจสอบ constraint violations
    if (errorCode === '23514' || errorMessage.includes('violates check constraint')) {
      if (errorMessage.includes('profiles_current_weight_check')) {
        return '❌ น้ำหนักต้องอยู่ระหว่าง 30-200 กก.\n\n💡 กรุณาตรวจสอบค่าน้ำหนักที่กรอก';
      }
      if (errorMessage.includes('profiles_height_check')) {
        return '❌ ส่วนสูงต้องอยู่ระหว่าง 100-250 ซม.\n\n💡 กรุณาตรวจสอบค่าส่วนสูงที่กรอก';
      }
      if (errorMessage.includes('profiles_waist_circumference_check')) {
        return '❌ รอบเอวต้องอยู่ระหว่าง 26-200 ซม.\n\n💡 กรุณาตรวจสอบค่ารอบเอวที่กรอก';
      }
      if (errorMessage.includes('profiles_gender_check')) {
        return '❌ กรุณาเลือกเพศ (ชาย หรือ หญิง)\n\n💡 กรุณาเลือกเพศจากเมนู';
      }
      if (errorMessage.includes('profiles_diabetes_type_check')) {
        return '❌ ประเภทเบาหวานไม่ถูกต้อง\n\n💡 กรุณาเลือกประเภทเบาหวานจากเมนู (กลุ่มเสี่ยง หรือ เบาหวาน)';
      }
      return '❌ ข้อมูลที่กรอกไม่ถูกต้องตามเงื่อนไขของระบบ\n\n💡 กรุณาตรวจสอบข้อมูลอีกครั้ง';
    }
    
    // ✅ ตรวจสอบ numeric field overflow
    if (errorCode === '22003' || errorMessage.includes('numeric field overflow')) {
      return '❌ ค่าที่กรอกมีขนาดใหญ่เกินไป\n\n💡 กรุณากรอกตัวเลขที่มีขนาดเหมาะสม (เช่น น้ำหนักไม่เกิน 200 กก., ส่วนสูงไม่เกิน 250 ซม.)';
    }
    
    // ✅ ตรวจสอบ unique constraint
    if (errorCode === '23505' || errorMessage.includes('violates unique constraint')) {
      if (errorMessage.includes('profiles_hospital_number_key')) {
        return '❌ เลข HN นี้มีในระบบแล้ว\n\n💡 กรุณาใช้เลข HN ใหม่ที่ไม่ซ้ำ';
      }
      if (errorMessage.includes('users_id_card_key')) {
        return '❌ เลขบัตรประชาชนนี้มีในระบบแล้ว\n\n💡 กรุณาตรวจสอบเลขบัตรประชาชน';
      }
      return '❌ ข้อมูลนี้มีในระบบแล้ว\n\n💡 กรุณาตรวจสอบข้อมูลอีกครั้ง';
    }
    
    // ✅ ตรวจสอบ foreign key constraint
    if (errorCode === '23503' || errorMessage.includes('violates foreign key constraint')) {
      return '❌ ข้อมูลที่อ้างอิงไม่มีในระบบ\n\n💡 กรุณาตรวจสอบข้อมูลโรงพยาบาลหรือโค้ชที่เลือก';
    }
    
    // ✅ ตรวจสอบ not null constraint
    if (errorCode === '23502' || errorMessage.includes('null value in column')) {
      return '❌ มีช่องข้อมูลที่จำเป็นยังไม่ถูกกรอก\n\n💡 กรุณากรอกข้อมูลให้ครบถ้วน';
    }
    
    // ✅ Error messages อื่นๆ
    if (errorMessage.includes('id_card')) {
      return '❌ เลขบัตรประชาชนไม่ถูกต้อง\n\n💡 กรุณากรอกเลขบัตรประชาชน 13 หลัก';
    }
    
    if (errorMessage.includes('phone')) {
      return '❌ เบอร์โทรศัพท์ไม่ถูกต้อง\n\n💡 กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก';
    }
    
    if (errorMessage.includes('email')) {
      return '❌ อีเมลไม่ถูกต้อง\n\n💡 กรุณากรอกอีเมลให้ถูกต้อง (เช่น example@email.com)';
    }
    
    // ✅ Default error message
    return `❌ เกิดข้อผิดพลาด: ${errorMessage}\n\n💡 กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ`;
  };

  // ✅ ฟังก์ชันตรวจสอบเบอร์โทรศัพท์ไทย
  const validatePhoneNumber = (phone: string): { valid: boolean; message: string } => {
    if (!phone) return { valid: true, message: '' };
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, message: 'เบอร์โทรศัพท์ต้องเป็นตัวเลขเท่านั้น' };
    }
    if (cleaned.length < 9 || cleaned.length > 10) {
      return { valid: false, message: 'เบอร์โทรศัพท์ต้องมี 9-10 หลัก' };
    }
    if (!cleaned.startsWith('0')) {
      return { valid: false, message: 'เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0' };
    }
    return { valid: true, message: 'เบอร์โทรศัพท์ถูกต้อง' };
  };

  // ✅ ฟังก์ชันตรวจสอบอีเมล
  const validateEmail = (email: string): { valid: boolean; message: string } => {
    if (!email) return { valid: true, message: '' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }
    return { valid: true, message: 'อีเมลถูกต้อง' };
  };

  // ✅ ฟังก์ชันตรวจสอบค่าตัวเลขในช่วง
  const validateRange = (
    value: string,
    fieldName: string,
    min: number,
    max: number,
    unit: string,
    required: boolean = false
  ): { valid: boolean; message: string } => {
    if (!value) {
      if (required) {
        return { valid: false, message: `${fieldName} เป็นข้อมูลจำเป็น` };
      }
      return { valid: true, message: '' };
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return { valid: false, message: `${fieldName} ต้องเป็นตัวเลข` };
    }
    if (numValue < min || numValue > max) {
      return {
        valid: false,
        message: `${fieldName} ต้องอยู่ระหว่าง ${min}-${max} ${unit}`,
      };
    }
    return { valid: true, message: `${fieldName} ถูกต้อง` };
  };

  // ✅ ตรวจสอบ Real-time เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const errors: Record<string, string> = {};
    const success: Record<string, boolean> = {};
    
    const phoneResult = validatePhoneNumber(formData.phone);
    if (!phoneResult.valid) {
      errors.phone = phoneResult.message;
    } else if (formData.phone) {
      success.phone = true;
    }

    const emailResult = validateEmail(formData.email);
    if (!emailResult.valid) {
      errors.email = emailResult.message;
    } else if (formData.email) {
      success.email = true;
    }

    const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'กก.', false);
    if (!weightResult.valid) {
      errors.current_weight = weightResult.message;
    } else if (formData.current_weight) {
      success.current_weight = true;
    }

    const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'ซม.', false);
    if (!heightResult.valid) {
      errors.height = heightResult.message;
    } else if (formData.height) {
      success.height = true;
    }

    const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'ซม.', false);
    if (!waistResult.valid) {
      errors.waist_circumference = waistResult.message;
    } else if (formData.waist_circumference) {
      success.waist_circumference = true;
    }

    setValidationErrors(errors);
    setValidationSuccess(success);
  }, [formData]);

  // ✅ Handler สำหรับรับข้อมูลจาก ThaiAddressSelector
  const handleAddressChange = (data: {
    province: string;
    district: string;
    subdistrict: string;
    postalCode: string;
  }) => {
    console.log('📍 Address changed:', data);
    setAddressData(data);
  };

  // ✅ Handle Hospital Change
  const handleHospitalChange = (hospitalId: string) => {
    console.log('🏥 [handleHospitalChange] Selected hospital:', hospitalId);
    setFormData({ ...formData, hospital_id: hospitalId });
  };

  // ✅ Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    console.log('📝 [handleSubmit] Form submitted');
    console.log('📝 [handleSubmit] Form data:', formData);
    console.log('🏥 [handleSubmit] Accessible hospitals:', accessibleHospitalIds);
    console.log('👑 [handleSubmit] Is Super Admin:', user?.role === 'admin' && accessibleHospitalIds.length === 0);

    // ✅ Validate required fields
    const errors: string[] = [];

    if (!formData.id_card) {
      errors.push('• เลขบัตรประชาชนเป็นข้อมูลจำเป็น');
    } else if (!/^\d{13}$/.test(formData.id_card)) {
      errors.push('• เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
    }

    if (!formData.password) {
      errors.push('• รหัสผ่านเป็นข้อมูลจำเป็น');
    }

    if (formData.password !== formData.confirmPassword) {
      errors.push('• รหัสผ่านไม่ตรงกัน');
    }

    if (!formData.first_name || !formData.last_name) {
      errors.push('• ชื่อและนามสกุลเป็นข้อมูลจำเป็น');
    }

    if (!formData.hospital_number) {
      errors.push('• เลข HN เป็นข้อมูลจำเป็น');
    }

    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      errors.push('• กรุณากรอกวันเกิดให้ครบถ้วน');
    }

    if (!formData.gender) {
      errors.push('• กรุณาเลือกเพศ');
    }

    if (!addressData.province || !addressData.district || !addressData.subdistrict) {
      errors.push('• กรุณาเลือกจังหวัด อำเภอ/เขต และตำบล ให้ครบถ้วน');
    }

    if (!formData.hospital_id) {
      errors.push('• กรุณาเลือกโรงพยาบาล');
    }

    // ✅ Validate phone
    if (formData.phone) {
      const phoneResult = validatePhoneNumber(formData.phone);
      if (!phoneResult.valid) {
        errors.push(`• ${phoneResult.message}`);
      }
    }

    // ✅ Validate email
    if (formData.email) {
      const emailResult = validateEmail(formData.email);
      if (!emailResult.valid) {
        errors.push(`• ${emailResult.message}`);
      }
    }

    // ✅ Validate weight
    if (formData.current_weight) {
      const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'กก.', false);
      if (!weightResult.valid) {
        errors.push(`• ${weightResult.message}`);
      }
    }

    // ✅ Validate height
    if (formData.height) {
      const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'ซม.', false);
      if (!heightResult.valid) {
        errors.push(`• ${heightResult.message}`);
      }
    }

    // ✅ Validate waist
    if (formData.waist_circumference) {
      const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'ซม.', false);
      if (!waistResult.valid) {
        errors.push(`• ${waistResult.message}`);
      }
    }

    if (errors.length > 0) {
      setError(
        `❌ พบข้อผิดพลาดในการกรอกข้อมูล\n\n` +
        `กรุณาแก้ไขข้อมูลดังต่อไปนี้:\n\n` +
        errors.join('\n') +
        `\n\n💡 คำแนะนำ: ดูข้อความแจ้งเตือนใต้ช่องกรอกข้อมูล`
      );
      return;
    }

    setSaving(true);

    try {
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      // ✅ 1. สร้าง user ในตาราง users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id_card: formData.id_card,
          password_hash: formData.password,
          role: 'patient',
          is_active: true,
        })
        .select()
        .single();

      if (userError) {
        console.error('❌ [handleSubmit] Error creating user:', userError);
        const friendlyError = getFriendlyErrorMessage(userError);
        setError(friendlyError);
        setSaving(false);
        return;
      }

      // ✅ 2. สร้าง profile ในตาราง profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userData.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          hospital_number: formData.hospital_number,
          birth_date: birthDate,
          gender: formData.gender,
          phone: formData.phone,
          email: formData.email,
          current_weight: formData.current_weight ? parseFloat(formData.current_weight) : null,
          height: formData.height ? parseFloat(formData.height) : null,
          waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
          diabetes_type: formData.diabetes_type,
          blood_sugar: formData.blood_sugar ? parseFloat(formData.blood_sugar) : null,
          hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : null,
          notes: formData.notes,
          occupation: formData.occupation,
          education_level: formData.education_level,
          house_number: formData.house_number,
          address_line1: formData.address_line1,
          soi: formData.soi,
          road: formData.road,
          village_no: formData.village_no,
          village_name: formData.village_name,
          subdistrict: addressData.subdistrict,
          district: addressData.district,
          province: addressData.province,
          postal_code: addressData.postalCode,
          hospital_id: formData.hospital_id,
          coach_id: formData.coach_id,
          emergency_contact_name: formData.emergency_contact_name,
          emergency_contact_phone: formData.emergency_contact_phone,
          emergency_contact_relationship: formData.emergency_contact_relationship,
          pam_level: 'L0',
          pam_score: 0,
          zone: 'Zero Zone',
          current_step: 'Starter',
          is_active: true,
          status: 'active',
        });

      if (profileError) {
        console.error('❌ [handleSubmit] Error creating profile:', profileError);
        // ✅ ลบ user ที่สร้างไว้ถ้า profile ล้มเหลว
        await supabase.from('users').delete().eq('id', userData.id);
        const friendlyError = getFriendlyErrorMessage(profileError);
        setError(friendlyError);
        setSaving(false);
        return;
      }

      setError('✅ ลงทะเบียนผู้ป่วยสำเร็จ!');
      setTimeout(() => {
        router.push('/admin/patients');
      }, 1500);
    } catch (error: any) {
      console.error('❌ [handleSubmit] Exception:', error);
      const friendlyError = getFriendlyErrorMessage(error);
      setError(friendlyError);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
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
            onClick={() => router.push('/admin/patients')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">📝 ลงทะเบียนผู้ป่วยใหม่</h1>
              <p className="text-gray-600">กรอกข้อมูลผู้ป่วยเพื่อสร้างบัญชีและโปรไฟล์</p>
            </div>

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

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลส่วนตัว</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เลขบัตรประชาชน *
                </label>
                <input
                  type="text"
                  value={formData.id_card}
                  onChange={(e) => setFormData({ ...formData, id_card: e.target.value.replace(/\D/g, '').slice(0, 13) })}
                  required
                  maxLength={13}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="1234567890123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รหัสผ่าน *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="กรอกรหัสผ่าน"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ยืนยันรหัสผ่าน *
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="ยืนยันรหัสผ่าน"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ *
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="ชื่อ"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  นามสกุล *
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="นามสกุล"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HN (Hospital Number) *
                </label>
                <input
                  type="text"
                  value={formData.hospital_number}
                  onChange={(e) => setFormData({ ...formData, hospital_number: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="HN-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันเกิด *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={formData.birth_day}
                    onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                    required
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
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
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
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
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
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
                  เพศ *
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
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
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="เช่น 0812345678"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.phone
                      ? 'border-red-500'
                      : validationSuccess.phone
                      ? 'border-green-500'
                      : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">รูปแบบ: 0812345678 (9-10 หลัก) (เว้นว่างได้)</p>
                {validationErrors.phone && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.phone}
                  </p>
                )}
                {validationSuccess.phone && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.phone}
                  </p>
                )}
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="patient@example.com"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.email
                      ? 'border-red-500'
                      : validationSuccess.email
                      ? 'border-green-500'
                      : 'border-gray-300'
                  }`}
                />
                {validationErrors.email && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.email}
                  </p>
                )}
                {validationSuccess.email && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลสุขภาพ</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  น้ำหนัก (กก.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.current_weight}
                  onChange={(e) => setFormData({ ...formData, current_weight: e.target.value })}
                  placeholder="เช่น 65"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.current_weight
                      ? 'border-red-500'
                      : validationSuccess.current_weight
                      ? 'border-green-500'
                      : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 30-200 กก. (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
                {validationErrors.current_weight && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.current_weight}
                  </p>
                )}
                {validationSuccess.current_weight && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.current_weight}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ส่วนสูง (ซม.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  placeholder="เช่น 170"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.height
                      ? 'border-red-500'
                      : validationSuccess.height
                      ? 'border-green-500'
                      : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 100-250 ซม. (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
                {validationErrors.height && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.height}
                  </p>
                )}
                {validationSuccess.height && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.height}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รอบเอว (ซม.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.waist_circumference}
                  onChange={(e) => setFormData({ ...formData, waist_circumference: e.target.value })}
                  placeholder="เช่น 85"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.waist_circumference
                      ? 'border-red-500'
                      : validationSuccess.waist_circumference
                      ? 'border-green-500'
                      : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 26-200 ซม. (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
                {validationErrors.waist_circumference && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.waist_circumference}
                  </p>
                )}
                {validationSuccess.waist_circumference && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.waist_circumference}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทเบาหวาน
                </label>
                <select
                  value={formData.diabetes_type}
                  onChange={(e) => setFormData({ ...formData, diabetes_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกประเภท --</option>
                  <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>
                  <option value="เบาหวาน">เบาหวาน</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค่าน้ำตาล (mg/dL)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.blood_sugar}
                  onChange={(e) => setFormData({ ...formData, blood_sugar: e.target.value })}
                  placeholder="เช่น 110"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">ค่าปกติ: 70-100 mg/dL (งดอาหาร 8 ชม.)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค่า HbA1c
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.hba1c_level}
                  onChange={(e) => setFormData({ ...formData, hba1c_level: e.target.value })}
                  placeholder="เช่น 7.5"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">เว้นว่างได้ถ้าไม่มีข้อมูล</p>
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หมายเหตุ (คำแนะนำเพิ่มเติม)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="เช่น แพ้ถั่ว แพ้นม (เว้นว่างได้ถ้าไม่มี)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ที่อยู่</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่</label>
                  <input
                    type="text"
                    value={formData.house_number}
                    onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่เพิ่มเติม (ถ้ามี)</label>
                  <input
                    type="text"
                    value={formData.address_line1}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="เช่น อพาร์ทเมนท์, อาคาร, ชั้น"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมู่ที่/ชุมชน</label>
                  <input
                    type="text"
                    value={formData.village_no}
                    onChange={(e) => setFormData({ ...formData, village_no: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="หมู่ 5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมู่บ้าน</label>
                  <input
                    type="text"
                    value={formData.village_name}
                    onChange={(e) => setFormData({ ...formData, village_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="หมู่บ้านสุขใจ"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ซอย</label>
                  <input
                    type="text"
                    value={formData.soi}
                    onChange={(e) => setFormData({ ...formData, soi: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="ซอย 5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ถนน</label>
                  <input
                    type="text"
                    value={formData.road}
                    onChange={(e) => setFormData({ ...formData, road: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="ถนนสุขุมวิท"
                  />
                </div>
              </div>

              <div>
                <ThaiAddressSelector
                  onAddressChange={handleAddressChange}
                  initialData={{
                    province: addressData.province,
                    district: addressData.district,
                    subdistrict: addressData.subdistrict,
                    postal_code: addressData.postalCode,
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🏥 โรงพยาบาลสังกัด *
                </label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => handleHospitalChange(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>
                  {mainHospitals.map((hospital) => (
                    <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                      <option value={hospital.id}>└ {hospital.name} ({hospital.code}) - แม่ข่าย</option>
                      {hospitalGroups.get(hospital.id)?.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {'   '}└─ {sub.name} ({sub.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">💡 เลือกโรงพยาบาลที่ผู้ป่วยสังกัด (แม่ข่ายหรือลูกข่าย)</p>
                {hospitals.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">⚠️ ยังไม่มีข้อมูลโรงพยาบาลในระบบ</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  👨‍⚕️ โค้ช/หมอผู้ดูแล
                </label>
                <select
                  value={formData.coach_id}
                  onChange={(e) => setFormData({ ...formData, coach_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- เลือกโค้ช --</option>
                  {coaches.map((coach) => (
                    <option key={coach.user_id} value={coach.user_id}>
                      {coach.full_name_th} {coach.hospitals?.name ? `(${coach.hospitals.name})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  🔒 แสดงโค้ชจากโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง ({coaches.length} คน)
                </p>
              </div>
            </div>
          </div>

          {/* ผู้ติดต่อฉุกเฉิน */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ผู้ติดต่อฉุกเฉิน</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ติดต่อ</label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0812345678"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ความสัมพันธ์</label>
                <input
                  type="text"
                  value={formData.emergency_contact_relationship}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น พ่อ, แม่, สามี"
                />
              </div>
            </div>
          </div>

          {/* Error/Success Message */}
          {error && (
            <div
              className={`rounded-xl p-6 border-2 ${
                error.includes('✅') || error.includes('สำเร็จ')
                  ? 'bg-green-50 border-green-300'
                  : 'bg-red-50 border-red-300'
              }`}
            >
              <div className="flex items-start gap-3">
                {error.includes('✅') || error.includes('สำเร็จ') ? (
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h3
                    className={`font-bold mb-2 ${
                      error.includes('✅') || error.includes('สำเร็จ') ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {error.includes('✅') || error.includes('สำเร็จ') ? '✅ สำเร็จ' : '⚠️ พบข้อผิดพลาด'}
                  </h3>
                  <div
                    className={`whitespace-pre-line text-sm leading-relaxed ${
                      error.includes('✅') || error.includes('สำเร็จ') ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {error}
                  </div>
                  {(error.includes('✅') || error.includes('สำเร็จ')) && (
                    <p className="text-green-600 text-sm mt-3">⏳ กำลังเปลี่ยนหน้าในอีก 1.5 วินาที...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving || Object.keys(validationErrors).length > 0}
              className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
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
              onClick={() => router.push('/admin/patients')}
              className="flex-1 bg-gray-500 text-white font-bold py-4 rounded-xl hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}