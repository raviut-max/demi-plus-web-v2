'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, deletePatient, restorePatient, getDeletedPatients, permanentlyDeletePatient } from '@/lib/supabase/queries';
import { Users, Search, Filter, Plus, Eye, Edit, Trash2, LogOut, Archive, RotateCcw } from 'lucide-react';

export default function PatientListPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pamLevelFilter, setPamLevelFilter] = useState('all');
  const [showDeletedModal, setShowDeletedModal] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadPatients();
    setLoading(false);
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadDeletedPatients = async () => {
    try {
      const data = await getDeletedPatients();
      setDeletedPatients(data);
    } catch (error) {
      console.error('Error loading deleted patients:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleDeletePatient = async (patientId: string, patientName: string) => {
    if (!confirm(`คุณต้องการลบผู้ป่วย "${patientName}" หรือไม่?\n\nการลบจะเป็นการปิดการใช้งานเท่านั้น ข้อมูลจะยังคงอยู่ในระบบ`)) {
      return;
    }

    try {
      const result = await deletePatient(patientId);
      if (result.success) {
        alert('ลบผู้ป่วยสำเร็จ!');
        loadPatients(); // Refresh list
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting patient:', error);
      alert('เกิดข้อผิดพลาดในการลบผู้ป่วย');
    }
  };

  const handleRestorePatient = async (patientId: string, patientName: string) => {
    if (!confirm(`คุณต้องการกู้คืนผู้ป่วย "${patientName}" กลับมาใช้งานหรือไม่?`)) {
      return;
    }

    try {
      const result = await restorePatient(patientId);
      if (result.success) {
        alert('กู้คืนผู้ป่วยสำเร็จ!');
        loadDeletedPatients(); // Refresh deleted list
        loadPatients(); // Refresh active list
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error restoring patient:', error);
      alert('เกิดข้อผิดพลาดในการกู้คืนผู้ป่วย');
    }
  };

  const handlePermanentlyDeletePatient = async (patientId: string, patientName: string) => {
    if (!confirm(`⚠️ คำเตือน: คุณกำลังจะลบผู้ป่วย "${patientName}" อย่างถาวร\n\nการกระทำนี้ไม่สามารถย้อนกลับได้ และข้อมูลทั้งหมดจะถูกลบออกจากระบบ\n\nคุณแน่ใจหรือไม่?`)) {
      return;
    }

    // ยืนยันอีกครั้ง
    if (!confirm('⚠️ ยืนยันครั้งสุดท้าย: การลบถาวรจะไม่สามารถกู้คืนข้อมูลกลับมาได้\n\nพิมพ์ "YES" เพื่อยืนยันการลบถาวร')) {
      return;
    }

    try {
      const result = await permanentlyDeletePatient(patientId);
      if (result.success) {
        alert('ลบผู้ป่วยถาวรสำเร็จ!');
        loadDeletedPatients(); // Refresh deleted list
        loadPatients(); // Refresh active list
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error permanently deleting patient:', error);
      alert('เกิดข้อผิดพลาดในการลบผู้ป่วยถาวร');
    }
  };

  const handleOpenDeletedModal = () => {
    setShowDeletedModal(true);
    loadDeletedPatients();
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = 
      patient.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.hospital_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.users?.id_card?.includes(searchTerm);
    
    const matchesPamLevel = pamLevelFilter === 'all' || patient.pam_level === pamLevelFilter;

    return matchesSearch && matchesPamLevel;
  });

  const getPamLevelColor = (level: string) => {
    switch (level) {
      case 'L1': return 'bg-red-100 text-red-700';
      case 'L2': return 'bg-yellow-100 text-yellow-700';
      case 'L3': return 'bg-blue-100 text-blue-700';
      case 'L4': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getZoneColor = (zone: string) => {
    if (zone?.includes('Green')) return 'text-green-600';
    if (zone?.includes('Red')) return 'text-red-600';
    return 'text-gray-600';
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
                ← กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">จัดการผู้ป่วย</h1>
              <p className="text-sm text-gray-600">ดูและจัดการข้อมูลผู้ป่วยทั้งหมด</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleOpenDeletedModal}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                <Archive className="w-4 h-4" />
                ผู้ป่วยที่ถูกลบ ({deletedPatients.length})
              </button>
              <button
                onClick={() => router.push('/admin/patients/new')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                ลงทะเบียนผู้ป่วยใหม่
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
        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="ค้นหาด้วย ชื่อ, HN, หรือ ID Card..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="md:w-48">
              <select
                value={pamLevelFilter}
                onChange={(e) => setPamLevelFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">ทุก PAM Level</option>
                <option value="L1">L1 - Deny</option>
                <option value="L2">L2 - General</option>
                <option value="L3">L3 - Intensive</option>
                <option value="L4">L4 - Champion</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-red-600 font-bold text-sm">L1</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">L1 (Deny)</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.pam_level === 'L1').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <span className="text-yellow-600 font-bold text-sm">L2</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">L2 (General)</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.pam_level === 'L2').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold text-sm">L3</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">L3 (Intensive)</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.pam_level === 'L3').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-bold text-sm">L4</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">L4 (Champion)</p>
                <p className="text-2xl font-bold text-gray-800">
                  {patients.filter(p => p.pam_level === 'L4').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">HN</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID Card</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM Level</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Step</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่ลงทะเบียน</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-gray-800">
                          {patient.hospital_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{patient.full_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-600">
                          {patient.users?.id_card || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPamLevelColor(patient.pam_level)}`}>
                          {patient.pam_level}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-medium ${getZoneColor(patient.zone)}`}>
                          {patient.zone || 'Green Zone'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{patient.current_step}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(patient.created_at).toLocaleDateString('th-TH')}
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
                          <button
                            onClick={() => handleDeletePatient(patient.id, patient.full_name)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="ลบ"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>แสดง {filteredPatients.length} จาก {patients.length} ผู้ป่วย</p>
        </div>
      </div>

      {/* Modal แสดงผู้ป่วยที่ถูกลบ */}
      {showDeletedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Archive className="w-6 h-6 text-gray-600" />
                  ผู้ป่วยที่ถูกลบ ({deletedPatients.length})
                </h2>
                <button
                  onClick={() => setShowDeletedModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                คลิก "กู้คืน" เพื่อนำผู้ป่วยกลับมาใช้งาน หรือ "ลบถาวร" เพื่อลบข้อมูลออกจากระบบอย่างถาวร
              </p>
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
                            <h3 className="font-semibold text-gray-800">{patient.full_name}</h3>
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                              {patient.hospital_number}
                            </span>
                            {patient.pam_level && (
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPamLevelColor(patient.pam_level)}`}>
                                {patient.pam_level}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>ID Card: {patient.users?.id_card || '-'}</p>
                            <p>Zone: {patient.zone || '-'}</p>
                            <p>ถูกลบเมื่อ: {new Date(patient.updated_at).toLocaleString('th-TH')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => router.push(`/admin/patients/${patient.id}`)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRestorePatient(patient.id, patient.full_name)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                            title="กู้คืนผู้ป่วย"
                          >
                            <RotateCcw className="w-4 h-4" />
                            กู้คืน
                          </button>
                          <button
                            onClick={() => handlePermanentlyDeletePatient(patient.id, patient.full_name)}
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