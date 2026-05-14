// app/admin/staff/add/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  addStaff,
  getHospitalsWithHierarchy,
  getAccessibleHospitalIds,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import { generateDummyIdCard } from '@/lib/utils/generateDummyIdCard';
import {
  UserPlus, Calendar, Key, Save, ArrowLeft, Lock, Shield,
  Hospital, Building2, Phone, Mail, Stethoscope, AlertCircle, CheckCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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
  parent_hospital?: { id: string; name: string; code: string };
}

export default function AddStaffPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [generatedIdCard, setGeneratedIdCard] = useState('');

  const [formData, setFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'admin' | 'doctor' | 'helper' | 'osm',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
    admin_type: null as 'super' | 'hospital' | null,
  });

  const [showAdminTypeField, setShowAdminTypeField] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }

    setUser(userData);
    loadHospitals();
    loadAccessibleHospitals(userData.id);
  }, [router]);

  const loadHospitals = async () => {
    try {
      const data = await getHospitalsWithHierarchy();
      setHospitals(data);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) return '';
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleGenerateIdCard = () => {
    const newIdCard = generateDummyIdCard();
    setGeneratedIdCard(newIdCard);
    setFormData({ ...formData, id_card: newIdCard });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    if (!isSuperAdmin(user) && formData.role === 'admin') {
      alert('❌ คุณไม่มีสิทธิ์สร้างผู้ดูแลระบบใหม่');
      return;
    }

    if ((formData.role === 'admin' || formData.role === 'doctor' || formData.role === 'helper' || formData.role === 'osm') && !formData.hospital_id) {
      alert('กรุณาเลือกโรงพยาบาลสังกัด');
      return;
    }

    if (!isSuperAdmin(user) && formData.hospital_id && !accessibleHospitalIds.includes(formData.hospital_id)) {
      alert('❌ คุณไม่มีสิทธิ์สร้างเจ้าหน้าที่ในโรงพยาบาลนี้');
      return;
    }

    setLoading(true);

    try {
      const password = generatePassword();
      setGeneratedPassword(password);

      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const result = await addStaff({
        ...formData,
        password: password,
        birth_date: birthDate,
        created_by: user.id,
        admin_type: formData.role === 'admin' ? formData.admin_type : null,
      });

      if (result.success) {
        setShowSuccess(true);
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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
  const availableHospitals = isSuperAdmin(user) ? hospitals : hospitals.filter(h => accessibleHospitalIds.includes(h.id));
  const isSuper = isSuperAdmin(user);

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">เพิ่มบุคลากรสำเร็จ!</h2>
          
          <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2 mb-3">
              <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-1">รหัสผ่านชั่วคราว</p>
                <p className="text-2xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg">
                  {generatedPassword}
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-1">ID Card</p>
                <p className="text-xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg">
                  {generatedIdCard}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setShowSuccess(false);
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
                  admin_type: null,
                });
                setGeneratedPassword('');
                setGeneratedIdCard('');
              }}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition-all"
            >
              เพิ่มบุคลากรคนอื่น
            </button>
            <button
              onClick={() => router.push('/admin/staff')}
              className="w-full bg-gray-500 text-white font-bold py-3 rounded-xl hover:bg-gray-600 transition-all"
            >
              กลับหน้าจัดการเจ้าหน้าที่
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push('/admin/settings')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าตั้งค่า
          </button>
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">เพิ่มบุคลากรใหม่</h1>
          <p className="text-gray-600">กรอกข้อมูลเพื่อเพิ่มบุคลากรเข้าสู่ระบบ</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Permission Info Box */}
            <div className={`rounded-lg p-4 border ${isSuper ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Lock className={`w-4 h-4 ${isSuper ? 'text-purple-600' : 'text-blue-600'}`} />
                <h3 className="text-sm font-semibold text-gray-800">สิทธิ์การสร้างเจ้าหน้าที่</h3>
              </div>
              <ul className="text-sm text-gray-700 space-y-1">
                {isSuper ? (
                  <>
                    <li>👑 <strong>Super Admin:</strong> สร้างได้ทุกระดับ (Admin/Doctor/Helper/อสม.)</li>
                    <li>🏥 สามารถกำหนดโรงพยาบาลและประเภท Admin ได้</li>
                  </>
                ) : (
                  <>
                    <li>🏥 <strong>Hospital Admin:</strong> สร้างได้เฉพาะ แพทย์/เจ้าหน้าที่/อสม.</li>
                    <li>🔒 สร้างได้เฉพาะในโรงพยาบาลที่ตัวเองดูแล ({accessibleHospitalIds.length} แห่ง)</li>
                    <li>❌ ไม่สามารถสร้างผู้ดูแลระบบใหม่ได้</li>
                  </>
                )}
              </ul>
            </div>

            {/* ID Card & Password Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" />
                  ID Card / เลขบัตรประชาชน *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.id_card}
                    onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                    required
                    maxLength={13}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                    placeholder="13 หลัก"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateIdCard}
                    className="px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-sm font-semibold"
                    title="Generate ID Card แบบเรียง"
                  >
                    Generate
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  💡 คลิก Generate เพื่อสร้าง ID Card แบบรันเลขเรียง
                </p>
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
                ID Card ที่ใช้ในระบบ:
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
                  onChange={(e) => {
                    const newRole = e.target.value as 'admin' | 'doctor' | 'helper' | 'osm';
                    setFormData({ ...formData, role: newRole });
                    setShowAdminTypeField(newRole === 'admin' && isSuper);
                    if (newRole !== 'admin') {
                      setFormData(prev => ({ ...prev, admin_type: null }));
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                >
                  {isSuper && <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>}
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">👩‍⚕️ เจ้าหน้าที่</option>
                  <option value="osm">🏘️ อสม. (อาสาสมัครสาธารณสุข)</option>
                </select>
                {!isSuper && (
                  <p className="text-xs text-blue-600 mt-1">
                    ℹ️ Hospital Admin สามารถสร้างได้เฉพาะ แพทย์, เจ้าหน้าที่ และ อสม.
                  </p>
                )}
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
                  placeholder={formData.role === 'osm' ? 'เช่น อาสาสมัครสาธารณสุขประจำหมู่บ้าน' : formData.role === 'helper' ? 'เช่น เจ้าหน้าที่สาธารณสุข, พยาบาล' : 'เช่น อายุรกรรม, ศัลยกรรม'}
                />
              </div>
            </div>

            {/* Admin Type Field */}
            {showAdminTypeField && isSuper && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-purple-800 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" />
                  ประเภทผู้ดูแลระบบ *
                </label>
                <select
                  value={formData.admin_type || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    admin_type: (e.target.value as 'super' | 'hospital') || null 
                  })}
                  required
                  className="w-full px-4 py-3 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- เลือกประเภท --</option>
                  <option value="super">👑 Super Admin (เข้าถึงทั้งหมด)</option>
                  <option value="hospital">🏥 Hospital Admin (เข้าถึงเฉพาะโรงพยาบาล)</option>
                </select>
                <p className="text-xs text-purple-600 mt-1">
                  💡 Super Admin: เข้าถึงข้อมูลทั้งหมดในระบบ<br/>
                  💡 Hospital Admin: เข้าถึงเฉพาะโรงพยาบาลที่มอบหมาย
                </p>
              </div>
            )}

            {/* Hospital Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Hospital className="w-4 h-4 inline mr-1" />
                โรงพยาบาลสังกัด {formData.role !== 'admin' ? '*' : ''}
              </label>
              <select
                value={formData.hospital_id}
                onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                required={formData.role !== 'admin' || !isSuper}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
              >
                <option value="">-- เลือกโรงพยาบาล --</option>
                {availableHospitals.map((hospital) => (
                  <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                    <option value={hospital.id}>
                      └ {hospital.name} ({hospital.code}) - {hospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'}
                    </option>
                    {hospitalGroups.get(hospital.id)?.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {'   '}└─ {sub.name} ({sub.code})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                💡 แสดงโรงพยาบาลที่คุณมีสิทธิ์ ({availableHospitals.length} แห่ง)
              </p>
              {!isSuper && accessibleHospitalIds.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  🔒 จำกัดเฉพาะโรงพยาบาลในขอบเขตของคุณ
                </p>
              )}
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
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึกบุคลากร
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
                    <li>• รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด</li>
                    <li>• ID Card สามารถ Generate แบบรันเลขเรียงได้</li>
                    <li>• กรุณาแจ้งรหัสผ่านให้ผู้ใช้งานทราบหลังเพิ่มสำเร็จ</li>
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