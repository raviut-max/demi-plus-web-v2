// app/admin/patients/[id]/edit/page.tsx
// ✅ แก้ไขล่าสุด: 24 เมษายน 2569
// ✅ การแก้ไข:
//    1. เพิ่มฟิลด์ blood_sugar (ค่าน้ำตาล)
//    2. แก้ไข ThaiAddressSelector ให้รับ initialData ถูกต้อง
//    3. โหลดข้อมูล blood_sugar จากฐานข้อมูล

'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail, getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Save, AlertCircle, CheckCircle } from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
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
    blood_sugar: '',  // ✅ เพิ่มฟิลด์ค่าน้ำตาล
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

    // โรงพยาบาล
    hospital_id: '',

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
    loadPatientData();
    loadHospitals();
  }, [router]);

  // ✅ โหลดรายการโรงพยาบาล (แบบมีลำดับชั้น)
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

  // ✅ โหลดข้อมูลผู้ป่วย
  const loadPatientData = async () => {
    try {
      const data = await getPatientDetail(patientId);
      if (data) {
        setPatient(data);

        // ✅ แยกวันเกิดเป็น 3 ช่อง (แปลงจาก ค.ศ. เป็น พ.ศ.)
        let birthDay = '';
        let birthMonth = '';
        let birthYear = '';

        if (data.birth_date) {
          const birthDate = new Date(data.birth_date);
          birthDay = birthDate.getDate().toString();
          birthMonth = (birthDate.getMonth() + 1).toString();
          birthYear = (birthDate.getFullYear() + 543).toString();
        }

        setFormData({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          hospital_number: data.hospital_number || '',
          birth_day: birthDay,
          birth_month: birthMonth,
          birth_year: birthYear,
          gender: data.gender || '',
          phone: data.phone || '',
          email: data.email || '',
          current_weight: data.current_weight?.toString() || '',
          height: data.height?.toString() || '',
          waist_circumference: data.waist_circumference?.toString() || '',
          diabetes_type: data.diabetes_type || '',
          blood_sugar: data.blood_sugar?.toString() || '',  // ✅ โหลดค่าน้ำตาล
          hba1c_level: data.hba1c_level?.toString() || '',
          notes: data.notes || '',
          occupation: data.occupation || '',
          education_level: data.education_level || '',
          house_number: data.house_number || '',
          address_line1: data.address_line1 || '',
          soi: data.soi || '',
          road: data.road || '',
          village_no: data.village_no || '',
          village_name: data.village_name || '',
          hospital_id: data.hospital_id || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          emergency_contact_relationship: data.emergency_contact_relationship || '',
        });

        // ✅ ตั้งค่าเริ่มต้นสำหรับ ThaiAddressSelector (อำเภอ/ตำบล จะกลับมา)
        setAddressData({
          province: data.province || '',
          district: data.district || '',
          subdistrict: data.subdistrict || '',
          postalCode: data.postal_code || '',
        });

        console.log('✅ Patient data loaded:', data);
        console.log('📍 Address data:', {
          province: data.province,
          district: data.district,
          subdistrict: data.subdistrict,
          postal_code: data.postal_code,
        });
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

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

    const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'kg', false);
    if (!weightResult.valid) {
      errors.current_weight = weightResult.message;
    } else if (formData.current_weight) {
      success.current_weight = true;
    }

    const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'cm', false);
    if (!heightResult.valid) {
      errors.height = heightResult.message;
    } else if (formData.height) {
      success.height = true;
    }

    const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'cm', false);
    if (!waistResult.valid) {
      errors.waist_circumference = waistResult.message;
    } else if (formData.waist_circumference) {
      success.waist_circumference = true;
    }

    setValidationErrors(errors);
    setValidationSuccess(success);
  }, [formData]);

  // ✅ ฟังก์ชันแปลง error messages ให้เข้าใจง่าย
  const getFriendlyErrorMessage = (error: any): string => {
    if (!error) return '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';

    if (error.message?.includes('profiles_diabetes_type_check')) {
      return '❌ ประเภทเบาหวานไม่ถูกต้อง\n\n💡 วิธีแก้ไข:\n- เลือกประเภทเบาหวานจากเมนู dropdown\n- ต้องเป็น: กลุ่มเสี่ยง หรือ เบาหวาน เท่านั้น';
    }

    if (error.message?.includes('waist_circumference')) {
      return '❌ รอบเอวต้องอยู่ระหว่าง 26-200 ซม.\n\n💡 วิธีแก้ไข:\n- ตรวจสอบค่ารอบเอวที่กรอก\n- เว้นว่างไว้ถ้าไม่มีข้อมูล';
    }

    if (error.message?.includes('current_weight')) {
      return '❌ น้ำหนักต้องอยู่ระหว่าง 30-200 กก.\n\n💡 วิธีแก้ไข:\n- ตรวจสอบค่าน้ำหนักที่กรอก\n- เว้นว่างไว้ถ้าไม่มีข้อมูล';
    }

    if (error.message?.includes('height')) {
      return '❌ ส่วนสูงต้องอยู่ระหว่าง 100-250 ซม.\n\n💡 วิธีแก้ไข:\n- ตรวจสอบค่าส่วนสูงที่กรอก\n- เว้นว่างไว้ถ้าไม่มีข้อมูล';
    }

    if (error.message?.includes('hospital_number')) {
      return '❌ เลข HN (Hospital Number) ซ้ำกับผู้ป่วยคนอื่น\n\n💡 วิธีแก้ไข:\n- ตรวจสอบเลข HN ให้ถูกต้อง\n- หรือใช้เลข HN ใหม่ที่ไม่ซ้ำ';
    }

    if (error.message?.includes('profiles_gender_check')) {
      return '❌ เพศไม่ถูกต้อง\n\n💡 วิธีแก้ไข:\n- เลือกเพศจากเมนู dropdown\n- ต้องเป็น: ชาย หรือ หญิง เท่านั้น';
    }

    return `❌ เกิดข้อผิดพลาด: ${error.message}\n\n💡 วิธีแก้ไข:\n- ตรวจสอบข้อมูลที่กรอก\n- ลองใหม่อีกครั้ง`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errors: string[] = [];

    if (!formData.hospital_number) {
      errors.push('• HN เป็นข้อมูลจำเป็น');
    }

    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      errors.push('• กรุณากรอกวันเกิดให้ครบถ้วน');
    }

    if (!addressData.province || !addressData.district || !addressData.subdistrict) {
      errors.push('• กรุณาเลือกจังหวัด อำเภอ/เขต และตำบล ให้ครบถ้วน');
    }

    if (formData.phone) {
      const phoneResult = validatePhoneNumber(formData.phone);
      if (!phoneResult.valid) {
        errors.push(`• ${phoneResult.message}`);
      }
    }

    if (formData.email) {
      const emailResult = validateEmail(formData.email);
      if (!emailResult.valid) {
        errors.push(`• ${emailResult.message}`);
      }
    }

    if (formData.current_weight) {
      const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'kg', false);
      if (!weightResult.valid) {
        errors.push(`• ${weightResult.message}`);
      }
    }

    if (formData.height) {
      const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'cm', false);
      if (!heightResult.valid) {
        errors.push(`• ${heightResult.message}`);
      }
    }

    if (formData.waist_circumference) {
      const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'cm', false);
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

      const updateData: any = {
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
        blood_sugar: formData.blood_sugar ? parseFloat(formData.blood_sugar) : null,  // ✅ บันทึกค่าน้ำตาล
        hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : null,
        notes: formData.notes,
        occupation: formData.occupation,
        education_level: formData.education_level,

        // ที่อยู่แยกส่วน
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

        // โรงพยาบาล
        hospital_id: formData.hospital_id || null,

        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').update(updateData).eq('id', patientId);

      if (error) {
        console.error('❌ Error updating patient:', error);
        const friendlyError = getFriendlyErrorMessage(error);
        setError(friendlyError);
        return;
      }

      setError('✅ แก้ไขข้อมูลผู้ป่วยสำเร็จ!');
      setTimeout(() => {
        router.push(`/admin/patients/${patientId}`);
      }, 1500);
    } catch (error: any) {
      console.error('Exception during update:', error);
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
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">✏️ แก้ไขข้อมูลผู้ป่วย</h1>
              <p className="text-gray-600">
                HN: {patient?.hospital_number} | {patient?.first_name} {patient?.last_name}
              </p>
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลส่วนตัว</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">นามสกุล *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HN (Hospital Number) *</label>
                <input
                  type="text"
                  required
                  value={formData.hospital_number}
                  onChange={(e) => setFormData({ ...formData, hospital_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันเกิด *</label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={formData.birth_day}
                    onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                    required
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">วัน</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
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
                      <option key={index + 1} value={index + 1}>
                        {month}
                      </option>
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
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เพศ</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนัก (kg)</label>
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
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 30-200 kg (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">ส่วนสูง (cm)</label>
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
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 100-250 cm (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (cm)</label>
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
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 26-200 cm (เว้นว่างได้ถ้าไม่มีข้อมูล)</p>
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

              {/* ✅ ประเภทเบาหวาน */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทเบาหวาน</label>
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

              {/* ✅ ค่าน้ำตาล (เพิ่มใหม่) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่าน้ำตาล (mg/dL)</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">ค่า HbA1c</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ (คำแนะนำเพิ่มเติม)</label>
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
              {/* เลขที่ + ที่อยู่เพิ่มเติม */}
              <div className="grid grid-cols-3 gap-4">
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
                <div className="col-span-2">
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

              {/* หมู่ที่ + หมู่บ้าน */}
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

              {/* ซอย + ถนน */}
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

              {/* ✅ ThaiAddressSelector - เลือก จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ */}
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

              {/* ✅ เลือกโรงพยาบาล (แบบลำดับชั้น) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">🏥 โรงพยาบาลสังกัด</label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>

                  {/* ✅ แม่ข่าย */}
                  {mainHospitals.map((hospital) => (
                    <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                      <option value={hospital.id}>└ {hospital.name} ({hospital.code}) - แม่ข่าย</option>
                      {/* ✅ ลูกข่ายของแม่ข่ายนี้ */}
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
            </div>
          </div>

          {/* ผู้ติดต่อฉุกเฉิน */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ผู้ติดต่อฉุกเฉิน</h2>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ติดต่อ</label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">ความสัมพันธ์</label>
                <input
                  type="text"
                  value={formData.emergency_contact_relationship}
                  onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                  placeholder="เช่น พ่อ, แม่, สามี"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ✅ Error/Success Message */}
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
                  <Save className="w-5 h-5" />
                  บันทึกการแก้ไข
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/patients/${patientId}`)}
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