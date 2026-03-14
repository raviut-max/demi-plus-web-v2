'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [validationSuccess, setValidationSuccess] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    full_name: '',
    hospital_number: '',
    birth_date: '',
    gender: '',
    phone: '',
    email: '',
    current_weight: '',
    height: '',
    waist_circumference: '',
    diabetes_type: '',
    diagnosis_date: '',
    hba1c_level: '',
    blood_type: '',
    allergies: '',
    occupation: '',
    education_level: '',
    address_line1: '',
    district: '',
    province: '',
    postal_code: '',
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
  }, [router]);

  const loadPatientData = async () => {
    try {
      const data = await getPatientDetail(patientId);
      if (data) {
        setPatient(data);
        setFormData({
          full_name: data.full_name || '',
          hospital_number: data.hospital_number || '',
          birth_date: data.birth_date || '',
          gender: data.gender || '',
          phone: data.phone || '',
          email: data.email || '',
          current_weight: data.current_weight?.toString() || '',
          height: data.height?.toString() || '',
          waist_circumference: data.waist_circumference?.toString() || '',
          diabetes_type: data.diabetes_type || '',
          diagnosis_date: data.diagnosis_date || '',
          hba1c_level: data.hba1c_level?.toString() || '',
          blood_type: data.blood_type || '',
          allergies: data.allergies || '',
          occupation: data.occupation || '',
          education_level: data.education_level || '',
          address_line1: data.address_line1 || '',
          district: data.district || '',
          province: data.province || '',
          postal_code: data.postal_code || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          emergency_contact_relationship: data.emergency_contact_relationship || '',
        });
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย');
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันตรวจสอบเบอร์โทรศัพท์ไทย
  const validatePhoneNumber = (phone: string): { valid: boolean; message: string } => {
    if (!phone) return { valid: true, message: '' }; // อนุญาตให้ว่างได้
    
    // ลบช่องว่างและขีดกลาง
    const cleaned = phone.replace(/[\s-]/g, '');
    
    // ตรวจสอบว่าเป็นตัวเลขเท่านั้น
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, message: 'เบอร์โทรศัพท์ต้องเป็นตัวเลขเท่านั้น' };
    }
    
    // ตรวจสอบความยาว (9-10 หลัก)
    if (cleaned.length < 9 || cleaned.length > 10) {
      return { valid: false, message: 'เบอร์โทรศัพท์ต้องมี 9-10 หลัก' };
    }
    
    // ตรวจสอบว่าขึ้นต้นด้วย 0
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
        message: `${fieldName} ต้องอยู่ระหว่าง ${min}-${max} ${unit}` 
      };
    }
    
    return { valid: true, message: `${fieldName} ถูกต้อง` };
  };

  // ✅ ฟังก์ชันตรวจสอบ HN
  const validateHospitalNumber = (hn: string): { valid: boolean; message: string } => {
    if (!hn) return { valid: false, message: 'HN เป็นข้อมูลจำเป็น' };
    
    if (hn.length < 3) {
      return { valid: false, message: 'HN ต้องมีความยาวอย่างน้อย 3 ตัวอักษร' };
    }
    
    return { valid: true, message: 'HN ถูกต้อง' };
  };

  // ✅ ตรวจสอบ Real-time เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    const errors: Record<string, string> = {};
    const success: Record<string, boolean> = {};

    // ตรวจสอบเบอร์โทรศัพท์
    const phoneResult = validatePhoneNumber(formData.phone);
    if (!phoneResult.valid) {
      errors.phone = phoneResult.message;
    } else if (formData.phone) {
      success.phone = true;
    }

    // ตรวจสอบอีเมล
    const emailResult = validateEmail(formData.email);
    if (!emailResult.valid) {
      errors.email = emailResult.message;
    } else if (formData.email) {
      success.email = true;
    }

    // ตรวจสอบน้ำหนัก (30-200 kg)
    const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'kg', false);
    if (!weightResult.valid) {
      errors.current_weight = weightResult.message;
    } else if (formData.current_weight) {
      success.current_weight = true;
    }

    // ตรวจสอบส่วนสูง (100-250 cm)
    const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'cm', false);
    if (!heightResult.valid) {
      errors.height = heightResult.message;
    } else if (formData.height) {
      success.height = true;
    }

    // ตรวจสอบรอบเอว (26-200 cm)
    const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'cm', false);
    if (!waistResult.valid) {
      errors.waist_circumference = waistResult.message;
    } else if (formData.waist_circumference) {
      success.waist_circumference = true;
    }

    // ตรวจสอบ HN
    const hnResult = validateHospitalNumber(formData.hospital_number);
    if (!hnResult.valid) {
      errors.hospital_number = hnResult.message;
    } else {
      success.hospital_number = true;
    }

    setValidationErrors(errors);
    setValidationSuccess(success);
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ ตรวจสอบข้อมูลก่อนบันทึก
    const errors: string[] = [];
    
    // ตรวจสอบ HN
    if (!formData.hospital_number) {
      errors.push('• HN เป็นข้อมูลจำเป็น');
    }
    
    // ตรวจสอบเบอร์โทรศัพท์
    if (formData.phone) {
      const phoneResult = validatePhoneNumber(formData.phone);
      if (!phoneResult.valid) {
        errors.push(`• ${phoneResult.message}`);
      }
    }
    
    // ตรวจสอบอีเมล
    if (formData.email) {
      const emailResult = validateEmail(formData.email);
      if (!emailResult.valid) {
        errors.push(`• ${emailResult.message}`);
      }
    }
    
    // ตรวจสอบน้ำหนัก
    if (formData.current_weight) {
      const weightResult = validateRange(formData.current_weight, 'น้ำหนัก', 30, 200, 'kg', false);
      if (!weightResult.valid) {
        errors.push(`• ${weightResult.message}`);
      }
    }
    
    // ตรวจสอบส่วนสูง
    if (formData.height) {
      const heightResult = validateRange(formData.height, 'ส่วนสูง', 100, 250, 'cm', false);
      if (!heightResult.valid) {
        errors.push(`• ${heightResult.message}`);
      }
    }
    
    // ตรวจสอบรอบเอว
    if (formData.waist_circumference) {
      const waistResult = validateRange(formData.waist_circumference, 'รอบเอว', 26, 200, 'cm', false);
      if (!waistResult.valid) {
        errors.push(`• ${waistResult.message}`);
      }
    }
    
    // แสดง error ถ้ามี
    if (errors.length > 0) {
      alert(
        `❌ พบข้อผิดพลาดในการกรอกข้อมูล\n\n` +
        `กรุณาแก้ไขข้อมูลดังต่อไปนี้:\n\n` +
        errors.join('\n') +
        `\n\n💡 คำแนะนำ: ดูข้อความแจ้งเตือนใต้ช่องกรอกข้อมูล`
      );
      return;
    }
    
    setSaving(true);
    
    try {
      console.log('💾 Updating patient with data:', formData);
      
      const updateData: any = {
        full_name: formData.full_name,
        hospital_number: formData.hospital_number,
        birth_date: formData.birth_date,
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email,
        current_weight: formData.current_weight ? parseFloat(formData.current_weight) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
        diabetes_type: formData.diabetes_type,
        diagnosis_date: formData.diagnosis_date,
        hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : null,
        blood_type: formData.blood_type,
        allergies: formData.allergies,
        occupation: formData.occupation,
        education_level: formData.education_level,
        address_line1: formData.address_line1,
        district: formData.district,
        province: formData.province,
        postal_code: formData.postal_code,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', patientId);

      if (error) {
        console.error('❌ Error updating patient:', error);
        
        let errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
        
        if (error.message) {
          if (error.message.includes('waist_circumference')) {
            errorMessage = '❌ รอบเอวต้องอยู่ระหว่าง 26-200 cm\n\nค่าที่กรอก: ' + formData.waist_circumference + ' cm';
          } else if (error.message.includes('current_weight')) {
            errorMessage = '❌ น้ำหนักต้องอยู่ระหว่าง 30-200 kg\n\nค่าที่กรอก: ' + formData.current_weight + ' kg';
          } else if (error.message.includes('height')) {
            errorMessage = '❌ ส่วนสูงต้องอยู่ระหว่าง 100-250 cm\n\nค่าที่กรอก: ' + formData.height + ' cm';
          } else if (error.message.includes('hospital_number')) {
            errorMessage = '❌ เลข HN ซ้ำ กรุณาตรวจสอบ';
          } else {
            errorMessage = '❌ ' + error.message;
          }
        }
        
        alert(
          `บันทึกข้อมูลไม่สำเร็จ\n\n` +
          `${errorMessage}\n\n` +
          `Technical: ${error.code || ''}\n\n` +
          `กรุณาแก้ไขข้อมูลและลองใหม่อีกครั้ง`
        );
        return;
      }

      alert('✅ แก้ไขข้อมูลผู้ป่วยสำเร็จ!');
      router.push(`/admin/patients/${patientId}`);
    } catch (error: any) {
      console.error('Exception during update:', error);
      alert(
        `❌ เกิดข้อผิดพลาดในการบันทึก\n\n` +
        `รายละเอียด: ${error.message || 'ไม่สามารถเชื่อมต่อระบบได้'}\n\n` +
        `กรุณาติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่`
      );
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push(`/admin/patients/${patientId}`)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-800">แก้ไขข้อมูลผู้ป่วย</h1>
              <p className="text-sm text-gray-600">
                HN: {patient?.hospital_number} | {patient?.full_name}
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลส่วนตัว</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HN (Hospital Number) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.hospital_number}
                  onChange={(e) => setFormData({...formData, hospital_number: e.target.value})}
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.hospital_number ? 'border-red-500' : 
                    validationSuccess.hospital_number ? 'border-green-500' : 'border-gray-300'
                  }`}
                />
                {validationErrors.hospital_number && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {validationErrors.hospital_number}
                  </p>
                )}
                {validationSuccess.hospital_number && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {validationSuccess.hospital_number}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันเกิด
                </label>
                <input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เพศ
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="เช่น 0812345678"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.phone ? 'border-red-500' : 
                    validationSuccess.phone ? 'border-green-500' : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">รูปแบบ: 0812345678 (9-10 หลัก)</p>
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="เช่น patient@example.com"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.email ? 'border-red-500' : 
                    validationSuccess.email ? 'border-green-500' : 'border-gray-300'
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
                  น้ำหนัก (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="200"
                  value={formData.current_weight}
                  onChange={(e) => setFormData({...formData, current_weight: e.target.value})}
                  placeholder="เช่น 65"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.current_weight ? 'border-red-500' : 
                    validationSuccess.current_weight ? 'border-green-500' : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 30-200 kg</p>
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
                  ส่วนสูง (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="100"
                  max="250"
                  value={formData.height}
                  onChange={(e) => setFormData({...formData, height: e.target.value})}
                  placeholder="เช่น 170"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.height ? 'border-red-500' : 
                    validationSuccess.height ? 'border-green-500' : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 100-250 cm</p>
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
                  รอบเอว (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="26"
                  max="200"
                  value={formData.waist_circumference}
                  onChange={(e) => setFormData({...formData, waist_circumference: e.target.value})}
                  placeholder="เช่น 85"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    validationErrors.waist_circumference ? 'border-red-500' : 
                    validationSuccess.waist_circumference ? 'border-green-500' : 'border-gray-300'
                  }`}
                />
                <p className="text-xs text-gray-500 mt-1">ช่วงที่ยอมรับ: 26-200 cm</p>
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
                  onChange={(e) => setFormData({...formData, diabetes_type: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกประเภท --</option>
                  <option value="Type 1">Type 1</option>
                  <option value="Type 2">Type 2</option>
                  <option value="Gestational">Gestational</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่วินิจฉัย
                </label>
                <input
                  type="date"
                  value={formData.diagnosis_date}
                  onChange={(e) => setFormData({...formData, diagnosis_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค่า HbA1c
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.hba1c_level}
                  onChange={(e) => setFormData({...formData, hba1c_level: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

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