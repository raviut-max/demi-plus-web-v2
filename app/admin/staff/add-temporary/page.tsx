'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  addStaff,
  getHospitalsWithHierarchy,
  getAccessibleHospitalIds,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import {
  UserPlus, Calendar, Key, Save, ArrowLeft, Shield,
  Hospital, AlertCircle, CheckCircle, Clock
} from 'lucide-react';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// 🔢 ฟังก์ชันสร้างเลขบัตร 13 หลักที่ผ่าน Checksum ไทย
function generateValidTempThaiId(): string {
  // ขึ้นต้น 99 เพื่อระบุว่าเป็น Temporary/ทดสอบ + สุ่ม 10 หลักกลาง
  const prefix = [9, 9];
  const middle = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
  const first12 = [...prefix, ...middle];
  
  // คำนวณ Check Digit ตามมาตรฐานกระทรวงมหาดไทย
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += first12[i] * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return first12.join('') + checkDigit.toString();
}

export default function AddTemporaryStaffPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [generatedIdCard, setGeneratedIdCard] = useState('');

  const [formData, setFormData] = useState({
    full_name_th: '',
    role: 'osm' as 'osm' | 'helper' | 'doctor',
    birth_day: '01',
    birth_month: '01',
    birth_year: '2501',
    hospital_id: '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
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
    } catch (error) { console.error('Error loading hospitals:', error); }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
    } catch (error) { console.error('Error loading accessible hospitals:', error); }
  };

  const generatePassword = () => {
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name_th.trim()) { alert('กรุณากรอกชื่อ-นามสกุล'); return; }
    if (!formData.hospital_id) { alert('กรุณาเลือกโรงพยาบาลสังกัด'); return; }

    setLoading(true);
    try {
      const password = generatePassword();
      setGeneratedPassword(password);
      
      // สร้างเลขชั่วคราวที่ผ่าน Checksum
      const newTempId = generateValidTempThaiId();
      setGeneratedIdCard(newTempId);

      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      // ส่งข้อมูลไป addStaff (ต้องปรับ query.ts ให้รับ is_temporary_id ด้วย)
      const result = await addStaff({
        id_card: newTempId,
        full_name_th: formData.full_name_th,
        role: formData.role,
        hospital_id: formData.hospital_id,
        birth_date: birthDate,
        password: password,
        created_by: user.id,
        // 🚩 ฟิลด์ชั่วคราว
        is_temporary_id: true,
        temp_id_notes: 'บัญชีชั่วคราว รอดำเนินการยืนยันเลขบัตรจริง',
      });

      if (result.success) setShowSuccess(true);
      else alert('เกิดข้อผิดพลาด: ' + result.error);
    } catch (error: any) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const availableHospitals = isSuperAdmin(user) 
    ? hospitals 
    : hospitals.filter(h => accessibleHospitalIds.includes(h.id));

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-100 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">สร้างบัญชีชั่วคราวสำเร็จ!</h2>
          
          <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2 mb-3">
              <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-1">เลขบัตรชั่วคราว (ผ่าน Checksum)</p>
                <p className="text-2xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg tracking-wider">
                  {generatedIdCard}
                </p>
                <p className="text-xs text-blue-600 mt-1">💡 สามารถใช้ Login ได้ทันที รอดำเนินการแก้ไขเป็นเลขจริง</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-1">รหัสผ่าน</p>
                <p className="text-xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg">
                  {generatedPassword}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push(`/admin/staff`)}
              className="w-full bg-amber-500 text-white font-bold py-3 rounded-xl hover:bg-amber-600 transition-all"
            >
              กลับไปจัดการบัญชี
            </button>
            <button
              onClick={() => {
                setShowSuccess(false);
                setFormData(prev => ({ ...prev, full_name_th: '', hospital_id: '' }));
                setGeneratedIdCard('');
                setGeneratedPassword('');
              }}
              className="w-full bg-gray-200 text-gray-800 font-bold py-3 rounded-xl hover:bg-gray-300 transition-all"
            >
              สร้างอสม.ชั่วคราวคนถัดไป
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-100 to-yellow-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <button onClick={() => router.push('/admin/settings')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 mx-auto">
            <ArrowLeft className="w-4 h-4" /> กลับหน้าตั้งค่า
          </button>
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">เพิ่มอสม./บุคลากรชั่วคราว</h1>
          <p className="text-gray-600">กรอกเฉพาะชื่อและโรงพยาบาล ระบบจะสร้างเลขบัตรชั่วคราวที่ตรวจสอบได้ให้โดยอัตโนมัติ</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Temp ID Preview */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-blue-800">เลขบัตรชั่วคราว (ระบบสร้างอัตโนมัติ)</h3>
              </div>
              <div className="bg-white rounded-lg p-3 font-mono text-xl font-bold text-blue-700 tracking-wider text-center border border-blue-200">
                99XXXXXXXXXXX
              </div>
              <p className="text-xs text-blue-600 mt-2">✅ ผ่านการตรวจสอบ Checksum ไทย ใช้ Login ได้ทันที</p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อ-นามสกุล (ภาษาไทย) *</label>
              <input
                type="text"
                value={formData.full_name_th}
                onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                placeholder="เช่น สมหญิง รักสุขภาพ"
              />
            </div>

            {/* Role & Hospital */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">บทบาท</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="osm">🏘️ อสม. (อาสาสมัครสาธารณสุข)</option>
                  <option value="helper">👩‍⚕️ เจ้าหน้าที่/ผู้ช่วย</option>
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">โรงพยาบาลสังกัด *</label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>
                  {availableHospitals.map(h => (
                    <option key={h.id} value={h.id}>{h.name} ({h.code})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Birth Date (Default 01-01-2501) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" /> วันเกิด *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  value={formData.birth_day}
                  onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                  required
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  value={formData.birth_month}
                  onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })}
                  required
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">เดือน</option>
                  {THAI_MONTHS.map((m, i) => (
                    <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>
                  ))}
                </select>
                <select
                  value={formData.birth_year}
                  onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
                  required
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => String(2567 - i)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">💡 รหัสผ่านจะสร้างอัตโนมัติจาก วัน-เดือน-ปีเกิด</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-4 rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> กำลังสร้างบัญชี...</>
              ) : (
                <><Save className="w-5 h-5" /> สร้างอสม.ชั่วคราว</>
              )}
            </button>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-700">
                  <p className="font-semibold mb-1">หมายเหตุ:</p>
                  <ul className="space-y-1">
                    <li>• บัญชีนี้จะถูกระบุเป็น `Temporary` ในระบบ</li>
                    <li>• สามารถเข้าใช้ระบบได้ทันทีด้วยรหัสผ่านวันเกิด</li>
                    <li>• ต้องดำเนินการแก้ไขเลขบัตรเป็นเลขจริงภายหลังผ่านเมนูจัดการเจ้าหน้าที่</li>
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