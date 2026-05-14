'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  getPendingIdCards,
  getIdCardAssignments,
  assignIdCard,
  cancelIdCardAssignment,
  getHospitalsWithHierarchy,
  addStaff
} from '@/lib/supabase/queries';
import {
  CreditCard, Plus, CheckCircle, XCircle, Archive,
  Search, Filter, Hospital, User, Calendar,
  LogOut, ArrowLeft, Building2, UserPlus, Shield
} from 'lucide-react';

export default function IdCardAssignmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [pendingCards, setPendingCards] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [userHospital, setUserHospital] = useState<any>(null);
  
  // ✅ State สำหรับ Modal เพิ่มบุคลากรด่วน
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    full_name_th: '',
    role: 'osm' as 'doctor' | 'helper' | 'osm',
    hospital_id: '',
    phone: '',
    email: '',
    specialization_th: 'อาสาสมัครสาธารณสุข'
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/login');
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
    await loadData(ids);
  };

  const loadHospitals = async () => {
    const data = await getHospitalsWithHierarchy();
    setHospitals(data);
  };

  const loadData = async (hospitalIds: string[]) => {
    setLoading(true);
    await Promise.all([
      loadPendingCards(hospitalIds),
      loadAssignments(hospitalIds)
    ]);
    setLoading(false);
  };

  const loadPendingCards = async (hospitalIds: string[]) => {
    const data = await getPendingIdCards(hospitalIds);
    setPendingCards(data);
  };

  const loadAssignments = async (hospitalIds: string[]) => {
    const data = await getIdCardAssignments(hospitalIds, 'active');
    setAssignments(data);
  };

  // ✅ ฟังก์ชันเพิ่มบุคลากรด่วน (Gen ID + Fix Date)
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickAddLoading(true);

    try {
      // 1. เจน ID Card (13 หลัก)
      const generatedId = String(Math.floor(Math.random() * 9000000000000) + 1000000000000);
      
      // 2. กำหนดค่าคงที่
      const fixedBirthDate = '1968-01-01'; // 01-01-2511
      const fixedPassword = '01-01-2511'; // รหัสผ่าน = วันเกิด

      console.log('🚀 [QuickAdd] Adding staff:', { 
        name: quickAddForm.full_name_th, 
        id: generatedId 
      });

      // 3. เรียก API สร้างบุคลากร
      const result = await addStaff({
        id_card: generatedId,
        password: fixedPassword,
        full_name_th: quickAddForm.full_name_th,
        role: quickAddForm.role,
        specialization_th: quickAddForm.specialization_th,
        phone: quickAddForm.phone,
        email: quickAddForm.email,
        hospital_id: quickAddForm.hospital_id,
        birth_date: fixedBirthDate,
        created_by: user.id
      });

      if (result.success) {
        alert(`✅ เพิ่มบุคลากรสำเร็จ!\n\n👤 ชื่อ: ${quickAddForm.full_name_th}\n🆔 ID Card: ${generatedId}\n🔑 รหัสผ่าน: ${fixedPassword}\n วันเกิด: 01-01-2511`);
        setShowQuickAddModal(false);
        // รีเซ็ตฟอร์ม
        setQuickAddForm({ full_name_th: '', role: 'osm', hospital_id: '', phone: '', email: '', specialization_th: 'อาสาสมัครสาธารณสุข' });
        await loadData(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('❌ [QuickAdd] Error:', error);
      alert('เกิดข้อผิดพลาดในการเพิ่มข้อมูล');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const handleAssign = async () => {
    // (Logic เดิมสำหรับการ Assign ID Card)
    alert('ฟังก์ชัน Assign ID Card (รอการพัฒนาเพิ่มเติม)');
  };

  const handleCancel = async (assignmentId: string) => {
    if (!confirm('ยืนยันการยกเลิกการบรรจุ?')) return;
    const result = await cancelIdCardAssignment(assignmentId);
    if (result.success) {
      alert('ยกเลิกการบรรจุสำเร็จ');
      await loadData(accessibleHospitalIds);
    } else {
      alert('เกิดข้อผิดพลาด: ' + result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
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
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                <CreditCard className="w-8 h-8 inline mr-2" />
                จัดการเลขบัตร / เพิ่มบุคลากรด่วน
              </h1>
              <p className="text-gray-600">
                จัดการบรรจุ ID Card และเพิ่มบุคลากรแบบรวดเร็ว (ID จำลอง)
              </p>
            </div>

            <div className="flex gap-3">
              {/* ✅ ปุ่มเพิ่มบุคลากรด่วน */}
              <button
                onClick={() => setShowQuickAddModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:shadow-lg transition-all font-semibold"
              >
                <UserPlus className="w-5 h-5" />
                เพิ่มบุคลากรด่วน (ID จำลอง)
              </button>
              
              <button
                onClick={() => router.push('/admin/staff/register')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Plus className="w-4 h-4" />
                ลงทะเบียนปกติ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">รอการบรรจุ</p>
                <p className="text-2xl font-bold text-gray-800">{pendingCards.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">บรรจุแล้ว</p>
                <p className="text-2xl font-bold text-gray-800">{assignments.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Hospital className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">โรงพยาบาล</p>
                <p className="text-2xl font-bold text-gray-800">
                  {new Set(assignments.map(a => a.hospital_id)).size}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Cards Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-500" />
              ID Card รอการบรรจุ ({pendingCards.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">ID Card</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">บทบาท</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">โรงพยาบาล</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">วันที่ลงทะเบียน</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingCards.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <p>ไม่มี ID Card รอการบรรจุ</p>
                    </td>
                  </tr>
                ) : (
                  pendingCards.map((card) => (
                    <tr key={card.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-sm">{card.id_card}</td>
                      <td className="px-6 py-4">{card.full_name_th}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {card.role === 'doctor' ? 'แพทย์' : 
                           card.role === 'helper' ? 'เจ้าหน้าที่' : 
                           card.role === 'osm' ? 'อสม.' : 'Admin'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {card.hospitals?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(card.created_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleAssign()}
                          className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600"
                        >
                          <Plus className="w-3 h-3" />
                          บรรจุ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ✅ Modal เพิ่มบุคลากรด่วน (Quick Add) */}
      {showQuickAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserPlus className="w-6 h-6" />
                เพิ่มบุคลากรด่วน (ID จำลอง)
              </h2>
              <button 
                onClick={() => setShowQuickAddModal(false)}
                className="text-white hover:bg-white/20 p-1 rounded"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="p-6 space-y-4">
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-bold mb-1">📢 ระบบจะดำเนินการดังนี้:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>สร้าง <b>ID Card</b> แบบสุ่ม 13 หลัก</li>
                  <li>กำหนด <b>วันเกิด</b> เป็น 01-01-2511</li>
                  <li>ตั้ง <b>รหัสผ่าน</b> เป็น 01-01-2511</li>
                </ul>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quickAddForm.full_name_th}
                  onChange={(e) => setQuickAddForm({...quickAddForm, full_name_th: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="เช่น นายสมชาย ใจดี"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    บทบาท <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={quickAddForm.role}
                    onChange={(e) => setQuickAddForm({...quickAddForm, role: e.target.value as any})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="osm">🏘️ อสม.</option>
                    <option value="helper">👩‍️ เจ้าหน้าที่</option>
                    <option value="doctor">👨‍⚕️ แพทย์</option>
                  </select>
                </div>

                {/* Hospital */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    โรงพยาบาล <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={quickAddForm.hospital_id}
                    onChange={(e) => setQuickAddForm({...quickAddForm, hospital_id: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">-- เลือก --</option>
                    {hospitals.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                  <input
                    type="tel"
                    value={quickAddForm.phone}
                    onChange={(e) => setQuickAddForm({...quickAddForm, phone: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="08x-xxx-xxxx"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                  <input
                    type="email"
                    value={quickAddForm.email}
                    onChange={(e) => setQuickAddForm({...quickAddForm, email: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={quickAddLoading}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2.5 rounded-lg hover:shadow-lg transition-all font-semibold disabled:opacity-50"
                >
                  {quickAddLoading ? 'กำลังบันทึก...' : '✅ บันทึกข้อมูล'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}