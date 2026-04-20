// app/admin/patients/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, registerPatient, getCoaches } from '@/lib/supabase/queries';
import { UserPlus, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import ThaiAddressSelector from '@/components/ThaiAddressSelector';

// =====================================================
// 📅 เดือนภาษาไทย (สำหรับ dropdown วันเกิด)
// =====================================================
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export default function NewPatientPage() {
  const router = useRouter();
  
  // =====================================================
  // 🔐 State สำหรับ authentication และ loading
  // =====================================================
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // =====================================================
  // 🏠 State สำหรับที่อยู่จาก ThaiAddressSelector
  // =====================================================
  const [addressData, setAddressData] = useState({
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  });

  // =====================================================
  // 📝 State สำหรับฟอร์มทั้งหมด
  // =====================================================
  const [formData, setFormData] = useState({
    // ข้อมูลบัญชี
    id_card: '',
    password: '',
    confirmPassword: '',
    
    // ข้อมูลส่วนตัว (แยกชื่อ-นามสกุล)
    first_name: '',
    last_name: '',
    hospital_number: '',
    
    // วันเกิด (แยก 3 ช่อง)
    birth_day: '',
    birth_month: '',
    birth_year: '',
    
    gender: 'male',
    phone: '',
    email: '',
    
    // ข้อมูลสุขภาพ
    current_weight: '',
    height: '',
    waist_circumference: '',
    
    // ข้อมูลเพิ่มเติม
    diabetes_type: '',
    blood_sugar: '',  // ✅ เพิ่มค่าน้ำตาล
    
    hba1c_level: '',
    notes: '',
    
    // ที่อยู่ (แยกส่วน)
    house_number: '',
    address_line1: '',
    soi: '',
    road: '',
    village_no: '',
    village_name: '',
    // province, district, subdistrict, postal_code จะมาจาก addressData
    
    subdistrict_health_center: '',
    
    // ผู้ติดต่อฉุกเฉิน
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    
    // ข้อมูลอื่นๆ
    occupation: '',
    education_level: '',
    coach_id: '',
  });

  // =====================================================
  // 🔐 ตรวจสอบ Session และสิทธิ์เมื่อโหลดหน้า
  // =====================================================
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
    loadCoaches();
  }, [router]);

  // =====================================================
  // 👨‍⚕️ โหลดรายการโค้ช/หมอ สำหรับ dropdown
  // =====================================================
  const loadCoaches = async () => {
    try {
      const data = await getCoaches();
      setCoaches(data);
    } catch (error) {
      console.error('Error loading coaches:', error);
    }
  };

  // =====================================================
  // 🔑 ฟังก์ชันสร้างรหัสผ่านจากวันเกิด (ปี พ.ศ.)
  // รูปแบบ: dd-mm-yyyy (เช่น 01-04-2540)
  // =====================================================
  const generatePasswordFromBirthDate = (day: string, month: string, year: string) => {
    if (!day || !month || !year) return '';
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  };

  // =====================================================
  // 📝 Handle การเปลี่ยนแปลงค่าใน input ทั่วไป
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // =====================================================
  // 🔐 Auto-generate password เมื่อกรอกวันเกิดครบ
  // =====================================================
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

  // =====================================================
  // 🏠 Handler สำหรับรับข้อมูลที่อยู่จาก ThaiAddressSelector
  // =====================================================
  const handleAddressChange = (data: {
    province: string;
    district: string;
    subdistrict: string;
    postalCode: string;
  }) => {
    setAddressData(data);
  };

  // =====================================================
  // ✅ Submit ฟอร์ม - ลงทะเบียนผู้ป่วยใหม่
  // =====================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 🔍 Validate ข้อมูล
    if (formData.password !== formData.confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    if (formData.id_card.length !== 13) {
      setError('เลขบัตรประชาชนต้อง 13 หลัก');
      return;
    }

    if (!formData.first_name || !formData.last_name || !formData.hospital_number) {
      setError('กรุณากรอกข้อมูล必填ให้ครบถ้วน');
      return;
    }

    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      setError('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    // ✅ ตรวจสอบที่อยู่
    if (!addressData.province || !addressData.district || !addressData.subdistrict) {
      setError('กรุณาเลือกจังหวัด อำเภอ/เขต และตำบล ให้ครบถ้วน');
      return;
    }

    setLoading(true);

    try {
      // ✅ รวมวันเกิดเป็น ค.ศ. (YYYY-MM-DD)
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      // ✅ รวมชื่อ-นามสกุล
      const fullName = `${formData.first_name} ${formData.last_name}`;

      // ✅ บันทึกผู้ป่วยใหม่
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
        blood_sugar: formData.blood_sugar ? parseFloat(formData.blood_sugar) : undefined,  // ✅ เพิ่มค่าน้ำตาล
        hba1c_level: formData.hba1c_level ? parseFloat(formData.hba1c_level) : undefined,
        notes: formData.notes || undefined,
        
        // ✅ ที่อยู่ - ส่งแยกฟิลด์
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
        subdistrict_health_center: formData.subdistrict_health_center || undefined,
        
        emergency_contact_name: formData.emergency_contact_name || undefined,
        emergency_contact_phone: formData.emergency_contact_phone || undefined,
        emergency_contact_relationship: formData.emergency_contact_relationship || undefined,
        occupation: formData.occupation || undefined,
        education_level: formData.education_level || undefined,
        
        // ✅ สำคัญ: กำหนด pam_level เป็น 'L0' สำหรับผู้ป่วยใหม่ (ยังไม่ทำ screening)
        pam_level: 'L0',
        
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
    } catch (err) {
      console.error('Registration error:', err);
      setError('เกิดข้อผิดพลาดในการลงทะเบียน');
      setLoading(false);
    }
  };

  // =====================================================
  // ✅ แสดงหน้าสำเร็จ
  // =====================================================
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ลงทะเบียนสำเร็จ!</h2>
          <p className="text-gray-600 mb-4">กำลังไปยังหน้ารายการผู้ป่วย...</p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full animate-pulse w-full"></div>
          </div>
          <p className="text-sm text-gray-500 mt-4">กรุณารอสักครู่</p>
        </div>
      </div>
    );
  }

  // =====================================================
  // ⏳ แสดงหน้าโหลด
  // =====================================================
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // =====================================================
  // 📋 ฟอร์มลงทะเบียน
  // =====================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ลงทะเบียนผู้ป่วยใหม่
            </h1>
            <p className="text-gray-600">
              กรอกข้อมูลผู้ป่วยเพื่อสร้างบัญชีและโปรไฟล์
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">
        
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
                placeholder="ระบบจะสร้างอัตโนมัติ"  // ✅ เปลี่ยนจาก "会自动生成"
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
                placeholder="ระบบจะสร้างอัตโนมัติ"  // ✅ เปลี่ยนจาก "会自动生成"
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
                    <option key={day} value={day}>
                      {day}
                    </option>
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
                    <option key={index + 1} value={index + 1}>
                      {month}
                    </option>
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
                    <option key={year} value={year}>
                      {year}
                    </option>
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
                <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>  {/* ✅ เปลี่ยนใหม่ */}
                <option value="เบาหวาน">เบาหวาน</option>        {/* ✅ เปลี่ยนใหม่ */}
              </select>
            </div>

            {/* ✅ เพิ่มฟิลด์ค่าน้ำตาล */}
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

        {/* 4. ที่อยู่ - ใช้ ThaiAddressSelector */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            ที่อยู่
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* เลขที่ + ที่อยู่เพิ่มเติม */}
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

            {/* หมู่ที่/ชุมชน + หมู่บ้าน */}
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

            {/* ThaiAddressSelector */}
            <div className="md:col-span-2">
              <ThaiAddressSelector 
                onAddressChange={handleAddressChange}
              />
            </div>

            {/* รพสต */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🏥 รพสต (โรงพยาบาลส่งเสริมสุขภาพตำบล)
              </label>
              <input
                type="text"
                name="subdistrict_health_center"
                value={formData.subdistrict_health_center}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="เช่น รพสต.คลองเตย, รพสต.สุขใจ"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 กรอกชื่อโรงพยาบาลส่งเสริมสุขภาพตำบลที่ผู้ป่วยสังกัด
              </p>
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

        {/* 6. กำหนดโค้ช/หมอผู้ดูแล */}
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
                <option key={coach.id} value={coach.user_id}>
                  {coach.full_name_th} {coach.specialization_th ? `(${coach.specialization_th})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {/* Submit Button */}
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