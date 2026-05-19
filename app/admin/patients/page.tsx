// app/admin/patients/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientList,
  deletePatient,
  restorePatient,
  permanentlyDeletePatient,
  getDeletedPatients,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  Users, Plus, Eye, Edit, Trash2, LogOut, ArrowLeft, UserCheck,
  Archive, RotateCcw, AlertCircle, Search, Filter, Hospital,
  Calendar, Phone, Mail, MapPin, XCircle, CheckCircle, Lock, Shield,
  ChevronUp, ChevronDown, ChevronsUpDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 🎯 MAIN COMPONENT
// =====================================================
export default function PatientManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPamLevel, setSelectedPamLevel] = useState<string>('all');
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  
  // ✅ Sorting State
  const [sortColumn, setSortColumn] = useState<string>('first_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    
    // ✅ ตรวจสอบสิทธิ์ - อนุญาตให้ osm เข้าถึงได้
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    
    console.log('👤 [PatientManagement] User:', userData);
    console.log('🏥 [PatientManagement] Role:', userData.role);
    
    setUser(userData);
    loadUserHospital(userData.id);
    loadUserName(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  const loadUserName = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('doctors')
        .select('full_name_th')
        .eq('user_id', userId)
        .single();
      
      if (data?.full_name_th) {
        setUserName(data.full_name_th);
      } else {
        setUserName('ผู้ดูแลระบบ');
      }
    } catch (error) {
      setUserName('ผู้ใช้งาน');
    }
  };

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      await loadPatients(ids);
      await loadDeletedPatients(ids);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
      setAccessibleHospitalIds([]);
      await loadPatients([]);
      await loadDeletedPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      console.log('🔍 [loadPatients] Loading with hospitalIds:', hospitalIds);
      const data = await getPatientList(
        searchTerm,
        selectedPamLevel === 'all' ? undefined : selectedPamLevel,
        hospitalIds
      );
      console.log('✅ [loadPatients] Loaded:', data.length, 'patients');
      setPatients(data);
    } catch (error) {
      console.error('❌ [loadPatients] Error:', error);
      setPatients([]);
    }
  };

  const loadDeletedPatients = async (hospitalIds?: string[]) => {
    try {
      const data = await getDeletedPatients();
      
      // ✅ กรองตาม hospitalIds ถ้าไม่ใช่ Super Admin
      let filteredData = data;
      if (!isSuperAdmin(user) && hospitalIds && hospitalIds.length > 0) {
        filteredData = data.filter(p => 
          !p.hospital_id || hospitalIds.includes(p.hospital_id)
        );
      }
      
      setDeletedPatients(filteredData);
    } catch (error) {
      console.error('❌ [loadDeletedPatients] Error:', error);
      setDeletedPatients([]);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleSearch = () => {
    loadPatients(accessibleHospitalIds);
  };

  // ✅ Sorting Handler
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // ✅ Sorted Patients Data
  const sortedPatients = [...patients].sort((a, b) => {
    let aValue: any = a[sortColumn];
    let bValue: any = b[sortColumn];
    
    // Handle nested properties (e.g., hospitals.name)
    if (sortColumn.includes('.')) {
      const [parent, child] = sortColumn.split('.');
      aValue = a[parent]?.[child];
      bValue = b[parent]?.[child];
    }
    
    // Handle null/undefined values
    if (aValue == null) aValue = '';
    if (bValue == null) bValue = '';
    
    // Compare values
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue, 'th')
        : bValue.localeCompare(aValue, 'th');
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // ✅ Soft Delete - ลบแบบกู้คืนได้
  const handleDeletePatient = async (patientId: string, patientName: string) => {
    // ✅ ตรวจสอบว่าเป็น อสม. หรือไม่ - ห้ามลบ
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบข้อมูลผู้ป่วย');
      return;
    }
    
    // ✅ แสดง Modal ยืนยันการลบ
    const confirmDelete = confirm(
      `⚠️ ยืนยันการลบผู้ป่วย\n\n` +
      `ชื่อ: ${patientName}\n\n` +
      `การลบนี้จะย้ายผู้ป่วยไปยัง "ถังขยะ" \n` +
      `คุณสามารถกู้คืนได้ในภายหลัง\n\n` +
      `ต้องการดำเนินการต่อหรือไม่?`
    );
    
    if (!confirmDelete) return;
    
    try {
      const result = await deletePatient(patientId);
      if (result.success) {
        alert('✅ ลบผู้ป่วยสำเร็จ!\nผู้ป่วยถูกย้ายไปยังถังขยะ');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleDeletePatient] Error:', error);
      alert('❌ เกิดข้อผิดพลาดในการลบ');
    }
  };

  // ✅ Restore - กู้คืนผู้ป่วย
  const handleRestorePatient = async (patientId: string, patientName: string) => {
    // ✅ ตรวจสอบว่าเป็น อสม. หรือไม่ - ห้ามลบ (และห้ามกู้คืน)
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์กู้คืนข้อมูลผู้ป่วย');
      return;
    }
    
    const confirmRestore = confirm(
      `♻️ ยืนยันการกู้คืนผู้ป่วย\n\n` +
      `ชื่อ: ${patientName}\n\n` +
      `ต้องการกู้คืนผู้ป่วยนี้กลับมาหรือไม่?`
    );
    
    if (!confirmRestore) return;
    
    try {
      const result = await restorePatient(patientId);
      if (result.success) {
        alert('✅ กู้คืนผู้ป่วยสำเร็จ!');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleRestorePatient] Error:', error);
      alert('❌ เกิดข้อผิดพลาดในการกู้คืน');
    }
  };

  // ✅ Permanent Delete - ลบถาวร
  const handlePermanentlyDeletePatient = async (patientId: string, patientName: string) => {
    // ✅ ตรวจสอบว่าเป็น อสม. หรือไม่ - ห้ามลบถาวร
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบข้อมูลผู้ป่วยถาวร');
      return;
    }
    
    // ✅ ยืนยัน 2 ชั้น
    const firstConfirm = confirm(
      `️ ⚠️ คำเตือน: การลบถาวร\n\n` +
      `ชื่อ: ${patientName}\n\n` +
      `การกระทำนี้ไม่สามารถย้อนกลับได้!\n` +
      `ข้อมูลผู้ป่วยจะถูกลบออกจากระบบอย่างถาวร\n\n` +
      `คุณต้องการดำเนินการต่อหรือไม่?`
    );
    
    if (!firstConfirm) return;
    
    // ✅ ยืนยันครั้งที่ 2 - พิมพ์ YES
    const secondConfirm = prompt(
      `⚠️ ยืนยันการลบถาวรครั้งที่ 2\n\n` +
      `พิมพ์ "YES" (ตัวพิมพ์ใหญ่) เพื่อยืนยันการลบถาวร:`
    );
    
    if (secondConfirm !== 'YES') {
      alert('❌ ยกเลิกการลบถาวร');
      return;
    }
    
    try {
      const result = await permanentlyDeletePatient(patientId);
      if (result.success) {
        alert('✅ ลบผู้ป่วยถาวรสำเร็จ!');
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handlePermanentlyDeletePatient] Error:', error);
      alert('❌ เกิดข้อผิดพลาดในการลบถาวร');
    }
  };

  // ✅ ฟังก์ชันตรวจสอบสิทธิ์การแก้ไข/ลบ
  const canDeleteData = () => {
    return user?.role !== 'osm';
  };

  // ✅ ฟังก์ชันแสดง Badge บทบาท
  const getRoleBadge = () => {
    if (!user) return null;
    
    const roleConfig: any = {
      'osm': { 
        text: '🏘️ อสม.', 
        bg: 'bg-orange-100', 
        textCol: 'text-orange-700'
      },
      'admin': { 
        text: isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin', 
        bg: isSuperAdmin(user) ? 'bg-purple-100' : 'bg-blue-100',
        textCol: isSuperAdmin(user) ? 'text-purple-700' : 'text-blue-700'
      },
      'doctor': { 
        text: '👨‍⚕️ แพทย์', 
        bg: 'bg-green-100', 
        textCol: 'text-green-700'
      },
      'helper': { 
        text: '👩‍💼 เจ้าหน้าที่', 
        bg: 'bg-yellow-100', 
        textCol: 'text-yellow-700'
      }
    };
    
    const config = roleConfig[user.role] || { 
      text: user.role, 
      bg: 'bg-gray-100', 
      textCol: 'text-gray-700'
    };
    
    return (
      <span className={`px-2 py-1 ${config.bg} ${config.textCol} rounded text-xs font-semibold`}>
        {config.text}
      </span>
    );
  };

  // ✅ Get Sort Icon
  const getSortIcon = (columnName: string) => {
    if (sortColumn !== columnName) {
      return <ChevronsUpDown className="w-4 h-4 ml-1 opacity-30" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp className="w-4 h-4 ml-1" />
      : <ChevronDown className="w-4 h-4 ml-1" />;
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Row 1: Back Button */}
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>
          
          {/* Row 2: Main Header Content */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left: Title */}
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">👥 จัดการผู้ป่วย</h1>
              <p className="text-gray-600">จัดการข้อมูลผู้ป่วยและติดตามผลการรักษา</p>
            </div>
            
            {/* Center: User Info Card */}
            <div className="flex-1 max-w-md mx-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* User Icon */}
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-800 truncate">{userName}</h3>
                      {getRoleBadge()}
                    </div>
                    
                    {/* Hospital Info */}
                    {userHospital && (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Hospital className="w-4 h-4 text-blue-500" />
                          <span className="truncate">{userHospital.name}</span>
                        </div>
                        
                        {userHospital.type === 'sub' && userHospital.parent_hospital && (
                          <>
                            <div className="flex items-center gap-2 text-green-600">
                              <div className="w-4 h-4 flex items-center justify-center">🏥</div>
                              <span className="truncate">ลูกข่าย: {userHospital.parent_hospital.name}</span>
                            </div>
                          </>
                        )}
                        
                        {userHospital.type === 'main' && (
                          <div className="flex items-center gap-2 text-purple-600">
                            <div className="w-4 h-4 flex items-center justify-center">🏢</div>
                            <span>แม่ข่าย</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right: Action Buttons */}
            <div className="flex gap-2">
              {canDeleteData() && (
                <button
                  onClick={() => setShowDeletedModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
                >
                  <Archive className="w-4 h-4" />
                  ที่ลบแล้ว ({deletedPatients.length})
                </button>
              )}
              
              <button
                onClick={() => router.push('/admin/patients/new')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                เพิ่มผู้ป่วยใหม่
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
                <p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{patients.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Green Zone</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.zone === 'Green Zone').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Yellow Zone</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.zone === 'Yellow Zone').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Red Zone</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.zone === 'Red Zone').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" />
                ค้นหา
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="ชื่อ, นามสกุล, เลข HN"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="w-4 h-4 inline mr-1" />
                กรองตาม PAM Level
              </label>
              <select
                value={selectedPamLevel}
                onChange={(e) => setSelectedPamLevel(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด</option>
                <option value="L0">L0 - ไม่ทราบ</option>
                <option value="L1">L1 - Deny</option>
                <option value="L2">L2 - General</option>
                <option value="L3">L3 - Intensive</option>
                <option value="L4">L4 - Champion</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                ค้นหา
              </button>
            </div>
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th 
                    onClick={() => handleSort('first_name')}
                    className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  >
                    <div className="flex items-center">
                      ชื่อ-นามสกุล
                      {getSortIcon('first_name')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('users.id_card')}
                    className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  >
                    <div className="flex items-center">
                      HN / ID Card
                      {getSortIcon('users.id_card')}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('hospitals.name')}
                    className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                  >
                    <div className="flex items-center">
                      โรงพยาบาล
                      {getSortIcon('hospitals.name')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM Level</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ผู้สร้าง</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedPatients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
                      <button
                        onClick={() => router.push('/admin/patients/new')}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      >
                        เพิ่มผู้ป่วยคนแรก
                      </button>
                    </td>
                  </tr>
                ) : (
                  sortedPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {patient.first_name} {patient.last_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {patient.phone || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-mono text-gray-600">{patient.hospital_number || '-'}</p>
                          <p className="text-xs text-gray-400">{patient.users?.id_card || '-'}</p>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {patient.hospitals?.name || '-'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                          patient.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                          patient.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                          patient.pam_level === 'L1' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {patient.pam_level || 'L0'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' :
                          patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                          patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {patient.zone || 'Zero Zone'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {patient.created_by_name || '-'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(`/admin/patients/${patient.id}`)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => router.push(`/admin/patients/${patient.id}/edit`)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          {/* ✅ แสดงปุ่มลบเฉพาะผู้ที่ไม่ใช่อสม. */}
                          {canDeleteData() ? (
                            <button
                              onClick={() => handleDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="ลบ (กู้คืนได้)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 flex items-center gap-1" title="อสม. ไม่มีสิทธิ์ลบ">
                              <Lock className="w-3 h-3" />
                            </span>
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

      {/* Deleted Patients Modal */}
      {showDeletedModal && canDeleteData() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Archive className="w-6 h-6 text-gray-600" />
                  ผู้ป่วยที่ลบแล้ว ({deletedPatients.length})
                </h2>
                <button
                  onClick={() => setShowDeletedModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {deletedPatients.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">ไม่มีผู้ป่วยที่ถูกลบ</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deletedPatients.map((patient) => (
                    <div key={patient.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-800">
                              {patient.first_name} {patient.last_name}
                            </h3>
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                              {patient.hospital_number}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>HN: {patient.hospital_number || '-'}</p>
                            <p>โรงพยาบาล: {patient.hospitals?.name || '-'}</p>
                            <p>ลบเมื่อ: {new Date(patient.updated_at).toLocaleDateString('th-TH')}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => handleRestorePatient(patient.id, `${patient.first_name} ${patient.last_name}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                          >
                            <RotateCcw className="w-4 h-4" />
                            กู้คืน
                          </button>
                          
                          <button
                            onClick={() => handlePermanentlyDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
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
                onClick={() => setShowDeletedModal(false)}
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