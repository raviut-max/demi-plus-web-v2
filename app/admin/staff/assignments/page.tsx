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
  getHospitalsWithHierarchy
} from '@/lib/supabase/queries';
import {
  CreditCard, Plus, CheckCircle, XCircle, Archive,
  Search, Filter, Hospital, User, Calendar,
  LogOut, ArrowLeft, Building2, Clock
} from 'lucide-react';

interface PendingCard {
  id?: string;
  id_card: string;
  full_name_th: string;
  role: 'admin' | 'doctor' | 'helper' | 'osm';
  hospital_id?: string;
  created_at: string;
  specialization_th?: string;
  source: 'pending' | 'approved';
  hospitals?: { id: string; name: string; code: string };
  status?: string;
}

export default function IdCardAssignmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [pendingCards, setPendingCards] = useState<PendingCard[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<PendingCard | null>(null);
  const [assignForm, setAssignForm] = useState({
    hospital_id: '',
    notes: ''
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

  const handleAssign = async () => {
    if (!selectedCard || !assignForm.hospital_id) {
      alert('กรุณาเลือกโรงพยาบาล');
      return;
    }
    const result = await assignIdCard({
      id_card: selectedCard.id_card,
      hospital_id: assignForm.hospital_id,
      assigned_by: user.id,
      notes: assignForm.notes
    });

    if (result.success) {
      alert('บรรจุ ID Card สำเร็จ!');
      setShowAssignModal(false);
      setSelectedCard(null);
      setAssignForm({ hospital_id: '', notes: '' });
      await loadData(accessibleHospitalIds);
    } else {
      alert('เกิดข้อผิดพลาด: ' + result.error);
    }
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'doctor': return 'แพทย์';
      case 'helper': return 'เจ้าหน้าที่';
      case 'osm': return 'อสม.';
      case 'admin': return 'ผู้ดูแลระบบ';
      default: return '-';
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <CreditCard className="w-8 h-8" />
                จัดการการบรรจุ ID Card
              </h1>
              <p className="text-gray-600">
                จัดการบรรจุ ID Card แยกตามโรงพยาบาล
              </p>
            </div>
            <button
              onClick={() => router.push('/admin/staff/register')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              ลงทะเบียนใหม่
            </button>
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
                    <tr key={`${card.source}-${card.id_card}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-sm">{card.id_card}</td>
                      <td className="px-6 py-4">{card.full_name_th}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs w-fit">
                            {getRoleLabel(card.role)}
                          </span>
                          {card.source === 'pending' ? (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] w-fit flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              รออนุมัติ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] w-fit flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              อนุมัติแล้ว
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {card.hospitals?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(card.created_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedCard(card);
                            setAssignForm({ ...assignForm, hospital_id: card.hospital_id || '' });
                            setShowAssignModal(true);
                          }}
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

        {/* Active Assignments Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              ID Card ที่บรรจุแล้ว ({assignments.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">ID Card</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">โรงพยาบาล</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">ผู้บรรจุ</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">วันที่บรรจุ</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <p>ยังไม่มี ID Card ที่บรรจุ</p>
                    </td>
                  </tr>
                ) : (
                  assignments.map((assignment) => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-mono text-sm">{assignment.id_card}</td>
                      <td className="px-6 py-4">
                        {assignment.assigned_by_user?.full_name_th || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Hospital className="w-4 h-4 text-blue-500" />
                          <span className="text-sm">{assignment.hospitals?.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {assignment.assigned_by_user?.full_name_th || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(assignment.assigned_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleCancel(assignment.id)}
                          className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600"
                        >
                          <XCircle className="w-3 h-3" />
                          ยกเลิก
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

      {/* Assign Modal */}
      {showAssignModal && selectedCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">บรรจุ ID Card</h2>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                ID Card: <span className="font-mono font-bold">{selectedCard.id_card}</span>
              </p>
              <p className="text-sm text-gray-600">ชื่อ: {selectedCard.full_name_th}</p>
              <p className="text-sm text-gray-600">
                บทบาท: {getRoleLabel(selectedCard.role)}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                โรงพยาบาล *
              </label>
              <select
                value={assignForm.hospital_id}
                onChange={(e) => setAssignForm({ ...assignForm, hospital_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- เลือกโรงพยาบาล --</option>
                {hospitals.map((h: any) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเหตุ
              </label>
              <textarea
                value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="บันทึกข้อมูลเพิ่มเติม (ถ้ามี)"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAssign}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
              >
                บันทึก
              </button>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedCard(null);
                  setAssignForm({ hospital_id: '', notes: '' });
                }}
                className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}