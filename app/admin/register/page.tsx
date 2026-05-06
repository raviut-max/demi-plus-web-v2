// app/admin/register/page.tsx
// =====================================================
// ✅ หน้าลงทะเบียนบุคลากรแบบ Public (รออนุมัติ)
// ✅ ไม่ต้องล็อกอิน → ส่งข้อมูลไปรอใน pending_staff
// ✅ แก้ไขล่าสุด: 2 พฤษภาคม 2569
// =====================================================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  UserPlus,
  Calendar,
  Key,
  Save,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Building2,
  Stethoscope,
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

// =====================================================
// 📅 ค่าคงที่: เดือนภาษาไทย
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
  'ธันวาคม'
];

// =====================================================
// 🔧 Interfaces
// =====================================================
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

interface HospitalGroups {
  mainHospitals: Hospital[];
  hospitalGroups: Map<string, Hospital[]>;
}

// =====================================================
// 🎯 Main Component
// =====================================================
export default function PublicRegisterPage() {
  const router = useRouter();

  // ✅ States สำหรับข้อมูล
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // ✅ States สำหรับฟอร์ม
  const [formData, setFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'doctor' | 'helper' | 'admin',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
  });

  // ✅ Debug: Log เมื่อ component mount
  useEffect(() => {
    console.log('🔍 [PublicRegisterPage] Component mounted');
    loadHospitals();
  }, []);

  // =====================================================
  // 📥 Functions: โหลดข้อมูล
  // =====================================================

  /**
   * โหลดรายการโรงพยาบาลแบบ Hierarchical
   */
  const loadHospitals = async () => {
    try {
      console.log('🏥 [loadHospitals] Fetching hospitals with hierarchy...');
      
      const data = await getHospitalsWithHierarchy();
      
      console.log('✅ [loadHospitals] Loaded:', data.length, 'hospitals');
      console.log('📊 [loadHospitals] Sample:', data[0]);
      
      setHospitals(data);
    } catch (error) {
      console.error('❌ [loadHospitals] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  // =====================================================
  // 🔐 Functions: รหัสผ่าน
  // =====================================================

  /**
   * สร้างรหัสผ่านจากวันเกิด (dd-mm-yyyy)
   */
  const generatePassword = (): string => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    
    const password = `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
    console.log('🔐 [generatePassword] Generated:', password);
    
    return password;
  };

  // =====================================================
  // 📝 Functions: จัดการฟอร์ม
  // =====================================================

  /**
   * จัดกลุ่มโรงพยาบาลแบบ Hierarchical (แม่ข่าย → ลูกข่าย)
   */
  const getGroupedHospitals = (): HospitalGroups => {
    console.log('🏥 [getGroupedHospitals] Grouping hospitals...');
    
    const mainHospitals = hospitals.filter(h => h.type === 'main');
    const subHospitals = hospitals.filter(h => h.type === 'sub');
    
    console.log('📊 [getGroupedHospitals] Main:', mainHospitals.length, 'Sub:', subHospitals.length);
    
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

  /**
   * Handle Form Submit
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('📝 [handleSubmit] Form submitted');
    console.log('📋 [handleSubmit] Form data:', formData);
    
    // ✅ Validate: วันเกิดต้องครบ
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      console.error('❌ [handleSubmit] Birth date incomplete');
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    // ✅ Validate: ID Card ต้อง 13 หลัก
    if (formData.id_card.length !== 13) {
      console.error('❌ [handleSubmit] ID Card length invalid:', formData.id_card.length);
      alert('เลขบัตรประชาชนต้อง 13 หลัก');
      return;
    }

    // ✅ Validate: ชื่อ-นามสกุล
    if (!formData.full_name_th.trim()) {
      console.error('❌ [handleSubmit] Name is empty');
      alert('กรุณากรอกชื่อ-นามสกุล');
      return;
    }

    setLoading(true);

    try {
      // ✅ 1. สร้างรหัสผ่านจากวันเกิด
      const password = generatePassword();
      setGeneratedPassword(password);
      console.log('🔐 [handleSubmit] Password:', password);

      // ✅ 2. แปลงวันเกิดเป็น ค.ศ.
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;
      console.log('📅 [handleSubmit] Birth date (AD):', birthDate);

      // ✅ 3. บันทึกไปยังตาราง pending_staff
      console.log('💾 [handleSubmit] Inserting to pending_staff...');
      
      const { data, error } = await supabase
        .from('pending_staff')
        .insert({
          id_card: formData.id_card,
          password_hash: password, // เก็บ plain text ชั่วคราว (Admin จะ hash อีกทีตอนอนุมัติ)
          full_name_th: formData.full_name_th,
          role: formData.role,
          specialization_th: formData.specialization_th || null,
          phone: formData.phone || null,
          email: formData.email || null,
          hospital_id: formData.hospital_id || null,
          birth_date: birthDate,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('❌ [handleSubmit] Supabase error:', error);
        
        // ✅ Handle Unique violation (ID Card ซ้ำ)
        if (error.code === '23505') {
          console.error('❌ [handleSubmit] Duplicate ID Card');
          alert('ID Card นี้ได้ลงทะเบียนไว้แล้ว กรุณารอการอนุมัติ');
        } else {
          alert('เกิดข้อผิดพลาด: ' + error.message);
        }
        return;
      }

      console.log('✅ [handleSubmit] Registration successful:', data);

      // ✅ 4. แสดงหน้าสำเร็จ
      setSubmitted(true);
      
    } catch (error) {
      console.error('❌ [handleSubmit] Exception:', error);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setLoading(false);
      console.log('✅ [handleSubmit] Process completed');
    }
  };

  // =====================================================
  // 🎨 Render: หน้าสำเร็จ
  // =====================================================
  if (submitted) {
    console.log('✅ [Render] Showing success page');
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          {/* ✅ Icon */}
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>

          {/* ✅ Title */}
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            ลงทะเบียนสำเร็จ!
          </h2>
          
          {/* ✅ Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-800 mb-2">
                  ข้อมูลของคุณถูกบันทึกแล้ว
                </p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• รอการอนุมัติจากผู้ดูแลระบบ</li>
                  <li>• คุณจะได้รับการแจ้งเตือนเมื่ออนุมัติ</li>
                  <li>• รหัสผ่านชั่วคราว: <strong className="font-mono">{generatedPassword}</strong></li>
                </ul>
              </div>
            </div>
          </div>

          {/* ✅ Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => router.push('/admin/login')}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              กลับหน้าเข้าสู่ระบบ
            </button>
            
            <button
              onClick={() => {
                console.log('🔄 [Reset] Form reset');
                setSubmitted(false);
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
              className="w-full bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ลงทะเบียนบุคคลอื่น
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =====================================================
  // 🎨 Render: ฟอร์มลงทะเบียน
  // =====================================================
  const { mainHospitals, hospitalGroups } = getGroupedHospitals();
  
  console.log('🎨 [Render] Rendering form');
  console.log('🏥 [Render] Hospitals:', hospitals.length);
  console.log('🏥 [Render] Main hospitals:', mainHospitals.length);
  console.log('🏥 [Render] Hospital groups:', hospitalGroups.size);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        
        {/* ✅ Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => {
              console.log('🔙 [Back] Navigate to login');
              router.push('/admin/login');
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าเข้าสู่ระบบ
          </button>

          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            ลงทะเบียนบุคลากรใหม่
          </h1>
          <p className="text-gray-600">
            กรอกข้อมูลเพื่อรอการอนุมัติจากผู้ดูแลระบบ
          </p>
        </div>

        {/* ✅ Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 1. ID Card & Password Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  ID Card / เลขบัตรประชาชน *
                </label>
                <input
                  type="text"
                  value={formData.id_card}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 13);
                    setFormData({ ...formData, id_card: value });
                    console.log('📝 [Input] ID Card:', value);
                  }}
                  required
                  maxLength={13}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="13 หลัก"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Key className="w-4 h-4 inline mr-1" />
                  รหัสผ่าน (อัตโนมัติ)
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

            {/* 2. Birth Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                วันเกิด *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={formData.birth_day}
                  onChange={(e) => {
                    setFormData({ ...formData, birth_day: e.target.value });
                    console.log('📝 [Input] Birth day:', e.target.value);
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, birth_month: e.target.value });
                    console.log('📝 [Input] Birth month:', e.target.value);
                  }}
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
                  onChange={(e) => {
                    setFormData({ ...formData, birth_year: e.target.value });
                    console.log('📝 [Input] Birth year:', e.target.value);
                  }}
                  required
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                ชื่อ-นามสกุล *
              </label>
              <input
                type="text"
                value={formData.full_name_th}
                onChange={(e) => {
                  setFormData({ ...formData, full_name_th: e.target.value });
                  console.log('📝 [Input] Full name:', e.target.value);
                }}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น สมชาย ใจดี"
              />
            </div>

            {/* 4. Role & Specialization */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" />
                  บทบาท *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => {
                    setFormData({ ...formData, role: e.target.value as 'doctor' | 'helper' | 'admin' });
                    console.log('📝 [Input] Role:', e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="doctor">👨‍️ แพทย์</option>
                  <option value="helper">👩‍💼 เจ้าหน้าที่</option>
                  <option value="admin">👑 ผู้ดูแลระบบ</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Stethoscope className="w-4 h-4 inline mr-1" />
                  ความเชี่ยวชาญ
                </label>
                <input
                  type="text"
                  value={formData.specialization_th}
                  onChange={(e) => {
                    setFormData({ ...formData, specialization_th: e.target.value });
                    console.log('📝 [Input] Specialization:', e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น อายุรกรรม, ศัลยกรรม"
                />
              </div>
            </div>

            {/* 5. Hospital Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                โรงพยาบาลสังกัด
              </label>
              <select
                value={formData.hospital_id}
                onChange={(e) => {
                  setFormData({ ...formData, hospital_id: e.target.value });
                  console.log('📝 [Input] Hospital:', e.target.value);
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
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
              {hospitals.length === 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  ⚠️ ยังไม่มีข้อมูลโรงพยาบาลในระบบ
                </p>
              )}
            </div>

            {/* 6. Phone & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-1" />
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    console.log('📝 [Input] Phone:', e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    console.log('📝 [Input] Email:', e.target.value);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {/* 7. Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังลงทะเบียน...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  ส่งคำขอลงทะเบียน
                </>
              )}
            </button>

            {/* 8. Info Box */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-700">
                  <p className="font-semibold mb-1">หมายเหตุสำคัญ:</p>
                  <ul className="space-y-1">
                    <li>• ข้อมูลของคุณจะถูกส่งไปรอการอนุมัติ</li>
                    <li>• Admin จะตรวจสอบและอนุมัติภายใน 1-3 วันทำการ</li>
                    <li>• กรุณาจำรหัสผ่านชั่วคราวไว้สำหรับเข้าสู่ระบบ</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}