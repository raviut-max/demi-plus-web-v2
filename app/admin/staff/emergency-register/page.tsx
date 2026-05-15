// app/admin/staff/emergency-register/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  getHospitalsWithHierarchy,
  generateAndReserveIdCard,
  validateThaiIdCard
} from '@/lib/supabase/queries';
import {
  ArrowLeft, UserPlus, Save, X, AlertCircle,
  CheckCircle, Building2, Calendar, CreditCard,
  User, Phone, Mail, Shield, Stethoscope, Heart
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

export default function EmergencyRegisterPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [formData, setFormData] = useState({
    id_card: '',
    full_name_th: '',
    role: 'doctor' as 'doctor' | 'helper' | 'osm' | 'admin',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
    birth_date: '2511-01-01', // Default: 01-01-2511
    password: '',
    admin_type: null as 'super' | 'hospital' | null,
  });

  const [generatedData, setGeneratedData] = useState({
    id_card: '',
    password: '',
  });

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
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadHospitals();
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    const hospitalInfo = await getUserHospitalInfo(userId);
    setUserHospital(hospitalInfo);
  };

  const loadAccessibleHospitals = async (userId: string) => {
    const ids = await getAccessibleHospitalIds(userId);
    setAccessibleHospitalIds(ids);
  };

  const loadHospitals = async () => {
    const data = await getHospitalsWithHierarchy();
    setHospitals(data);
  };

  // ✅ Generate ID Card อัตโนมัติ
  const handleGenerateIdCard = async () => {
    try {
      setLoading(true);
      
      // เลือก sequence type ตาม role
      const sequenceType = formData.role === 'osm' ? 'osm' : 'staff';
      const prefix = formData.role === 'osm' ? '3' : '2'; // 3 = OSM, 2 = Staff
      
      const result = await generateAndReserveIdCard(
        sequenceType as any,
        prefix,
        '1000' // Default province code (Bangkok)
      );

      if (result.success && result.idCard) {
        const idCard = result.idCard;
        // Generate password จาก ID Card (6 หลักสุดท้าย)
        const password = idCard.slice(-6);
        
        setFormData(prev => ({
          ...prev,
          id_card: idCard,
          password: password,
        }));
        
        setGeneratedData({
          id_card: idCard,
          password: password,
        });

        alert(`✅ สร้างบัตรประชาชนสำเร็จ!\nเลขบัตร: ${idCard}\nรหัสผ่าน: ${password}`);
      } else {
        alert('❌ ไม่สามารถสร้างบัตรประชาชนได้: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error generating ID:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ บันทึกข้อมูลแบบเร่งด่วน
  const handleEmergencyRegister = async () => {
    if (!formData.full_name_th) {
      alert('กรุณากรอกชื่อ-นามสกุล');
      return;
    }
    if (!formData.id_card) {
      alert('กรุณากดสร้างบัตรประชาชนก่อน');
      return;
    }
    if (!formData.hospital_id) {
      alert('กรุณาเลือกโรงพยาบาล');
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmRegister = async () => {
    try {
      setLoading(true);
      setShowConfirmModal(false);

      // ✅ 1. สร้าง user ในตาราง users (approved ทันที)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id_card: formData.id_card,
          password_hash: formData.password,
          role: formData.role,
          is_active: true,
          hospital_id: formData.hospital_id,
          birth_date: formData.birth_date, // 01-01-2511
          admin_type: formData.role === 'admin' ? formData.admin_type : null,
          created_by: user.id,
        })
        .select()
        .single();

      if (userError) throw userError;

      // ✅ 2. สร้าง record ในตาราง doctors (สำหรับ doctor/helper/osm)
      if (['doctor', 'helper', 'osm'].includes(formData.role)) {
        await supabase
          .from('doctors')
          .insert({
            user_id: userData.id,
            full_name: formData.full_name_th,
            full_name_th: formData.full_name_th,
            specialization_th: formData.specialization_th || (
              formData.role === 'osm' ? 'อาสาสมัครสาธารณสุข' :
              formData.role === 'helper' ? 'เจ้าหน้าที่สาธารณสุข' :
              'แพทย์'
            ),
            phone: formData.phone,
            email: formData.email,
            is_active: true,
            is_verified: true, // ✅ Verified ทันที
          });
      }

      // ✅ 3. บันทึก ID Card Assignment
      await supabase
        .from('id_card_assignments')
        .insert({
          id_card: formData.id_card,
          hospital_id: formData.hospital_id,
          assigned_by: user.id,
          notes: 'ลงทะเบียนเร่งด่วน (Emergency Registration)',
          status: 'active',
        });

      alert(`✅ ลงทะเบียนเร่งด่วนสำเร็จ!
        
ชื่อ: ${formData.full_name_th}
บัตรประชาชน: ${formData.id_card}
รหัสผ่าน: ${formData.password}
วันเกิด: 01-01-2511

✅ บัญชีพร้อมใช้งานทันที!`);

      // Reset form
      setFormData({
        id_card: '',
        full_name_th: '',
        role: 'doctor',
        specialization_th: '',
        phone: '',
        email: '',
        hospital_id: '',
        birth_date: '2511-01-01',
        password: '',
        admin_type: null,
      });
      setGeneratedData({ id_card: '', password: '' });

    } catch (error: any) {
      console.error('Error emergency register:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableHospitals = () => {
    if (isSuperAdmin(user)) return hospitals;
    return hospitals.filter(h => accessibleHospitalIds.includes(h.id));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังดำเนินการ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/staff')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าจัดการเจ้าหน้าที่
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-red-600 mb-2 flex items-center gap-2">
                <AlertCircle className="w-8 h-8" />
                ลงทะเบียนเร่งด่วน
              </h1>
              <p className="text-gray-600">
                สร้างบัญชีเจ้าหน้าที่แบบเร่งด่วน พร้อมใช้งานทันที
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Emergency Alert */}
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">โหมดลงทะเบียนเร่งด่วน</h3>
              <ul className="text-sm text-red-700 mt-1 space-y-1">
                <li>• ระบบจะสร้างบัตรประชาชนอัตโนมัติ</li>
                <li>• กำหนดวันเกิดเป็น 01-01-2511</li>
                <li>• บัญชีจะถูกอนุมัติและเปิดใช้งานทันที</li>
                <li>• ไม่ต้องรออนุมัติจาก Admin</li>
              </ul>
            </div>
          </div>
        </div>

        <form className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          {/* Step 1: Generate ID Card */}
          <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              ขั้นตอนที่ 1: สร้างบัตรประชาชน
            </h3>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGenerateIdCard}
                disabled={loading || !!formData.id_card}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-all font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                {formData.id_card ? 'สร้างแล้ว' : 'สร้างบัตรประชาชนอัตโนมัติ'}
              </button>

              {generatedData.id_card && (
                <div className="bg-white border-2 border-green-400 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">สร้างบัตรประชาชนสำเร็จ</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">เลขบัตรประชาชน:</span>
                      <p className="font-mono font-bold text-lg">{generatedData.id_card}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">รหัสผ่าน:</span>
                      <p className="font-mono font-bold text-lg text-red-600">{generatedData.password}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Personal Information */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              ขั้นตอนที่ 2: ข้อมูลส่วนตัว
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  value={formData.full_name_th}
                  onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="กรอกชื่อ-นามสกุล"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  บทบาท *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="doctor">👨‍⚕️ แพทย์</option>
                  <option value="helper">👩‍️ เจ้าหน้าที่</option>
                  <option value="osm">🏘️ อสม.</option>
                  {isSuperAdmin(user) && <option value="admin">👑 ผู้ดูแลระบบ</option>}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ความเชี่ยวชาญ
                </label>
                <input
                  type="text"
                  value={formData.specialization_th}
                  onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={formData.role === 'osm' ? 'อาสาสมัครสาธารณสุข' : 'เช่น อายุรกรรม'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0812345678"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Hospital & Birth Date */}
          <div>
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              ขั้นตอนที่ 3: โรงพยาบาลและวันเกิด
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  โรงพยาบาลสังกัด *
                </label>
                <select
                  value={formData.hospital_id}
                  onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- เลือกโรงพยาบาล --</option>
                  {getAvailableHospitals().map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.name} ({hospital.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  วันเกิด (กำหนดไว้แล้ว)
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value="01-01-2511"
                    readOnly
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ⚡ ระบบกำหนดวันเกิดเป็น 01-01-2511 อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleEmergencyRegister}
              disabled={loading || !formData.id_card || !formData.full_name_th || !formData.hospital_id}
              className="w-full bg-red-600 text-white py-4 rounded-lg hover:bg-red-700 transition-all font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            >
              <UserPlus className="w-6 h-6" />
              ลงทะเบียนเร่งด่วน (สร้างบัญชีทันที)
            </button>
            <p className="text-center text-sm text-gray-500 mt-2">
              ⚡ บัญชีจะถูกสร้างและเปิดใช้งานทันที ไม่ต้องรออนุมัติ
            </p>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                ยืนยันการลงทะเบียนเร่งด่วน
              </h2>
              <p className="text-gray-600 text-sm">
                ระบบจะสร้างบัญชีเจ้าหน้าที่พร้อมใช้งานทันที
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ชื่อ-นามสกุล:</span>
                <span className="font-semibold">{formData.full_name_th}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">บัตรประชาชน:</span>
                <span className="font-mono font-bold">{formData.id_card}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">บทบาท:</span>
                <span className="font-semibold">
                  {formData.role === 'doctor' ? 'แพทย์' :
                   formData.role === 'helper' ? 'เจ้าหน้าที่' :
                   formData.role === 'osm' ? 'อสม.' : 'Admin'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">รหัสผ่าน:</span>
                <span className="font-mono font-bold text-red-600">{formData.password}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">วันเกิด:</span>
                <span className="font-semibold">01-01-2511</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={confirmRegister}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                ยืนยัน
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}