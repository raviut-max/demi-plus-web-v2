// app/admin/staff/register/page.tsx
// ✅ หน้าลงทะเบียนบุคลากรแบบ Public (ไม่ต้องล็อกอิน)
// ✅ ใครก็เข้าได้ - รออนุมัติจาก Admin

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
  LogIn
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
}

export default function PublicRegisterPage() {
  const router = useRouter();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const [generatedPassword, setGeneratedPassword] = useState('');

  useEffect(() => {
    loadHospitals();
  }, []);

  const loadHospitals = async () => {
    try {
      const data = await getHospitalsWithHierarchy();
      setHospitals(data);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  // ✅ สร้างรหัสผ่านจากวันเกิด
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ ตรวจสอบว่ากรอกวันเกิดครบหรือไม่
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    setLoading(true);

    try {
      // ✅ สร้างรหัสผ่านจากวันเกิด
      const password = generatePassword();
      setGeneratedPassword(password);

      // ✅ แปลงวันเกิดเป็น ค.ศ.
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      // ✅ บันทึกไปยังตาราง pending_staff
      const { error } = await supabase
        .from('pending_staff')
        .insert({
          id_card: formData.id_card,
          password_hash: password,
          full_name_th: formData.full_name_th,
          role: formData.role,
          specialization_th: formData.specialization_th || null,
          phone: formData.phone || null,
          email: formData.email || null,
          hospital_id: formData.hospital_id || null,
          birth_date: birthDate,
          status: 'pending',
        });

      if (error) {
        console.error('Error submitting registration:', error);
        
        if (error.code === '23505') { // Unique violation
          alert('ID Card นี้ได้ลงทะเบียนไว้แล้ว กรุณารอการอนุมัติ');
        } else {
          alert('เกิดข้อผิดพลาด: ' + error.message);
        }
        return;
      }

      // ✅ แสดงหน้าสำเร็จ
      setSubmitted(true);
      
    } catch (error) {
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setLoading(false);
    }
  };

  // ✅ จัดกลุ่มโรงพยาบาลแบบ Hierarchical
  const getGroupedHospitals = () => {
    const mainHospitals = hospitals.filter(h => h.type === 'main');
    const subHospitals = hospitals.filter(h => h.type === 'sub');
    
    const hospitalGroups = new Map<string, Hospital[]>();
    
    subHospitals.forEach(sub => {
      if (sub.parent_id) {
        if (!hospitalGroups.has(sub.parent_id)) {
          hospitalGroups.set(sub.parent_id, []);
        }
        hospitalGroups.get(sub.parent_id)!.push(sub);
      }
    });

    return { mainHospitals, hospitalGroups };
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  // ✅ หน้าสำเร็จ - แสดงรหัสผ่าน
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            ลงทะเบียนสำเร็จ!
          </h2>
          
          <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-2">
                  รหัสผ่านชั่วคราวของคุณ
                </p>
                <p className="text-2xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg">
                  {generatedPassword}
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  💡 รหัสผ่านนี้สร้างจากวันเกิด (วัน-เดือน-ปี พ.ศ.)<br/>
                  <span className="font-semibold">กรุณาจำรหัสผ่านนี้ไว้สำหรับเข้าสู่ระบบ</span>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-700">
                <p className="font-semibold mb-1">สถานะการลงทะเบียน:</p>
                <ul className="space-y-1">
                  <li>• ข้อมูลของคุณถูกบันทึกแล้ว</li>
                  <li>• รอการอนุมัติจากผู้ดูแลระบบ</li>
                  <li>• คุณสามารถเข้าสู่ระบบได้หลังจากได้รับการอนุมัติ</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push('/admin/login')}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              กลับหน้าเข้าสู่ระบบ
            </button>
            
            <button
              onClick={() => {
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
              className="w-full bg-gray-500 text-white font-bold py-3 rounded-xl hover:bg-gray-600 transition-all"
            >
              ลงทะเบียนบุคคลอื่น
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ ฟอร์มลงทะเบียน
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push('/admin/login')}
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

        {/* Form */}
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 cursor-not-allowed font-mono"
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
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                ชื่อ-นามสกุล *
              </label>
              <input
                type="text"
                value={formData.full_name_th}
                onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                >
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">👩‍ เจ้าหน้าที่</option>
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
                  onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น อายุรกรรม, ศัลยกรรม"
                />
              </div>
            </div>

            {/* Hospital Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" />
                โรงพยาบาลสังกัด
              </label>
              <select
                value={formData.hospital_id}
                onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังลงทะเบียน...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  ส่งคำขอลงทะเบียน
                </>
              )}
            </button>

            {/* Info */}
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