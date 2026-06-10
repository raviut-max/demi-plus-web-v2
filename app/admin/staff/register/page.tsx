// app/admin/staff/register/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getHospitalsWithHierarchy } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  UserPlus, Calendar, Key, Save, ArrowLeft, User, Phone, Mail,
  Building2, Stethoscope, Shield, CheckCircle, AlertCircle, LogIn, Loader2
} from 'lucide-react';

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

// ประเภทสถานะการตรวจสอบ ID Card
type CheckStatus = 'idle' | 'checking' | 'available' | 'pending_approval' | 'ghost_approved' | 'already_staff';

export default function PublicRegisterPage() {
  const router = useRouter();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  // สถานะใหม่สำหรับตรวจสอบ ID Card ล่วงหน้า
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle');
  const [checkMessage, setCheckMessage] = useState('');

  const [formData, setFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'doctor' | 'helper' | 'osm',
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

  // ✅ ฟังก์ชันตรวจสอบ ID Card แบบ Real-time
  const checkExistingStaff = async (idCard: string) => {
    if (idCard.length !== 13) {
      setCheckStatus('idle');
      setCheckMessage('');
      return;
    }

    setCheckStatus('checking');
    
    try {
      // ตรวจสอบทั้ง 2 ตารางพร้อมกัน
      const [pendingRes, usersRes] = await Promise.all([
        supabase.from('pending_staff').select('status, full_name_th').eq('id_card', idCard).single(),
        supabase.from('users').select('full_name_th, role').eq('id_card', idCard).single()
      ]);

      const hasPending = !pendingRes.error && pendingRes.data;
      const hasUser = !usersRes.error && usersRes.data;

      if (hasUser) {
        // กรณีที่ 1: เป็นบุคลากรอยู่แล้ว
        setCheckStatus('already_staff');
        setCheckMessage(` บุคลากร "${usersRes.data.full_name_th}" (${usersRes.data.role}) มีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบหรือติดต่อ Admin`);
      } else if (hasPending) {
        if (pendingRes.data.status === 'approved') {
          // กรณีที่ 2: อนุมัติแล้วแต่ไม่มีใน users (Ghost Record)
          setCheckStatus('ghost_approved');
          setCheckMessage(`⚠️ ไอดีนี้เคยได้รับการอนุมัติแล้ว (ชื่อ: ${pendingRes.data.full_name_th}) แต่ไม่พบรายชื่อในตารางบุคลากร 
          
💡 ข้อมูลเดิมอาจสูญหายระหว่างทาง คุณสามารถกด "ส่งคำขอลงทะเบียน" เพื่อสร้างรายการใหม่ได้เลย`);
        } else {
          // กรณีที่ 3: ยังรออนุมัติอยู่
          setCheckStatus('pending_approval');
          setCheckMessage(`⏳ ไอดี "${pendingRes.data.full_name_th}" กำลังรอการอนุมัติจาก Admin อยู่ กรุณารอผลการพิจารณา`);
        }
      } else {
        // กรณีปกติ: ใช้งานได้
        setCheckStatus('available');
        setCheckMessage('✅ ไอดีนี้สามารถลงทะเบียนได้');
      }
    } catch (err) {
      console.error('Check error:', err);
      setCheckStatus('idle');
    }
  };

  // Trigger เมื่อพิมพ์ ID Card ครบ 13 หลัก
  useEffect(() => {
    if (formData.id_card.length === 13) {
      checkExistingStaff(formData.id_card);
    } else {
      setCheckStatus('idle');
      setCheckMessage('');
    }
  }, [formData.id_card]);

  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) return '';
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      alert('กรุณากรอกวันเกิดให้ครบถ้วน');
      return;
    }

    // ป้องกันการส่งถ้ายังเช็คไม่เสร็จ หรือเป็นเคสที่ต้องระวัง (ยกเว้น ghost_approved ที่เราอนุญาตให้ส่งต่อได้)
    if (checkStatus === 'checking') {
      alert('กำลังตรวจสอบข้อมูล กรุณารอสักครู่...');
      return;
    }
    
    if (checkStatus === 'already_staff') {
      if (!confirm('บุคคลนี้มีอยู่ในระบบบุคลากรแล้ว คุณต้องการดำเนินการต่อหรือไม่? (แนะนำให้ติดต่อ Admin แทน)')) {
        return;
      }
    }

    setLoading(true);

    try {
      const password = generatePassword();
      setGeneratedPassword(password);

      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const { error } = await supabase.from('pending_staff').insert({
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
        
        if (error.code === '23505') {
          // Fallback ถ้ามีคนแทรกก่อนหน้าตอนเรากำลังเช็ค
          alert('ID Card นี้เพิ่งถูกใช้งานโดยผู้อื่น กรุณารีเฟรชหน้าและลองใหม่อีกครั้ง');
        } else if (error.message.includes('invalid input value for enum')) {
          alert('เกิดข้อผิดพลาด: ระบบยังไม่รองรับบทบาทนี้ กรุณาติดต่อผู้ดูแลระบบ');
        } else {
          alert('เกิดข้อผิดพลาด: ' + error.message);
        }
        return;
      }

      setSubmitted(true);
      
    } catch (error) {
      console.error('Error:', error);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน');
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
        if (!hospitalGroups.has(sub.parent_id)) hospitalGroups.set(sub.parent_id, []);
        hospitalGroups.get(sub.parent_id)!.push(sub);
      }
    });
    return { mainHospitals, hospitalGroups };
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  // สีพื้นหลังตามสถานะการตรวจสอบ
  const getStatusColor = () => {
    switch (checkStatus) {
      case 'checking': return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'available': return 'bg-green-50 text-green-700 border-green-200';
      case 'pending_approval': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'ghost_approved': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'already_staff': return 'bg-red-50 text-red-700 border-red-200';
      default: return '';
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">ลงทะเบียนสำเร็จ!</h2>
          
          <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-800 mb-2">รหัสผ่านชั่วคราวของคุณ</p>
                <p className="text-2xl font-mono font-bold text-blue-700 text-center py-2 bg-white rounded-lg">{generatedPassword}</p>
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
            <button onClick={() => router.push('/admin/login')} className="w-full bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
              <LogIn className="w-5 h-5" /> กลับหน้าเข้าสู่ระบบ
            </button>
            <button onClick={() => {
              setSubmitted(false);
              setCheckStatus('idle');
              setCheckMessage('');
              setFormData({ id_card: '', birth_day: '', birth_month: '', birth_year: '', full_name_th: '', role: 'doctor', specialization_th: '', phone: '', email: '', hospital_id: '' });
              setGeneratedPassword('');
            }} className="w-full bg-gray-500 text-white font-bold py-3 rounded-xl hover:bg-gray-600 transition-all">
              ลงทะเบียนบุคคลอื่น
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <button onClick={() => router.push('/admin/login')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 mx-auto">
            <ArrowLeft className="w-4 h-4" /> กลับหน้าเข้าสู่ระบบ
          </button>
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">ลงทะเบียนบุคลากรใหม่</h1>
          <p className="text-gray-600">กรอกข้อมูลเพื่อรอการอนุมัติจากผู้ดูแลระบบ</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* ✅ แถบแสดงผลการตรวจสอบ ID Card */}
          {checkMessage && (
            <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${getStatusColor()} transition-all duration-300`}>
              {checkStatus === 'checking' ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0 mt-0.5" />
              ) : checkStatus === 'available' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm whitespace-pre-line leading-relaxed">{checkMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" /> ID Card / เลขบัตรประชาชน *
                </label>
                <input
                  type="text"
                  value={formData.id_card}
                  onChange={(e) => setFormData({ ...formData, id_card: e.target.value.replace(/\D/g, '').slice(0, 13) })}
                  required
                  maxLength={13}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 transition-colors ${
                    checkStatus === 'already_staff' ? 'border-red-300 bg-red-50' : 
                    checkStatus === 'available' ? 'border-green-300 bg-green-50' : 
                    'border-gray-300'
                  }`}
                  placeholder="13 หลัก"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Key className="w-4 h-4 inline mr-1" /> รหัสผ่าน (อัตโนมัติ)
                </label>
                <input
                  type="text"
                  value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                  readOnly
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 cursor-not-allowed font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" /> วันเกิด *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select value={formData.birth_day} onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })} required className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="">วัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (<option key={day} value={day}>{day}</option>))}
                </select>
                <select value={formData.birth_month} onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })} required className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="">เดือน</option>
                  {THAI_MONTHS.map((month, index) => (<option key={index + 1} value={index + 1}>{month}</option>))}
                </select>
                <select value={formData.birth_year} onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })} required className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="">ปี พ.ศ.</option>
                  {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (<option key={year} value={year}>{year}</option>))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" /> ชื่อ-นามสกุล *
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Shield className="w-4 h-4 inline mr-1" /> บทบาท *
                </label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as 'doctor' | 'helper' | 'osm' })} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500">
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">‍💼 เจ้าหน้าที่</option>
                  <option value="osm">🏘️ อสม. (อาสาสมัครสาธารณสุข)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Stethoscope className="w-4 h-4 inline mr-1" /> ความเชี่ยวชาญ
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" /> โรงพยาบาลสังกัด
              </label>
              <select value={formData.hospital_id} onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto">
                <option value="">-- เลือกโรงพยาบาล --</option>
                {mainHospitals.map((hospital) => (
                  <optgroup key={hospital.id} label={`🏥 ${hospital.name} (${hospital.code})`}>
                    <option value={hospital.id}>└ {hospital.name} ({hospital.code}) - แม่ข่าย</option>
                    {hospitalGroups.get(hospital.id)?.map((sub) => (
                      <option key={sub.id} value={sub.id}>{'   '}└─ {sub.name} ({sub.code})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-1" /> เบอร์โทรศัพท์
                </label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="0812345678" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-1" /> อีเมล
                </label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" placeholder="email@example.com" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || checkStatus === 'checking'}
              className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                checkStatus === 'already_staff' 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
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