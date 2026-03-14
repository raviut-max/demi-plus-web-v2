'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getStaffList, addStaff, updateStaff, deactivateStaff, permanentlyDeleteStaff, restoreStaff, getDeactivatedStaff } from '@/lib/supabase/queries';
import { Users, Plus, Edit, Trash2, LogOut, ArrowLeft, UserCheck, UserX, Shield, Stethoscope, Heart, Archive, RotateCcw } from 'lucide-react';

export default function StaffManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [deactivatedStaff, setDeactivatedStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

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
    loadStaffList();
  }, [router]);

  const loadStaffList = async () => {
    try {
      const data = await getStaffList();
      setStaffList(data);
    } catch (error) {
      console.error('Error loading staff list:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeactivatedStaff = async () => {
    try {
      const data = await getDeactivatedStaff();
      setDeactivatedStaff(data);
    } catch (error) {
      console.error('Error loading deactivated staff:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleDeactivate = async (staffId: string, staffName: string) => {
    if (!confirm(`คุณต้องการปิดการใช้งาน "${staffName}" หรือไม่?`)) {
      return;
    }

    try {
      const result = await deactivateStaff(staffId);
      if (result.success) {
        alert('ปิดการใช้งานเจ้าหน้าที่สำเร็จ!');
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error deactivating staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleRestoreStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`คุณต้องการกู้คืน "${staffName}" กลับมาใช้งานหรือไม่?`)) {
      return;
    }

    try {
      const result = await restoreStaff(staffId);
      if (result.success) {
        alert('กู้คืนเจ้าหน้าที่สำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error restoring staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handlePermanentlyDeleteStaff = async (staffId: string, staffName: string) => {
    if (!confirm(`⚠️ คำเตือน: คุณกำลังลบ "${staffName}" อย่างถาวร\n\nการกระทำนี้ไม่สามารถย้อนกลับได้\n\nคุณแน่ใจหรือไม่?`)) {
      return;
    }

    if (!confirm('⚠️ ยืนยันครั้งสุดท้าย: การลบถาวรจะไม่สามารถกู้คืนได้\n\nพิมพ์ "YES" เพื่อยืนยัน')) {
      return;
    }

    try {
      const result = await permanentlyDeleteStaff(staffId);
      if (result.success) {
        alert('ลบเจ้าหน้าที่ถาวรสำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error permanently deleting staff:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (staff: any) => {
    setSelectedStaff(staff);
    setShowEditModal(true);
  };

  const handleOpenDeactivatedModal = () => {
    setShowDeactivatedModal(true);
    loadDeactivatedStaff();
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
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">จัดการเจ้าหน้าที่</h1>
              <p className="text-sm text-gray-600">จัดการผู้ดูแลระบบ แพทย์ และเจ้าหน้าที่</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleOpenDeactivatedModal}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                <Archive className="w-4 h-4" />
                ที่ปิดการใช้งาน ({deactivatedStaff.length})
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                เพิ่มเจ้าหน้าที่
              </button>
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
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">เจ้าหน้าที่ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{staffList.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ผู้ดูแลระบบ</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'admin').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">แพทย์</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'doctor').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <Heart className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">เจ้าหน้าที่</p>
                <p className="text-2xl font-bold text-gray-800">
                  {staffList.filter(s => s.role === 'helper').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">บทบาท</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID Card</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ความเชี่ยวชาญ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่สร้าง</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลเจ้าหน้าที่</p>
                    </td>
                  </tr>
                ) : (
                  staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {staff.doctors?.full_name_th || '-'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {staff.doctors?.phone || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          staff.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          staff.role === 'doctor' ? 'bg-green-100 text-green-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {staff.role === 'admin' ? 'ผู้ดูแลระบบ' :
                           staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-600">
                          {staff.id_card}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {staff.doctors?.specialization_th || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {staff.is_active ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <UserCheck className="w-4 h-4" />
                            ใช้งาน
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <UserX className="w-4 h-4" />
                            ปิดการใช้งาน
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(staff.created_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {staff.is_active && (
                            <>
                              <button
                                onClick={() => handleEdit(staff)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="แก้ไข"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeactivate(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="ปิดการใช้งาน"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadStaffList();
          }}
          userId={user?.id}
        />
      )}

      {/* Edit Staff Modal */}
      {showEditModal && selectedStaff && (
        <EditStaffModal
          staff={selectedStaff}
          onClose={() => {
            setShowEditModal(false);
            setSelectedStaff(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedStaff(null);
            loadStaffList();
          }}
        />
      )}

      {/* Deactivated Staff Modal */}
      {showDeactivatedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Archive className="w-6 h-6 text-gray-600" />
                  เจ้าหน้าที่ที่ปิดการใช้งาน ({deactivatedStaff.length})
                </h2>
                <button
                  onClick={() => setShowDeactivatedModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                คลิก "กู้คืน" เพื่อนำกลับมาใช้งาน หรือ "ลบถาวร" เพื่อลบออกจากระบบอย่างถาวร
              </p>
            </div>

            <div className="p-6">
              {deactivatedStaff.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">ไม่มีเจ้าหน้าที่ที่ปิดการใช้งาน</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deactivatedStaff.map((staff) => (
                    <div key={staff.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-800">{staff.doctors?.full_name_th || '-'}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              staff.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                              staff.role === 'doctor' ? 'bg-green-100 text-green-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {staff.role === 'admin' ? 'ผู้ดูแลระบบ' :
                               staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>ID Card: {staff.id_card}</p>
                            <p>ความเชี่ยวชาญ: {staff.doctors?.specialization_th || '-'}</p>
                            <p>ปิดการใช้งานเมื่อ: {new Date(staff.updated_at).toLocaleString('th-TH')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleRestoreStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                            title="กู้คืน"
                          >
                            <RotateCcw className="w-4 h-4" />
                            กู้คืน
                          </button>
                          <button
                            onClick={() => handlePermanentlyDeleteStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
                            title="ลบถาวร"
                          >
                            <Trash2 className="w-4 h-4" />
                            ลบถาวร
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowDeactivatedModal(false)}
                className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Staff Modal Component
function AddStaffModal({ onClose, onSuccess, userId }: { onClose: () => void; onSuccess: () => void; userId: string }) {
  const [formData, setFormData] = useState({
    id_card: '',
    password: '',
    full_name_th: '',
    role: 'doctor' as 'doctor' | 'helper',
    specialization_th: '',
    phone: '',
    email: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await addStaff({
        ...formData,
        created_by: userId,
      });

      if (result.success) {
        alert('เพิ่มเจ้าหน้าที่สำเร็จ!');
        onSuccess();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding staff:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">เพิ่มเจ้าหน้าที่ใหม่</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID Card *
              </label>
              <input
                type="text"
                value={formData.id_card}
                onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสผ่าน *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อ-นามสกุล *
            </label>
            <input
              type="text"
              value={formData.full_name_th}
              onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                บทบาท *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'doctor' | 'helper' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="doctor">แพทย์</option>
                <option value="helper">เจ้าหน้าที่</option>
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
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Staff Modal Component
function EditStaffModal({ staff, onClose, onSuccess }: { staff: any; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    full_name_th: staff.doctors?.full_name_th || '',
    specialization_th: staff.doctors?.specialization_th || '',
    phone: staff.doctors?.phone || '',
    email: staff.doctors?.email || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await updateStaff(staff.id, formData);
      if (result.success) {
        alert('แก้ไขข้อมูลสำเร็จ!');
        onSuccess();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating staff:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">แก้ไขข้อมูลเจ้าหน้าที่</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อ-นามสกุล
            </label>
            <input
              type="text"
              value={formData.full_name_th}
              onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
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
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เบอร์โทรศัพท์
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมล
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}