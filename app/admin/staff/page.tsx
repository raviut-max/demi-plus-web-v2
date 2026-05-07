// app/admin/staff/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 7 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ Super Admin เห็นและแก้ไขได้ทั้งหมด
//    2. ✅ Hospital Admin เห็นเฉพาะ staff ใน รพ.แม่ข่าย/ลูกข่ายตัวเอง
//    3. ✅ รออนุมัติ - Hospital Admin เห็นเฉพาะ รพ.ตัวเองเท่านั้น
//    4. ✅ กรองตาม accessibleHospitalIds
//    5. ✅ ซ่อน Super Admin จาก Hospital Admin
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
  getHospitalsWithHierarchy,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import {
  Users, Plus, Edit, Trash2, LogOut, ArrowLeft, UserCheck, UserX,
  Shield, Stethoscope, Heart, Archive, RotateCcw, Calendar, Key,
  Save, Clock, CheckCircle, XCircle, Hospital, Building2, Lock, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 CONSTANTS & INTERFACES
// =====================================================
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

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}

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
  hospitals?: { name: string; code: string };
  admin_type?: 'super' | 'hospital' | null;
}

// =====================================================
// 🎯 MAIN COMPONENT
// =====================================================
export default function StaffManagementPage() {
  const router = useRouter();
  
  // ✅ States สำหรับข้อมูลหลัก
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [deactivatedStaff, setDeactivatedStaff] = useState<any[]>([]);
  const [pendingStaff, setPendingStaff] = useState<PendingStaff[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
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

    console.log('👤 [StaffManagement] User:', userData);
    console.log('👑 [StaffManagement] Is Super Admin:', isSuperAdmin(userData));
    console.log('🏥 [StaffManagement] Is Hospital Admin:', isHospitalAdmin(userData));

    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadHospitals();
    loadPendingStaff();
    loadStaffList();
  }, [router]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================
  
  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      console.log('🏥 [loadUserHospital] Loading for user:', userId);
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ [loadUserHospital] User hospital:', hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้ (แม่ข่าย + ลูกข่าย)
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🔍 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      console.log('🏥 [loadAccessibleHospitals] Hospital IDs:', ids);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    }
  };

  // ✅ โหลดรายชื่อโรงพยาบาลแบบ Hierarchical
  const loadHospitals = async () => {
    try {
      console.log('🏥 [loadHospitals] Fetching hospitals with hierarchy...');
      const data = await getHospitalsWithHierarchy();
      console.log(`✅ [loadHospitals] Loaded ${data.length} hospitals`);
      setHospitals(data);
    } catch (error) {
      console.error('❌ [loadHospitals] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลโรงพยาบาล');
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่ (กรองตามสิทธิ์)
  const loadStaffList = async () => {
    try {
      console.log('👥 [loadStaffList] Fetching staff list...');
      console.log('👑 [loadStaffList] Is Super Admin:', isSuperAdmin(user));
      console.log('🏥 [loadStaffList] Accessible hospital IDs:', accessibleHospitalIds);
      
      const allStaff = await getStaffList();
      console.log('📊 [loadStaffList] Total staff from DB:', allStaff.length);
      
      let filteredStaff = allStaff;
      
      if (isSuperAdmin(user)) {
        // ✅ Super Admin: เห็นทั้งหมด
        console.log('👑 [loadStaffList] Super Admin - showing all staff:', filteredStaff.length);
      } else if (accessibleHospitalIds.length > 0) {
        // ✅ Hospital Admin: เห็นเฉพาะ staff ใน รพ.ตัวเอง (แม่ข่าย+ลูกข่าย)
        filteredStaff = allStaff.filter(staff => {
          // ✅ 1. ซ่อน Super Admin จาก Hospital Admin
          if (staff.admin_type === 'super' || staff.role === 'super_admin') {
            console.log('🚫 [loadStaffList] Hiding Super Admin:', staff.id_card);
            return false;
          }
          
          // ✅ 2. แสดง staff ที่ไม่มี hospital_id (เช่น Super Admin)
          if (!staff.hospital_id) {
            return true;
          }
          
          // ✅ 3. แสดงเฉพาะ staff ใน รพ.ที่เข้าถึงได้
          const isInAccessibleHospital = accessibleHospitalIds.includes(staff.hospital_id);
          
          if (!isInAccessibleHospital) {
            console.log('🚫 [loadStaffList] Hiding staff from other hospital:', staff.id_card, staff.hospital_id);
          }
          
          return isInAccessibleHospital;
        });
        
        console.log('📊 [loadStaffList] Filtered staff for Hospital Admin:', filteredStaff.length);
      } else {
        console.log('⚠️ [loadStaffList] No accessible hospitals - showing no staff');
        filteredStaff = [];
      }
      
      setStaffList(filteredStaff);
    } catch (error) {
      console.error('❌ [loadStaffList] Error:', error);
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่ที่รออนุมัติ (กรองตามสิทธิ์) - ✅ แก้ไขแล้ว
  const loadPendingStaff = async () => {
    try {
      console.log('⏳ [loadPendingStaff] Fetching pending staff...');
      console.log('🏥 [loadPendingStaff] Accessible hospital IDs:', accessibleHospitalIds);
      console.log('👑 [loadPendingStaff] Is Super Admin:', isSuperAdmin(user));
      
      const { data, error } = await supabase
        .from('pending_staff')
        .select(`*, hospitals (name, code)`)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ [loadPendingStaff] Error:', error);
        setPendingStaff([]);
        return;
      }

      let filteredPending = data || [];
      
      if (isSuperAdmin(user)) {
        // ✅ Super Admin: เห็นทั้งหมด
        console.log('👑 [loadPendingStaff] Super Admin - showing all pending:', filteredPending.length);
      } else if (accessibleHospitalIds.length > 0) {
        // ✅ Hospital Admin: เห็นเฉพาะ pending จาก รพ.ที่เข้าถึงได้ (แม่ข่าย+ลูกข่าย)
        filteredPending = filteredPending.filter(pending => {
          // ✅ 1. ถ้าไม่มี hospital_id → แสดง
          if (!pending.hospital_id) {
            console.log('✅ [loadPendingStaff] Showing pending without hospital_id:', pending.id_card);
            return true;
          }
          
          // ✅ 2. ตรวจสอบว่าอยู่ในโรงพยาบาลที่เข้าถึงได้หรือไม่
          const isInAccessibleHospital = accessibleHospitalIds.includes(pending.hospital_id);
          
          if (isInAccessibleHospital) {
            console.log('✅ [loadPendingStaff] Showing pending in accessible hospital:', pending.full_name_th, pending.hospital_id);
          } else {
            console.log('🚫 [loadPendingStaff] Hiding pending from other hospital:', pending.full_name_th, pending.hospital_id);
          }
          
          return isInAccessibleHospital;
        });
        
        console.log('📊 [loadPendingStaff] Filtered pending for Hospital Admin:', filteredPending.length);
      } else {
        console.log('⚠️ [loadPendingStaff] No accessible hospitals - showing no pending');
        filteredPending = [];
      }
      
      setPendingStaff(filteredPending);
    } catch (error) {
      console.error('❌ [loadPendingStaff] Exception:', error);
      setPendingStaff([]);
    }
  };

  // ✅ โหลดรายชื่อเจ้าหน้าที่ที่ปิดการใช้งาน
  const loadDeactivatedStaff = async () => {
    try {
      console.log('🗑️ [loadDeactivatedStaff] Fetching deactivated staff...');
      const data = await getDeactivatedStaff();
      let filteredData = data;
      
      if (isSuperAdmin(user)) {
        // ✅ Super Admin: เห็นทั้งหมด
        console.log('👑 [loadDeactivatedStaff] Super Admin - showing all deactivated:', filteredData.length);
      } else if (accessibleHospitalIds.length > 0) {
        // ✅ Hospital Admin: เห็นเฉพาะ deactivated จาก รพ.ที่เข้าถึงได้
        filteredData = data.filter(staff => 
          !staff.hospital_id || accessibleHospitalIds.includes(staff.hospital_id)
        );
        console.log('📊 [loadDeactivatedStaff] Filtered deactivated for Hospital Admin:', filteredData.length);
      }
      
      setDeactivatedStaff(filteredData);
    } catch (error) {
      console.error('❌ [loadDeactivatedStaff] Error:', error);
      setDeactivatedStaff([]);
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

  // ✅ ตรวจสอบสิทธิ์ก่อนแก้ไข
  const canEditStaff = (staff: any): boolean => {
    // ✅ Super Admin แก้ไขได้ทั้งหมด
    if (isSuperAdmin(user)) {
      return true;
    }
    // ✅ Hospital Admin แก้ไขได้เฉพาะ staff ใน รพ.ตัวเอง
    if (isHospitalAdmin(user)) {
      // ✅ ไม่ให้แก้ไข Super Admin
      if (staff.admin_type === 'super' || staff.role === 'super_admin') {
        console.log('🚫 [canEditStaff] Hospital Admin cannot edit Super Admin');
        return false;
      }
      
      // ✅ ตรวจสอบว่า staff อยู่ใน รพ.เดียวกันหรือไม่
      const isSameHospital = !staff.hospital_id || 
        accessibleHospitalIds.includes(staff.hospital_id);
      
      console.log('🏥 [canEditStaff] Same hospital check:', isSameHospital);
      return isSameHospital;
    }

    return false;
  };

  // ✅ ตรวจสอบสิทธิ์ก่อนลบ
  const canDeleteStaff = (staff: any): boolean => {
    return canEditStaff(staff);
  };

  const handleApprove = async (pendingId: string, staffName: string) => {
    if (!confirm(`อนุมัติ "${staffName}" เข้าระบบหรือไม่?`)) return;
    try {
      const { data: pendingData, error: fetchError } = await supabase
        .from('pending_staff')
        .select('*')
        .eq('id', pendingId)
        .single();
      
      if (fetchError) throw fetchError;

      // ✅ ตรวจสอบสิทธิ์การอนุมัติ
      if (!isSuperAdmin(user) && pendingData.hospital_id && 
          !accessibleHospitalIds.includes(pendingData.hospital_id)) {
        alert('❌ คุณไม่มีสิทธิ์อนุมัติเจ้าหน้าที่โรงพยาบาลนี้');
        return;
      }
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id_card: pendingData.id_card,
          password_hash: pendingData.password_hash,
          role: pendingData.role,
          is_active: true,
          hospital_id: pendingData.hospital_id,
          birth_date: pendingData.birth_date,
          admin_type: pendingData.admin_type || null,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (userError) throw userError;
      
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
      
      await supabase
        .from('pending_staff')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', pendingId);
      
      alert(`✅ อนุมัติ "${staffName}" สำเร็จ!\nรหัสผ่าน: ${pendingData.password_hash}`);
      loadPendingStaff();
      loadStaffList();
    } catch (error: any) {
      console.error('❌ [handleApprove] Error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleReject = async (pendingId: string, staffName: string) => {
    const reason = prompt('เหตุผลในการปฏิเสธ:', '');
    if (!reason) return;
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
      
      alert(`❌ ปฏิเสธ "${staffName}" แล้ว`);
      loadPendingStaff();
    } catch (error) {
      console.error('❌ [handleReject] Error:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleDeactivate = async (staffId: string, staffName: string) => {
    const staff = staffList.find(s => s.id === staffId);
    if (!canDeleteStaff(staff)) {
      alert('❌ คุณไม่มีสิทธิ์ปิดการใช้งานเจ้าหน้าที่นี้');
      return;
    }

    if (!confirm(`ปิดการใช้งาน "${staffName}" หรือไม่?`)) return;

    try {
      const result = await deactivateStaff(staffId);
      if (result.success) {
        alert('ปิดการใช้งานสำเร็จ!');
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleDeactivate] Error:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleRestoreStaff = async (staffId: string, staffName: string) => {
    const staff = deactivatedStaff.find(s => s.id === staffId);
    if (!canEditStaff(staff)) {
      alert('❌ คุณไม่มีสิทธิ์กู้คืนเจ้าหน้าที่นี้');
      return;
    }

    if (!confirm(`กู้คืน "${staffName}" กลับมาใช้งานหรือไม่?`)) return;

    try {
      const result = await restoreStaff(staffId);
      if (result.success) {
        alert('กู้คืนสำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleRestoreStaff] Error:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handlePermanentlyDeleteStaff = async (staffId: string, staffName: string) => {
    const staff = deactivatedStaff.find(s => s.id === staffId);
    if (!canDeleteStaff(staff)) {
      alert('❌ คุณไม่มีสิทธิ์ลบเจ้าหน้าที่นี้');
      return;
    }

    if (!confirm(`⚠️ ลบ "${staffName}" ถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
    if (prompt('พิมพ์ "YES" เพื่อยืนยันการลบถาวร') !== 'YES') return;

    try {
      const result = await permanentlyDeleteStaff(staffId);
      if (result.success) {
        alert('ลบถาวรสำเร็จ!');
        loadDeactivatedStaff();
        loadStaffList();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handlePermanentlyDeleteStaff] Error:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (staff: any) => {
    if (!canEditStaff(staff)) {
      alert('❌ คุณไม่มีสิทธิ์แก้ไขเจ้าหน้าที่นี้');
      return;
    }
    setSelectedStaff(staff);
    setShowEditModal(true);
  };

  const handleOpenDeactivatedModal = () => {
    setActiveTab('deactivated');
    loadDeactivatedStaff();
    setShowDeactivatedModal(true);
  };

  // =====================================================
  // 🏥 HOSPITAL GROUPING FUNCTION
  // =====================================================
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
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">👥 จัดการเจ้าหน้าที่</h1>
              <p className="text-gray-600">จัดการผู้ดูแลระบบ แพทย์ และเจ้าหน้าที่</p>
              
              {/* ✅ แสดงข้อมูลสิทธิ์ */}
              <div className="flex items-center gap-2 mt-2">
                {isSuperAdmin(user) ? (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Super Admin - เห็นทั้งหมด
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1">
                    <Hospital className="w-3 h-3" />
                    Hospital Admin - เห็นเฉพาะ {userHospital?.name || 'โรงพยาบาลตัวเอง'}
                  </span>
                )}
              </div>
            </div>

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
        {/* Summary Cards */}
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
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {staffList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>ไม่พบข้อมูลเจ้าหน้าที่</p>
                        {!isSuperAdmin(user) && (
                          <p className="text-sm text-gray-400 mt-2">
                            🔒 คุณเห็นเฉพาะเจ้าหน้าที่ในโรงพยาบาลของคุณ
                          </p>
                        )}
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          เพิ่มเจ้าหน้าที่คนแรก
                        </button>
                      </td>
                    </tr>
                  ) : (
                    staffList.map((staff) => {
                      const canEdit = canEditStaff(staff);
                      const isSuper = staff.admin_type === 'super' || staff.role === 'super_admin';
                      
                      return (
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
                              isSuper ? 'bg-purple-100 text-purple-700' :
                              staff.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                              staff.role === 'doctor' ? 'bg-green-100 text-green-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {isSuper ? '👑 Super Admin' :
                               staff.role === 'admin' ? '🏥 Hospital Admin' :
                               staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">
                              {staff.hospitals?.name || (isSuper ? '-' : '-')}
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
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {canEdit ? (
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
                              ) : (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  ไม่มีสิทธิ์
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่ลงทะเบียน</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>ไม่มีคำขอรออนุมัติ</p>
                        <p className="text-sm text-gray-400 mt-2">
                          บุคลากรสามารถลงทะเบียนได้ที่ /admin/register
                        </p>
                        {!isSuperAdmin(user) && (
                          <p className="text-sm text-blue-600 mt-2">
                            🔒 คุณเห็นเฉพาะคำขอจากโรงพยาบาลในเครือข่ายของคุณ
                          </p>
                        )}
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
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddStaffModal
          hospitals={hospitals}
          getGroupedHospitals={getGroupedHospitals}
          accessibleHospitalIds={accessibleHospitalIds}
          currentUser={user}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
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
          accessibleHospitalIds={accessibleHospitalIds}
          currentUser={user}
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
            </div>
            <div className="p-6">
              {deactivatedStaff.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">ไม่มีเจ้าหน้าที่ที่ปิดการใช้งาน</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deactivatedStaff.map((staff) => {
                    const canRestore = canEditStaff(staff);
                    return (
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
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {canRestore ? (
                              <>
                                <button
                                  onClick={() => handleRestoreStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                  กู้คืน
                                </button>
                                <button
                                  onClick={() => handlePermanentlyDeleteStaff(staff.id, staff.doctors?.full_name_th || 'เจ้าหน้าที่')}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  ลบถาวร
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                ไม่มีสิทธิ์
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
  accessibleHospitalIds,
  currentUser,
  onClose,
  onSuccess,
  userId
}: {
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  accessibleHospitalIds: string[];
  currentUser: any;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}) {
  const [formData, setFormData] = useState({
    id_card: '',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    full_name_th: '',
    role: 'doctor' as 'admin' | 'doctor' | 'helper',
    specialization_th: '',
    phone: '',
    email: '',
    hospital_id: '',
    admin_type: null as 'super' | 'hospital' | null,
  });
  const [loading, setLoading] = useState(false);
  const [showAdminTypeField, setShowAdminTypeField] = useState(false);
  const isSuper = isSuperAdmin(currentUser);
  const isHospAdmin = isHospitalAdmin(currentUser);
  
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

    // ✅ Hospital Admin ไม่สามารถสร้าง admin ได้
    if (!isSuper && formData.role === 'admin') {
      alert('❌ คุณไม่มีสิทธิ์สร้างผู้ดูแลระบบใหม่');
      return;
    }

    // ✅ ต้องเลือกโรงพยาบาลถ้าเป็นบทบาทที่ต้องสังกัด
    if ((formData.role === 'admin' || formData.role === 'doctor' || formData.role === 'helper') && !formData.hospital_id) {
      alert('กรุณาเลือกโรงพยาบาลสังกัด');
      return;
    }

    // ✅ Hospital Admin ต้องเลือกโรงพยาบาลในขอบเขตตัวเอง
    if (!isSuper && formData.hospital_id && !accessibleHospitalIds.includes(formData.hospital_id)) {
      alert('❌ คุณไม่มีสิทธิ์สร้างเจ้าหน้าที่ในโรงพยาบาลนี้');
      return;
    }

    setLoading(true);

    try {
      const password = generatePassword();
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const result = await addStaff({
        ...formData,
        password: password,
        birth_date: birthDate,
        created_by: userId,
        admin_type: formData.role === 'admin' ? formData.admin_type : null,
      });

      if (result.success) {
        alert(`เพิ่มเจ้าหน้าที่สำเร็จ!\nรหัสผ่าน: ${password}\n(วัน-เดือน-ปีเกิด)`);
        onSuccess();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('❌ [AddStaffModal] Error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();
  
  // ✅ กรองโรงพยาบาลที่แสดงในฟอร์มตามสิทธิ์
  const getAvailableHospitals = () => {
    if (isSuper) return hospitals;
    return hospitals.filter(h => accessibleHospitalIds.includes(h.id));
  };
  
  const availableHospitals = getAvailableHospitals();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">เพิ่มเจ้าหน้าที่ใหม่</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* ✅ Box แสดงสิทธิ์ */}
          <div className={`rounded-lg p-4 border ${isSuper ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Lock className={`w-4 h-4 ${isSuper ? 'text-purple-600' : 'text-blue-600'}`} />
              <h3 className="text-sm font-semibold text-gray-800">สิทธิ์การสร้างเจ้าหน้าที่</h3>
            </div>
            <ul className="text-sm text-gray-700 space-y-1">
              {isSuper ? (
                <>
                  <li>👑 <strong>Super Admin:</strong> สร้างได้ทุกระดับ (Admin/Doctor/Helper)</li>
                  <li>🏥 สามารถกำหนดโรงพยาบาลและประเภท Admin ได้</li>
                </>
              ) : (
                <>
                  <li>🏥 <strong>Hospital Admin:</strong> สร้างได้เฉพาะ แพทย์/เจ้าหน้าที่</li>
                  <li>🔒 สร้างได้เฉพาะในโรงพยาบาลที่ตัวเองดูแล ({accessibleHospitalIds.length} แห่ง)</li>
                  <li>❌ ไม่สามารถสร้างผู้ดูแลระบบใหม่ได้</li>
                </>
              )}
            </ul>
          </div>

          {/* ID Card & Password */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Card *</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">🔐 รหัสผ่าน (อัตโนมัติ)</label>
              <input
                type="text"
                value={generatePassword() || 'ระบุวันเกิดเพื่อสร้างรหัสผ่าน'}
                readOnly
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">💡 รหัสผ่าน = วัน-เดือน-ปีเกิด (dd-mm-yyyy)</p>
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
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
            <input
              type="text"
              value={formData.full_name_th}
              onChange={(e) => setFormData({ ...formData, full_name_th: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท *</label>
            <select
              value={formData.role}
              onChange={(e) => {
                const newRole = e.target.value as 'admin' | 'doctor' | 'helper';
                setFormData({ ...formData, role: newRole });
                setShowAdminTypeField(newRole === 'admin' && isSuper);
                if (newRole !== 'admin') {
                  setFormData(prev => ({ ...prev, admin_type: null }));
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {isSuper && <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>}
              <option value="doctor">👨‍⚕️ แพทย์</option>
              <option value="helper">👩‍💼 เจ้าหน้าที่</option>
            </select>
            {!isSuper && (
              <p className="text-xs text-blue-600 mt-1">
                ℹ️ Hospital Admin สามารถสร้างได้เฉพาะ แพทย์ และ เจ้าหน้าที่
              </p>
            )}
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
                  admin_type: e.target.value as 'super' | 'hospital' || null 
                })}
                required
                className="w-full px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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

          {/* Specialization */}
          {(formData.role === 'doctor' || formData.role === 'helper') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ความเชี่ยวชาญ</label>
              <input
                type="text"
                value={formData.specialization_th}
                onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder={formData.role === 'helper' ? 'เช่น เจ้าหน้าที่สาธารณสุข, พยาบาล' : 'เช่น อายุรกรรม, ศัลยกรรม'}
              />
            </div>
          )}

          {/* Hospital Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โรงพยาบาลสังกัด {formData.role !== 'admin' ? '*' : ''}
            </label>
            <select
              value={formData.hospital_id}
              onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
              required={formData.role !== 'admin' || !isSuper}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
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
  accessibleHospitalIds,
  currentUser,
  onClose,
  onSuccess
}: {
  staff: any;
  hospitals: Hospital[];
  getGroupedHospitals: () => { mainHospitals: Hospital[]; hospitalGroups: Map<string, Hospital[]> };
  accessibleHospitalIds: string[];
  currentUser: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const parseBirthDate = (dateString: string | null) => {
    if (!dateString) return { day: '', month: '', year: '' };
    const date = new Date(dateString);
    return {
      day: date.getDate().toString(),
      month: (date.getMonth() + 1).toString(),
      year: (date.getFullYear() + 543).toString(),
    };
  };

  const initialBirthDate = parseBirthDate(staff.birth_date);
  const [formData, setFormData] = useState({
    full_name_th: staff.doctors?.full_name_th || '',
    specialization_th: staff.doctors?.specialization_th || '',
    phone: staff.doctors?.phone || '',
    email: staff.doctors?.email || '',
    hospital_id: staff.hospital_id || '',
    birth_day: initialBirthDate.day,
    birth_month: initialBirthDate.month,
    birth_year: initialBirthDate.year,
    admin_type: staff.admin_type || null,
  });
  const [loading, setLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState(false);
  const isSuper = isSuperAdmin(currentUser);
  const isHospAdmin = isHospitalAdmin(currentUser);
  const canEditHospital = isSuper || !staff.hospital_id || accessibleHospitalIds.includes(staff.hospital_id);
  
  const generatePassword = () => {
    if (!formData.birth_day || !formData.birth_month || !formData.birth_year) return '';
    return `${formData.birth_day.padStart(2, '0')}-${formData.birth_month.padStart(2, '0')}-${formData.birth_year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ Hospital Admin ไม่สามารถแก้ไขสิทธิ์ของ admin อื่น
    if (!isSuper && staff.role === 'admin' && formData.admin_type !== staff.admin_type) {
      alert('❌ คุณไม่มีสิทธิ์แก้ไขประเภทผู้ดูแลระบบ');
      return;
    }

    // ✅ Hospital Admin ไม่สามารถย้ายเจ้าหน้าที่ออกนอกขอบเขต
    if (!isSuper && formData.hospital_id !== staff.hospital_id && 
        formData.hospital_id && !accessibleHospitalIds.includes(formData.hospital_id)) {
      alert('❌ คุณไม่มีสิทธิ์ย้ายเจ้าหน้าที่ไปโรงพยาบาลนี้');
      return;
    }

    setLoading(true);

    try {
      const birthYearAD = parseInt(formData.birth_year) - 543;
      const birthDate = `${birthYearAD}-${formData.birth_month.padStart(2, '0')}-${formData.birth_day.padStart(2, '0')}`;

      const result = await updateStaff(staff.id, {
        ...formData,
        birth_date: birthDate,
        admin_type: formData.role === 'admin' ? formData.admin_type : null,
      });

      if (!result.success) {
        alert('เกิดข้อผิดพลาด: ' + result.error);
        setLoading(false);
        return;
      }

      const updateData: any = { birth_date: birthDate };

      if (canEditHospital && formData.hospital_id !== staff.hospital_id) {
        updateData.hospital_id = formData.hospital_id;
      }

      if (resetPassword) {
        updateData.password_hash = generatePassword();
      }

      if (Object.keys(updateData).length > 0) {
        await supabase.from('users').update(updateData).eq('id', staff.id);
      }

      let message = 'แก้ไขข้อมูลสำเร็จ!';
      if (resetPassword) {
        message += `\nรีเซ็ตรหัสผ่านใหม่แล้ว: ${generatePassword()}`;
      }

      alert(message);
      onSuccess();
    } catch (error: any) {
      console.error('❌ [EditStaffModal] Error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const { mainHospitals, hospitalGroups } = getGroupedHospitals();
  const availableHospitals = isSuper ? hospitals : hospitals.filter(h => accessibleHospitalIds.includes(h.id));

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
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
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
                <span className="font-mono font-bold text-blue-600">({generatePassword()})</span>
              )}
            </label>
          </div>

          {/* Specialization */}
          {(staff.role === 'doctor' || staff.role === 'helper') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ความเชี่ยวชาญ</label>
              <input
                type="text"
                value={formData.specialization_th}
                onChange={(e) => setFormData({ ...formData, specialization_th: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น อายุรกรรม, ศัลยกรรม, เจ้าหน้าที่สาธารณสุข"
              />
            </div>
          )}

          {/* Hospital Selection */}
          {canEditHospital && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">โรงพยาบาลสังกัด</label>
              <select
                value={formData.hospital_id}
                onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
                disabled={!isSuper && staff.role === 'admin'}
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
              {!isSuper && (
                <p className="text-xs text-blue-600 mt-1">
                  🔒 จำกัดเฉพาะโรงพยาบาลในขอบเขตของคุณ
                </p>
              )}
            </div>
          )}

          {/* Admin Type Field */}
          {staff.role === 'admin' && isSuper && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-purple-800 mb-2">
                <Shield className="w-4 h-4 inline mr-1" />
                ประเภทผู้ดูแลระบบ
              </label>
              <select
                value={formData.admin_type || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  admin_type: e.target.value as 'super' | 'hospital' || null 
                })}
                className="w-full px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- เลือกประเภท --</option>
                <option value="super">👑 Super Admin (เข้าถึงทั้งหมด)</option>
                <option value="hospital">🏥 Hospital Admin (เข้าถึงเฉพาะโรงพยาบาล)</option>
              </select>
            </div>
          )}

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0812345678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
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