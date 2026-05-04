// app/admin/staff/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 4 พฤษภาคม 2569
// ✅ ฟีเจอร์หลัก:
//    1. จัดการเจ้าหน้าที่ (เพิ่ม/แก้ไข/ปิดการใช้งาน/กู้คืน/ลบถาวร)
//    2. ระบบรออนุมัติ (Pending Approval)
//    3. สร้างรหัสผ่านอัตโนมัติจากวันเกิด (dd-mm-yyyy)
//    4. รองรับโรงพยาบาลแบบ Hierarchical (แม่ข่าย → ลูกข่าย)
//    5. แสดงข้อมูลโรงพยาบาลในตาราง
//    6. มีระบบ Soft Delete และ Permanent Delete
// =====================================================
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getStaffList,
  addStaff,
  updateStaff,
  deactivateStaff,
  permanentlyDeleteStaff,
  restoreStaff,
  getDeactivatedStaff,
  getHospitalsWithHierarchy
} from '@/lib/supabase/queries';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  LogOut,
  ArrowLeft,
  UserCheck,
  UserX,
  Shield,
  Stethoscope,
  Heart,
  Archive,
  RotateCcw,
  Calendar,
  Key,
  Save,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 CONSTANTS & INTERFACES
// =====================================================

// ✅ เดือนภาษาไทยสำหรับ dropdown
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ✅ Interface สำหรับโรงพยาบาล
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

// ✅ Interface สำหรับ Pending Staff
interface PendingStaff {
  id: string;
  id_card: string;
  full_name_th: string;
  role: 'doctor' | 'helper' | 'admin';
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;
  birth_date?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  hospitals?: {
    name: string;
    code: string;
  };
}

// =====================================================
// 🎯 MAIN COMPONENT
// =====================================================

export default function StaffManagementPage() {
  const router = useRouter();
  
  // ✅ States สำหรับข้อมูลหลัก
  const [user, setUser] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [deactivatedStaff, setDeactivatedStaff] = useState<any[]>([]);
  const [pendingStaff, setPendingStaff] = useState<PendingStaff[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ States สำหรับ Modal และ Tabs
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'deactivated'>('active');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

  // =====================================================
  // 🔄 INITIAL DATA LOADING
  // =====================================================

  useEffect(() => {
    console.log('🔍 [StaffManagement] Component mounted - Checking session...');
    const userData = checkSession();
    
    if (!userData) {
      console.warn('⚠️ [StaffManagement] No session found - Redirecting to login');
      router.push('/admin/login');
      return;
    }
    
    console.log('✅ [StaffManagement] User session:', userData);
    
    // ✅ ตรวจสอบสิทธิ์ Admin เท่านั้น
    if (userData.role !== 'admin') {
      console.error('❌ [StaffManagement] User not admin:', userData.role);
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/login');
      return;
    }
    
    setUser(userData);
    loadStaffList();
    loadHospitals();
    loadPendingStaff();
  }, [router]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================

  // ✅ โหลดรายชื่อโรงพยาบาลแบบ Hierarchical
  const loadHospitals = async () => {
    try {
      console.log('🏥 [loadHospitals] Fetching hospitals with hierarchy...');
      const data = await getHospitalsWithHierarchy();
      console.log(`✅ [loadHospitals] Loaded ${data.length} hospitals`);
      console.log('📊 [loadHospitals] Sample:', data[0]);
      setHospitals(data);
    } catch (error) {
      console.error('❌ [loadHospitals] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่
  const loadStaffList = async () => {
    try {
      console.log('👥 [loadStaffList] Fetching staff list...');
      const data = await getStaffList();
      console.log(`✅ [loadStaffList] Loaded ${data.length} staff members`);
      console.log('📊 [loadStaffList] Sample:', data[0]);
      setStaffList(data);
    } catch (error) {
      console.error('❌ [loadStaffList] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลเจ้าหน้าที่');
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่ที่รออนุมัติ
  const loadPendingStaff = async () => {
    try {
      console.log('⏳ [loadPendingStaff] Fetching pending staff...');
      const { data, error } = await supabase
        .from('pending_staff')
        .select(`
          *,
          hospitals (
            name,
            code
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ [loadPendingStaff] Error:', error);
        return;
      }
      
      console.log(`✅ [loadPendingStaff] Loaded ${data?.length || 0} pending staff`);
      setPendingStaff(data || []);
    } catch (error) {
      console.error('❌ [loadPendingStaff] Exception:', error);
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่ที่ปิดการใช้งาน
  const loadDeactivatedStaff = async () => {
    try {
      console.log('🗑️ [loadDeactivatedStaff] Fetching deactivated staff...');
      const data = await getDeactivatedStaff();
      console.log(`✅ [loadDeactivatedStaff] Loaded ${data.length} deactivated staff`);
      setDeactivatedStaff(data);
    } catch (error) {
      console.error('❌ [loadDeactivatedStaff] Error:', error);
    }
  };

  // =====================================================
  // 🎬 ACTION HANDLERS
  // =====================================================

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

  // ✅ อนุมัติเจ้าหน้าที่
  const handleApprove = async (pendingId: string, staffName: string) => {
    console.log(`✅ [handleApprove] Approving: ${pendingId} - ${staffName}`);
    
    if (!confirm(`อนุมัติ "${staffName}" เข้าระบบหรือไม่?\n\nเจ้าหน้าที่นี้จะสามารถเข้าสู่ระบบได้ทันที`)) {
      console.log('⚠️ [handleApprove] User cancelled approval');
      return;
    }
    
    try {
      // ✅ 1. ดึงข้อมูลจาก pending_staff
      const { data: pendingData, error: fetchError } = await supabase
        .from('pending_staff')
        .select('*')
        .eq('id', pendingId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // ✅ 2. สร้าง user ในตาราง users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id_card: pendingData.id_card,
          password_hash: pendingData.password_hash,
          role: pendingData.role,
          is_active: true,
          hospital_id: pendingData.hospital_id,
          birth_date: pendingData.birth_date,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (userError) throw userError;
      
      // ✅ 3. สร้าง doctor record (ถ้าเป็น doctor/helper)
      if (pendingData.role === 'doctor' || pendingData.role === 'helper') {
        await supabase
          .from('doctors')
          .insert({
            user_id: userData.id,
            full_name: pendingData.full_name_th,
            full_name_th: pendingData.full_name_th,
            specialization_th: pendingData.specialization_th,
            phone: pendingData.phone,
            email: pendingData.email,
            is_active: true,
            is_verified: false,
          });
      }
      
      // ✅ 4. อัปเดต status เป็น approved
      await supabase
        .from('pending_staff')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', pendingId);
      
      console.log('✅ [handleApprove] Successfully approved');
      alert(`✅ อนุมัติ "${staffName}" สำเร็จ!\n\nรหัสผ่าน: ${pendingData.password_hash}`);
      loadPendingStaff();
      loadStaffList();
    } catch (error) {
      console.error('❌ [handleApprove] Exception:', error);
      alert('เกิดข้อผิดพลาด: ' + (error as Error).message);
    }
  };

  // ✅ ปฏิเสธเจ้าหน้าที่
  const handleReject = async (pendingId: string, staffName: string) => {
    console.log(`❌ [handleReject] Rejecting: ${pendingId} - ${staffName}`);
    
    const reason = prompt('เหตุผลในการปฏิเสธ:', '');
    if (!reason) {
      console.log('⚠️ [handleReject] No reason provided');
      return;
    }
    
    try {
      await supabase
        .from('pending_staff')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', pendingId);
      
      console.log('✅ [handleReject] Successfully rejected');
      alert(`❌ ปฏิเสธ "${staffName}" แล้ว\n\nเหตุผล: ${reason}`);
      loadPendingStaff();
    } catch (error) {
      console.error('❌ [handleReject] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  // ✅ ปิดการใช้งานเจ้าหน้าที่ (Soft Delete)
  const handleDeactivate = async (staffId: string, staffName: string) => {
    console.log(`🔴 [handleDeactivate] Deactivating staff: ${staffId} - ${staffName}`);
    
    if (!confirm(`คุณต้องการปิดการใช้งาน "${staffName}" หรือไม่?\n\nเจ้าหน้าที่นี้จะไม่สามารถเข้าสู่ระบบได้\n\nสามารถกู้คืนได้ที่แท็บ "ที่ปิดการใช้งาน"`)) {
      console.log('⚠️ [handleDeactivate] User cancelled deactivation');
      return;
    }
    
    try {
      const result = await deactivateStaff(staffId);
      
      if (result.success) {
        console.log('✅ [handleDeactivate] Successfully deactivated');
        alert('✅ ปิดการใช้งานเจ้าหน้าที่สำเร็จ!\n\nสามารถกู้คืนได้ที่แท็บ "ที่ปิดการใช้งาน"');
        loadStaffList();
        loadDeactivatedStaff();
      } else {
        console.error('❌ [handleDeactivate] Failed:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleDeactivate] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  // ✅ กู้คืนเจ้าหน้าที่
  const handleRestoreStaff = async (staffId: string, staffName: string) => {
    console.log(`♻️ [handleRestoreStaff] Restoring staff: ${staffId} - ${staffName}`);
    
    if (!confirm(`คุณต้องการกู้คืน "${staffName}" กลับมาใช้งานหรือไม่?`)) {
      console.log('⚠️ [handleRestoreStaff] User cancelled restore');
      return;
    }
    
    try {
      const result = await restoreStaff(staffId);
      
      if (result.success) {
        console.log('✅ [handleRestoreStaff] Successfully restored');
        alert('✅ กู้คืนเจ้าหน้าที่สำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        console.error('❌ [handleRestoreStaff] Failed:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleRestoreStaff] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  // ✅ ลบเจ้าหน้าที่ถาวร (Permanent Delete)
  const handlePermanentlyDeleteStaff = async (staffId: string, staffName: string) => {
    console.log(`☠️ [handlePermanentlyDeleteStaff] Permanent delete: ${staffId} - ${staffName}`);
    
    if (!confirm(`⚠️ คำเตือน: คุณกำลังลบ "${staffName}" อย่างถาวร\n\nการกระทำนี้ไม่สามารถย้อนกลับได้\n\nคุณแน่ใจหรือไม่?`)) {
      console.log('⚠️ [handlePermanentlyDeleteStaff] User cancelled permanent delete');
      return;
    }
    
    if (!confirm('⚠️ ยืนยันครั้งสุดท้าย: การลบถาวรจะไม่สามารถกู้คืนได้\n\nพิมพ์ "YES" เพื่อยืนยัน')) {
      console.log('⚠️ [handlePermanentlyDeleteStaff] User did not confirm');
      return;
    }
    
    try {
      const result = await permanentlyDeleteStaff(staffId);
      
      if (result.success) {
        console.log('✅ [handlePermanentlyDeleteStaff] Successfully permanently deleted');
        alert('✅ ลบเจ้าหน้าที่ถาวรสำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        console.error('❌ [handlePermanentlyDeleteStaff] Failed:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handlePermanentlyDeleteStaff] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (staff: any) => {
    console.log('✏️ [handleEdit] Opening edit modal for:', staff);
    setSelectedStaff(staff);
    setShowEditModal(true);
  };

  const handleOpenDeactivatedModal = () => {
    console.log('🗑️ [handleOpenDeactivatedModal] Opening deactivated modal');
    setActiveTab('deactivated');
    loadDeactivatedStaff();
    setShowDeactivatedModal(true);
  };

  // =====================================================
  // 🏥 HOSPITAL GROUPING FUNCTION
  // =====================================================

  const getGroupedHospitals = () => {
    console.log('🏥 [getGroupedHospitals] Grouping hospitals...');
    const mainHospitals = hospitals.filter(h => h.type === 'main');
    const subHospitals = hospitals.filter(h => h.type === 'sub');
    
    console.log(`📊 [getGroupedHospitals] Main: ${mainHospitals.length}, Sub: ${subHospitals.length}`);
    
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

  // =====================================================
  // ⏳ LOADING STATE
  // =====================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  // =====================================================
  // 🎨 RENDER UI
  // =====================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Back Button */}
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>
          
          {/* Page Title & Actions */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                👥 จัดการเจ้าหน้าที่
              </h1>
              <p className="text-gray-600">จัดการผู้ดูแลระบบ แพทย์ และเจ้าหน้าที่</p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('pending')}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
              >
                <Clock className="w-4 h-4" />
                รออนุมัติ ({pendingStaff.length})
              </button>
              
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

          {/* Tabs */}
          <div className="flex gap-2 mt-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'active'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserCheck className="w-4 h-4 inline mr-2" />
              ใช้งาน ({staffList.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'pending'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              รออนุมัติ ({pendingStaff.length})
            </button>
            <button
              onClick={() => setActiveTab('deactivated')}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === 'deactivated'
                  ? 'text-gray-600 border-b-2 border-gray-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Archive className="w-4 h-4 inline mr-2" />
              ปิดการใช้งาน ({deactivatedStaff.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards - แสดงเฉพาะแท็บ Active */}
        {activeTab === 'active' && (
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
        )}

        {/* Active Staff Table */}
        {activeTab === 'active' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">บทบาท</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
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
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>ไม่พบข้อมูลเจ้าหน้าที่</p>
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          เพิ่มเจ้าหน้าที่คนแรก
                        </button>
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
                          <span className="text-sm text-gray-600">
                            {staff.hospitals?.name || '-'}
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
        )}

        {/* Pending Staff Table */}
        {activeTab === 'pending' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-orange-50 border-b border-orange-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">บทบาท</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">โรงพยาบาล</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID Card</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ความเชี่ยวชาญ</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่ลงทะเบียน</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingStaff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>ไม่มีคำขอรออนุมัติ</p>
                        <p className="text-sm text-gray-400 mt-2">
                          บุคลากรสามารถลงทะเบียนได้ที่ /admin/register
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pendingStaff.map((pending) => (
                      <tr key={pending.id} className="hover:bg-orange-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                              <Clock className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">
                                {pending.full_name_th}
                              </p>
                              <p className="text-sm text-gray-500">
                                {pending.email || '-'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            pending.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                            pending.role === 'doctor' ? 'bg-green-100 text-green-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {pending.role === 'admin' ? 'ผู้ดูแลระบบ' :
                             pending.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {pending.hospitals?.name || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm text-gray-600">
                            {pending.id_card}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {pending.specialization_th || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(pending.created_at).toLocaleDateString('th-TH')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(pending.id, pending.full_name_th)}
                              className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all"
                              title="อนุมัติ"
                            >
                              <CheckCircle className="w-4 h-4" />
                              อนุมัติ
                            </button>
                            <button
                              onClick={() => handleReject(pending.id, pending.full_name_th)}
                              className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-all"
                              title="ปฏิเสธ"
                            >
                              <XCircle className="w-4 h-4" />
                              ปฏิเสธ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Deactivated Staff - แสดงใน Modal */}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddStaffModal
          hospitals={hospitals}
          getGroupedHospitals={getGroupedHospitals}
          onClose={() => {
            console.log('❌ [AddStaffModal] Modal closed');
            setShowAddModal(false);
          }}
          onSuccess={() => {
            console.log('✅ [AddStaffModal] Staff added successfully');
            setShowAddModal(false);
            loadStaffList();
          }}
          userId={user?.id}
        />
      )}

      {showEditModal && selectedStaff && (
        <EditStaffModal
          staff={selectedStaff}
          hospitals={hospitals}
          getGroupedHospitals={getGroupedHospitals}
          onClose={() => {
            console.log('❌ [EditStaffModal] Modal closed');
            setShowEditModal(false);
            setSelectedStaff(null);
          }}
          onSuccess={() => {
            console.log('✅ [EditStaffModal] Staff updated successfully');
            setShowEditModal(false);
            setSelectedStaff(null);
            loadStaffList();
          }}
        />
      )}

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
                            <p>โรงพยาบาล: {staff.hospitals?.name || '-'}</p>
                            <p>ปิดการใช้งานเมื่อ: {new Date(staff.updated_at || staff.created_at).toLocaleString('th-TH')}</p>
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

// =====================================================
// ➕ ADD STAFF MODAL COMPONENT
// =====================================================

function AddStaffModal({
  hospitals,
  getGroupedHospitals,
  onClose,
  onSuccess,
  userId
}: {
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  onClose: () => void;
  onSuccess: () => void;
  userId: string
}) {
  console.log('📝 [AddStaffModal] Component mounted');
  
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
  
  const [loading, setLoading] = useState(false);

  // ✅ Generate password from birth date (dd-mm-yyyy)
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    const password = `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
    console.log('🔐 [generatePassword] Generated:', password);
    return password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 [AddStaffModal] Form submitted');
    console.log('📋 [AddStaffModal] Form data:', formData);
    setLoading(true);
    
    try {
      // ✅ Validate birth date
      if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
        console.error('❌ [AddStaffModal] Birth date incomplete');
        alert('กรุณากรอกวันเกิดให้ครบถ้วน');
        setLoading(false);
        return;
      }
      
      // ✅ Generate password from birth date
      const password = generatePassword();
      console.log('🔐 [AddStaffModal] Password:', password);
      
      // ✅ Convert birth date to Buddhist Era (BE) to AD
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;
      console.log('📅 [AddStaffModal] Birth date (AD):', birthDate);
      
      // ✅ Call addStaff API
      console.log('💾 [AddStaffModal] Calling addStaff API...');
      const result = await addStaff({
        ...formData,
        password: password,
        birth_date: birthDate,
        created_by: userId,
      });
      
      if (result.success) {
        console.log('✅ [AddStaffModal] Staff added successfully');
        alert(`เพิ่มเจ้าหน้าที่สำเร็จ!\n\n🔐 รหัสผ่าน: ${password}\n(วัน-เดือน-ปีเกิด)`);
        onSuccess();
      } else {
        console.error('❌ [AddStaffModal] API error:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [AddStaffModal] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">เพิ่มเจ้าหน้าที่ใหม่</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ID Card & Password */}
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
                maxLength={13}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🔐 รหัสผ่าน (อัตโนมัติ)
              </label>
              <input
                type="text"
                value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)
              </p>
            </div>
          </div>

          {/* Birth Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันเกิด *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={formData.birth_day}
                onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                required
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ปี พ.ศ.</option>
                {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-blue-600 mt-1">
              💡 รหัสผ่านจะถูกสร้างอัตโนมัติจากวันเกิด
            </p>
          </div>

          {/* Full Name */}
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

          {/* Role & Specialization */}
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

          {/* Hospital Selection - Hierarchical */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โรงพยาบาลสังกัด
            </label>
            <select
              value={formData.hospital_id}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
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
            <p className="text-xs text-gray-500 mt-1">
              💡 โรงพยาบาล: {hospitals.length} แห่ง
            </p>
          </div>

          {/* Phone & Email */}
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

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึก
                </>
              )}
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

// =====================================================
// ✏️ EDIT STAFF MODAL COMPONENT
// =====================================================

function EditStaffModal({
  staff,
  hospitals,
  getGroupedHospitals,
  onClose,
  onSuccess
}: {
  staff: any;
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  onClose: () => void;
  onSuccess: () => void
}) {
  console.log('✏️ [EditStaffModal] Component mounted - Staff:', staff);
  
  // ✅ Parse birth date from YYYY-MM-DD to day/month/year (BE)
  const parseBirthDate = (dateString: string | null) => {
    if (!dateString) return { day: '', month: '', year: '' };
    const date = new Date(dateString);
    return {
      day: date.getDate().toString(),
      month: (date.getMonth() + 1).toString(),
      year: (date.getFullYear() + 543).toString() // Convert AD to BE
    };
  };
  
  const initialBirthDate = parseBirthDate(staff.birth_date);
  console.log('📅 [EditStaffModal] Initial birth date:', initialBirthDate);
  
  const [formData, setFormData] = useState({
    full_name_th: staff.doctors?.full_name_th || '',
    specialization_th: staff.doctors?.specialization_th || '',
    phone: staff.doctors?.phone || '',
    email: staff.doctors?.email || '',
    hospital_id: staff.hospital_id || '',
    birth_day: initialBirthDate.day,
    birth_month: initialBirthDate.month,
    birth_year: initialBirthDate.year,
  });
  
  const [loading, setLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState(false);

  // ✅ Generate password from birth date
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) {
      return '';
    }
    const password = `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
    console.log('🔐 [EditStaffModal] New password:', password);
    return password;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📝 [EditStaffModal] Form submitted');
    console.log('📋 [EditStaffModal] Form data:', formData);
    setLoading(true);
    
    try {
      // ✅ Convert birth date to AD
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;
      console.log('📅 [EditStaffModal] Birth date (AD):', birthDate);
      
      // ✅ Update doctors table
      console.log('💾 [EditStaffModal] Updating doctors table...');
      const result = await updateStaff(staff.id, {
        ...formData,
        birth_date: birthDate,
      });
      
      if (!result.success) {
        console.error('❌ [EditStaffModal] Update failed:', result.error);
        alert('เกิดข้อผิดพลาด: ' + result.error);
        setLoading(false);
        return;
      }
      
      // ✅ Update users table (hospital_id and birth_date)
      const updateData: any = {
        birth_date: birthDate,
      };
      
      if (formData.hospital_id !== staff.hospital_id) {
        updateData.hospital_id = formData.hospital_id;
        console.log('🏥 [EditStaffModal] Hospital changed:', staff.hospital_id, '→', formData.hospital_id);
      }
      
      // ✅ Reset password if checkbox is checked
      if (resetPassword) {
        const newPassword = generatePassword();
        updateData.password_hash = newPassword;
        console.log('🔐 [EditStaffModal] Password reset:', newPassword);
      }
      
      // ✅ Execute update
      const { error: userError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', staff.id);
      
      if (userError) {
        console.error('❌ [EditStaffModal] User update error:', userError);
      }
      
      // ✅ Show success message
      let message = 'แก้ไขข้อมูลสำเร็จ!';
      if (resetPassword) {
        message += `\n\n🔐 รีเซ็ตรหัสผ่านใหม่แล้ว: ${generatePassword()}`;
      }
      
      alert(message);
      onSuccess();
    } catch (error) {
      console.error('❌ [EditStaffModal] Exception:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">✏️ แก้ไขข้อมูลเจ้าหน้าที่</h2>
          <p className="text-sm text-gray-500 mt-1">
            {staff.doctors?.full_name_th || '-'} | {staff.id_card}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Full Name */}
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

          {/* Birth Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันเกิด
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={formData.birth_day}
                onChange={(e) => setFormData({ ...formData, birth_day: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">วัน</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                value={formData.birth_month}
                onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">เดือน</option>
                {THAI_MONTHS.map((month, index) => (
                  <option key={index + 1} value={index + 1}>{month}</option>
                ))}
              </select>
              <select
                value={formData.birth_year}
                onChange={(e) => setFormData({ ...formData, birth_year: e.target.value })}
                className="px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ปี พ.ศ.</option>
                {Array.from({ length: 80 }, (_, i) => 2567 - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reset Password Checkbox */}
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              id="resetPassword"
              checked={resetPassword}
              onChange={(e) => setResetPassword(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="resetPassword" className="text-sm text-gray-700 flex items-center gap-2 flex-1 cursor-pointer">
              <Key className="w-4 h-4" />
              <span>รีเซ็ตรหัสผ่านให้ตรงกับวันเกิดใหม่</span>
              {generatePassword() && (
                <span className="font-mono font-bold text-blue-600">
                  ({generatePassword()})
                </span>
              )}
            </label>
          </div>

          {/* Specialization */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ความเชี่ยวชาญ
            </label>
            <input
              type="text"
              value={formData.specialization_th}
              onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น อายุรกรรม, ศัลยกรรม, เจ้าหน้าที่สาธารณสุข"
            />
          </div>

          {/* Hospital Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โรงพยาบาลสังกัด
            </label>
            <select
              value={formData.hospital_id}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
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
            <p className="text-xs text-gray-500 mt-1">
              💡 โรงพยาบาล: {hospitals.length} แห่ง
            </p>
          </div>

          {/* Phone & Email */}
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
                placeholder="0812345678"
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
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึก
                </>
              )}
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