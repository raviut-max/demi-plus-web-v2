// app/admin/patients/[id]/screening-history/page.tsx
// ✅ แก้ไขล่าสุด: 22 เมษายน 2569
// ✅ การแก้ไข: เอาปุ่ม "เริ่มการประเมินครั้งแรก" ออก เหลือเพียงปุ่ม "ประเมินใหม่" เท่านั้น

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getScreeningHistory,
  getAllScreeningQuestions
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  FileText,
  TrendingUp,
  Calendar,
  Activity,
  Heart,
  Plus,
  Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function ScreeningHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [screenings, setScreenings] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedScreening, setSelectedScreening] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      // โหลดข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      // โหลดประวัติ screening
      const screeningsData = await getScreeningHistory(patientId);
      setScreenings(screeningsData);

      // โหลดคำถามทั้งหมด
      const questionsData = await getAllScreeningQuestions();
      setQuestions(questionsData);

      console.log('📋 Screenings loaded:', screeningsData.length);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleViewDetail = (screening: any) => {
    setSelectedScreening(screening);
    setShowDetailModal(true);
  };

  const getPamLevelColor = (level: string) => {
    switch (level) {
      case 'L1': return 'bg-red-100 text-red-700 border-red-300';
      case 'L2': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'L3': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'L4': return 'bg-green-100 text-green-700 border-green-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getZoneColor = (zone: string) => {
    switch (zone) {
      case 'Red Zone': return 'bg-red-100 text-red-700';
      case 'Yellow Zone': return 'bg-yellow-100 text-yellow-700';
      case 'Green Zone': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getScreeningQuestions = (screening: any, type: string) => {
    const responses = screening.screening_responses?.filter((r: any) => r.question_type === type) || [];
    return responses.map((r: any) => {
      const question = questions.find(q => q.id === r.question_id);
      return {
        question: question,
        response: r,
      };
    });
  };

  // คำนวณสถิติ
  const stats = {
    total: screenings.length,
    latest: screenings[0],
    pamLevels: screenings.reduce((acc: any, s: any) => {
      acc[s.pam_level_result] = (acc[s.pam_level_result] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    zones: screenings.reduce((acc: any, s: any) => {
      acc[s.proms_zone] = (acc[s.proms_zone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 ประวัติการประเมิน
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number}
              </p>
            </div>
            
            {/* ✅ แก้ไข: ใช้ปุ่ม "ประเมินใหม่" เท่านั้น (ไม่ว่าจะมีประวัติหรือไม่) */}
            <button
              onClick={() => router.push(`/admin/screening?patient_id=${patientId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
            >
              <Plus className="w-4 h-4" />
              ประเมินใหม่
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ประเมินทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">PAM Level ปัจจุบัน</p>
                <p className="text-2xl font-bold text-gray-800">{patient?.pam_level || 'L1'}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Heart className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Zone ปัจจุบัน</p>
                <p className="text-lg font-bold text-gray-800">{patient?.zone || 'Green Zone'}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">คะแนน PAM</p>
                <p className="text-2xl font-bold text-gray-800">{patient?.pam_score || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline/Schedule View */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              ไทม์ไลน์การประเมิน
            </h2>
          </div>
          
          <div className="p-6">
            {screenings.length === 0 ? (
              /* ✅ แก้ไข: เอาปุ่ม "เริ่มการประเมินครั้งแรก" ออก เหลือแค่ข้อความ */
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">ยังไม่มีประวัติการประเมิน</p>
                <p className="text-sm text-gray-400">
                  คลิกปุ่ม "ประเมินใหม่" ด้านบนเพื่อเริ่มการประเมินครั้งแรก
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {screenings.map((screening, index) => (
                  <div 
                    key={screening.id} 
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg font-bold text-gray-800">
                            ครั้งที่ {screenings.length - index}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPamLevelColor(screening.pam_level_result)}`}>
                            {screening.pam_level_result}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getZoneColor(screening.proms_zone)}`}>
                            {screening.proms_zone}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">วันที่ประเมิน</p>
                            <p className="font-medium text-gray-800">
                              {new Date(screening.screening_date).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">คะแนน PAM</p>
                            <p className="font-medium text-purple-600">{screening.pam_total_score} / 20</p>
                          </div>
                          <div>
                            <p className="text-gray-500">คะแนน PROMs</p>
                            <p className="font-medium text-green-600">
                              {screening.proms_q1_score + screening.proms_q2_score + screening.proms_q3_score + screening.proms_q4_score} / 24
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">ผู้ประเมิน</p>
                            <p className="font-medium text-gray-800">
                              {screening.users?.full_name_th || '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleViewDetail(screening)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trend Chart (Simple) */}
        {screenings.length > 1 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                แนวโน้มคะแนน PAM
              </h2>
            </div>
            
            <div className="p-6">
              <div className="h-64 flex items-end gap-4">
                {screenings.slice().reverse().map((screening, index) => {
                  const percentage = (screening.pam_total_score / 20) * 100;
                  return (
                    <div key={screening.id} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-gray-200 rounded-t-lg relative" style={{ height: '200px' }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-t-lg transition-all ${
                            percentage >= 75 ? 'bg-green-500' :
                            percentage >= 50 ? 'bg-blue-500' :
                            percentage >= 25 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ height: `${percentage}%` }}
                        >
                          <div className="absolute top-2 left-0 right-0 text-center text-white text-xs font-bold">
                            {screening.pam_total_score}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-2 text-center">
                        ครั้งที่ {index+1}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(screening.screening_date).toLocaleDateString('th-TH', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedScreening && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" />
                  รายละเอียดการประเมิน
                </h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(selectedScreening.screening_date).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* สรุปผลการประเมิน */}
              <div className={`p-6 rounded-xl border-2 ${
                selectedScreening.proms_zone === 'Red Zone' ? 'bg-red-50 border-red-500' :
                selectedScreening.proms_zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-500' :
                'bg-green-50 border-green-500'
              }`}>
                <h3 className="text-xl font-bold mb-4">📊 สรุปผลการประเมิน</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">คะแนน PAM</p>
                    <p className="text-3xl font-bold">{selectedScreening.pam_total_score} / 20</p>
                  </div>
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">คะแนน PROMs</p>
                    <p className="text-3xl font-bold">
                      {selectedScreening.proms_q1_score + selectedScreening.proms_q2_score + selectedScreening.proms_q3_score + selectedScreening.proms_q4_score} / 24
                    </p>
                  </div>
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">PAM Level</p>
                    <p className="text-2xl font-bold">{selectedScreening.pam_level_result}</p>
                  </div>
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">Zone</p>
                    <p className="text-xl font-bold">{selectedScreening.proms_zone}</p>
                  </div>
                </div>
              </div>

              {/* คำถาม PAM */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  แบบประเมิน PAM (ไม้บรรทัดวัดใจ)
                </h3>
                <div className="space-y-4">
                  {getScreeningQuestions(selectedScreening, 'pam').map((item: any, index: number) => (
                    <div key={item.question?.id || index} className="border border-gray-200 rounded-lg p-4">
                      <p className="font-medium text-gray-800 mb-3">
                        {index + 1}. {item.question?.question_text}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map((score) => (
                          <div
                            key={score}
                            className={`px-3 py-2 rounded-lg border-2 text-center text-sm ${
                              item.response?.score === score
                                ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="text-xs mb-1">{item.question?.[`option_${score}_text`]}</div>
                            <div className="text-lg font-bold">{score}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* คำถาม PROMs */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-green-600" />
                  แบบประเมิน PROMs
                </h3>
                <div className="space-y-4">
                  {getScreeningQuestions(selectedScreening, 'proms').map((item: any, index: number) => (
                    <div key={item.question?.id || index} className="border border-gray-200 rounded-lg p-4">
                      <p className="font-medium text-gray-800 mb-3">
                        {index + 1}. {item.question?.question_text}
                      </p>
                      <div className="grid grid-cols-6 gap-2">
                        {[1, 2, 3, 4, 5, 6].map((score) => (
                          <div
                            key={score}
                            className={`px-2 py-2 rounded-lg border-2 text-center text-xs ${
                              item.response?.score === score
                                ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="mb-1">{item.question?.[`option_${score}_text`]}</div>
                            <div className="text-lg font-bold">{score}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ความมั่นใจ */}
              {selectedScreening.confidence_score && (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-4">ความมั่นใจในการดูแลตนเอง</h3>
                  <div className="bg-gradient-to-r from-red-50 via-yellow-50 to-green-50 p-6 rounded-lg">
                    <div className="text-center mb-4">
                      <p className="text-4xl font-bold text-blue-600 mb-2">{selectedScreening.confidence_score} / 10</p>
                      <p className="text-sm text-gray-600">คะแนนความมั่นใจ</p>
                    </div>
                    {selectedScreening.confidence_improvement_plan && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">แผนการปรับปรุง:</p>
                        <p className="text-gray-800 bg-white bg-opacity-50 p-3 rounded-lg">
                          {selectedScreening.confidence_improvement_plan}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0">
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all font-bold"
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