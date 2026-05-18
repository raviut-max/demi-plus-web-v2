// app/admin/cleanup-goals/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Trash2, AlertTriangle, CheckCircle, Search, User } from 'lucide-react';

interface DuplicateGoal {
  user_id: string;
  patient_name?: string;
  hospital_number?: string;
  record_date: string;
  goal_name: string;
  count: number;
  goal_ids: string[];
}

export default function CleanupGoalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGoal[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [searchHN, setSearchHN] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [stats, setStats] = useState({
    totalDuplicates: 0,
    totalGoalsToDelete: 0,
    affectedPatients: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadPatients();
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchHN = (value: string) => {
    setSearchHN(value);
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }
    const filtered = patients.filter(patient => 
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase()) ||
      patient.full_name?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  const handleSearchName = (value: string) => {
    setSearchName(value);
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }
    const filtered = patients.filter(patient => 
      patient.full_name?.toLowerCase().includes(value.toLowerCase()) ||
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient.id);
    setSearchHN('');
    setSearchName('');
    setShowSearchDropdown(false);
    setFilteredPatients([]);
    findDuplicates(patient.id);
  };

  const findDuplicates = async (patientId?: string) => {
    try {
      console.log('🔍 Finding duplicate goals...');
      
      let query = supabase
        .from('goals')
        .select(`
          user_id,
          goal_name,
          created_at::date as record_date,
          id,
          status
        `)
        .eq('goal_type', 'weekly_activity')
        .order('created_at', { ascending: false });

      if (patientId) {
        query = query.eq('user_id', patientId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error finding duplicates:', error);
        return;
      }

      // จัดกลุ่มตาม user_id, record_date, goal_name
      const groupedData = new Map<string, any[]>();
      
      data?.forEach((goal: any) => {
        const key = `${goal.user_id}|${goal.record_date}|${goal.goal_name}`;
        if (!groupedData.has(key)) {
          groupedData.set(key, []);
        }
        groupedData.get(key)!.push(goal);
      });

      // หาตัวที่มีซ้ำ (มากกว่า 1)
      const duplicateList: DuplicateGoal[] = [];
      let totalToDelete = 0;
      const affectedPatientsSet = new Set<string>();

      groupedData.forEach((goals, key) => {
        if (goals.length > 1) {
          const [userId, recordDate, goalName] = key.split('|');
          
          // เก็บ IDs ที่จะเป็นลบ (ทั้งหมด ยกเว้นตัวล่าสุด)
          const goalIds = goals.map(g => g.id);
          const toDelete = goalIds.slice(1); // ลบทั้งหมดยกเว้นตัวแรก (ล่าสุด)
          
          duplicateList.push({
            user_id: userId,
            record_date: recordDate,
            goal_name: goalName,
            count: goals.length,
            goal_ids: toDelete,
          });

          totalToDelete += toDelete.length;
          affectedPatientsSet.add(userId);
        }
      });

      setDuplicates(duplicateList);
      setStats({
        totalDuplicates: duplicateList.length,
        totalGoalsToDelete: totalToDelete,
        affectedPatients: affectedPatientsSet.size,
      });

      console.log('📊 Found duplicates:', duplicateList.length);
      console.log('🗑️ Total goals to delete:', totalToDelete);

    } catch (error) {
      console.error('Error finding duplicates:', error);
    }
  };

  const cleanupDuplicates = async () => {
    if (!confirm(`⚠️ ต้องการลบข้อมูลซ้ำ ${stats.totalGoalsToDelete} รายการหรือไม่?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้!`)) {
      return;
    }

    setCleaning(true);

    try {
      let deletedCount = 0;
      let errorCount = 0;

      for (const duplicate of duplicates) {
        for (const goalId of duplicate.goal_ids) {
          const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', goalId);

          if (error) {
            console.error(`Error deleting goal ${goalId}:`, error);
            errorCount++;
          } else {
            deletedCount++;
          }
        }
      }

      alert(`✅ ลบข้อมูลซ้ำสำเร็จ!\n\nลบไปทั้งหมด: ${deletedCount} รายการ\nข้อผิดพลาด: ${errorCount}`);
      
      // Refresh duplicates
      await findDuplicates(selectedPatient || undefined);

    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      alert('เกิดข้อผิดพลาดในการลบข้อมูล');
    } finally {
      setCleaning(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
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
              <h1 className="text-2xl font-bold text-gray-800">ทำความสะอาดข้อมูล Goals</h1>
              <p className="text-sm text-gray-600">ลบเป้าหมายที่ซ้ำซ้อนในวันเดียวกัน</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Warning Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">คำเตือน</h3>
              <p className="text-sm text-yellow-700 mt-1">
                หน้านี้จะลบเป้าหมายที่ซ้ำซ้อนในวันเดียวกัน โดยจะเก็บเฉพาะเป้าหมายล่าสุดของแต่ละกิจกรรม
                การลบข้อมูลนี้ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
              </p>
            </div>
          </div>
        </div>

        {/* Search Patient */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">เลือกผู้ป่วย (หรือไม่เลือกเพื่อค้นหาทั้งหมด)</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                🔍 ค้นหาด้วย HN
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchHN}
                  onChange={(e) => handleSearchHN(e.target.value)}
                  placeholder="พิมพ์ HN เพื่อค้นหา..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                👤 ค้นหาด้วยชื่อ
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => handleSearchName(e.target.value)}
                  placeholder="พิมพ์ชื่อผู้ป่วยเพื่อค้นหา..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {showSearchDropdown && filteredPatients.length > 0 && (
            <div className="mb-4 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {patient.hospital_number} - {patient.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        PAM: {patient.pam_level}
                      </p>
                    </div>
                    <div className="text-sm text-blue-600 font-medium">คลิกเลือก</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => findDuplicates(selectedPatient || undefined)}
              className="flex-1 bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 font-semibold"
            >
              🔍 ค้นหาข้อมูลซ้ำ
            </button>
            {selectedPatient && (
              <button
                onClick={() => {
                  setSelectedPatient('');
                  setDuplicates([]);
                  setStats({ totalDuplicates: 0, totalGoalsToDelete: 0, affectedPatients: 0 });
                }}
                className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ล้างการเลือก
              </button>
            )}
          </div>
        </div>

        {/* Statistics */}
        {duplicates.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-600 font-semibold">จำนวนรายการซ้ำ</p>
                <p className="text-3xl font-bold text-red-700 mt-1">{stats.totalDuplicates}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="text-sm text-orange-600 font-semibold">จำนวน Goals ที่จะลบ</p>
                <p className="text-3xl font-bold text-orange-700 mt-1">{stats.totalGoalsToDelete}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-600 font-semibold">ผู้ป่วยที่ได้รับผลกระทบ</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{stats.affectedPatients}</p>
              </div>
            </div>

            {/* Cleanup Button */}
            <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
              <button
                onClick={cleanupDuplicates}
                disabled={cleaning || stats.totalGoalsToDelete === 0}
                className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white font-bold py-4 rounded-xl hover:from-red-600 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {cleaning ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    กำลังลบข้อมูล...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5" />
                    ลบข้อมูลซ้ำ {stats.totalGoalsToDelete} รายการ
                  </>
                )}
              </button>
            </div>

            {/* Duplicates List */}
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800">รายการข้อมูลซ้ำ</h2>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {duplicates.map((duplicate, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          {duplicate.goal_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          วันที่: {new Date(duplicate.record_date).toLocaleDateString('th-TH')}
                        </p>
                        <p className="text-sm text-gray-500">
                          ผู้ป่วย: {duplicate.user_id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">
                          ซ้ำ {duplicate.count} ครั้ง
                        </p>
                        <p className="text-xs text-gray-500">
                          จะลบ {duplicate.goal_ids.length} รายการ
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* No Duplicates */}
        {duplicates.length === 0 && stats.totalDuplicates === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 border text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">ไม่พบข้อมูลซ้ำ</h3>
            <p className="text-gray-600">ระบบไม่พบเป้าหมายที่ซ้ำซ้อนในวันเดียวกัน</p>
          </div>
        )}
      </div>
    </div>
  );
}