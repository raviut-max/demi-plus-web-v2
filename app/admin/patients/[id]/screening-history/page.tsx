'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getScreeningHistory, getAllScreeningQuestions } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, FileText, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ScreeningHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null); // ✅ เพิ่ม state ผู้ป่วย
  const [screenings, setScreenings] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedScreening, setExpandedScreening] = useState<string | null>(null);

  useEffect(() => {
    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadData();
  }, [patientId]);

  const loadData = async () => {
    try {
      // ✅ Fetch ข้อมูลผู้ป่วย
      const { data: patientData } = await supabase
        .from('profiles')
        .select(`
          *,
          users (
            id_card
          )
        `)
        .eq('id', patientId)
        .single();

      setPatient(patientData);

      // Fetch ข้อมูล screening
      const [screeningsData, questionsData] = await Promise.all([
        getScreeningHistory(patientId),
        getAllScreeningQuestions()
      ]);
      
      console.log('📊 Screenings Data:', screeningsData);
      setScreenings(screeningsData);
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const toggleExpand = (screeningId: string) => {
    setExpandedScreening(expandedScreening === screeningId ? null : screeningId);
  };

  const getQuestionText = (questionId: string, questionType: string, questionNumber: number) => {
    const question = questions.find(q => 
      q.id === questionId && 
      q.question_type === questionType && 
      q.question_number === questionNumber
    );
    return question?.question_text || `คำถามที่ ${questionNumber}`;
  };

  const getOptionText = (questionId: string, questionType: string, questionNumber: number, score: number) => {
    const question = questions.find(q => 
      q.id === questionId && 
      q.question_type === questionType && 
      q.question_number === questionNumber
    );
    
    if (!question) return score;
    
    const optionKey = `option_${score}_text`;
    return question[optionKey] || score;
  };

  // ✅ คำนวณคะแนนรวม PROMs จาก screening_responses
  const calculatePROMSTotalFromResponses = (screening: any) => {
    const promsResponses = screening.screening_responses?.filter((r: any) => r.question_type === 'proms') || [];
    
    if (promsResponses.length === 0) {
      const q1 = screening.proms_q1_score || 0;
      const q2 = screening.proms_q2_score || 0;
      const q3 = screening.proms_q3_score || 0;
      const q4 = screening.proms_q4_score || 0;
      
      const total = q1 + q2 + q3 + q4;
      return total > 0 ? total : null;
    }
    
    const total = promsResponses.reduce((sum: number, r: any) => sum + (r.score || 0), 0);
    return total > 0 ? total : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
                onClick={() => router.push(`/admin/patients/${patientId}`)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-800">ประวัติการประเมิน</h1>
              
              {/* ✅ แสดงข้อมูลผู้ป่วย */}
              {patient && (
                <div className="mt-2 flex items-center gap-4 text-sm">
                  <span className="text-gray-600">
                    <span className="font-semibold">HN:</span> {patient.hospital_number}
                  </span>
                  <span className="text-gray-600">
                    <span className="font-semibold">ชื่อ:</span> {patient.full_name}
                  </span>
                  {patient.users && (
                    <span className="text-gray-600">
                      <span className="font-semibold">ID Card:</span> {patient.users.id_card}
                    </span>
                  )}
                </div>
              )}
            </div>
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

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {screenings.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-600 mb-4">ยังไม่มีประวัติการประเมิน</p>
            <button
              onClick={() => router.push(`/admin/screening?patient=${patientId}`)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              ทำแบบประเมินครั้งแรก
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {screenings.map((screening) => (
              <div key={screening.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                {/* Header - สรุป */}
                <div 
                  className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(screening.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        {new Date(screening.screening_date).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </h3>
                      <p className="text-sm text-gray-500">ประเภท: {screening.screening_type}</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex gap-2">
                        {screening.pam_level_result && (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            screening.pam_level_result === 'Deny' ? 'bg-red-100 text-red-700' :
                            screening.pam_level_result === 'General' ? 'bg-yellow-100 text-yellow-700' :
                            screening.pam_level_result === 'Intensive' ? 'bg-blue-100 text-blue-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {screening.pam_level_result}
                          </span>
                        )}
                        {screening.proms_zone && (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            screening.proms_zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                            screening.proms_zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {screening.proms_zone}
                          </span>
                        )}
                      </div>
                      
                      <button className="text-gray-400 hover:text-gray-600">
                        {expandedScreening === screening.id ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* คะแนนรวม */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500">คะแนน PAM</p>
                      <p className="text-xl font-bold text-blue-600">
                        {screening.pam_total_score || '-'}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500">คะแนน PROMs</p>
                      <p className="text-xl font-bold text-purple-600">
                        {calculatePROMSTotalFromResponses(screening) || '-'}
                      </p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500">ความมั่นใจ</p>
                      <p className="text-xl font-bold text-green-600">
                        {screening.confidence_score || '-'}/10
                      </p>
                    </div>
                  </div>
                </div>

                {/* รายละเอียด - แสดงเมื่อ expand */}
                {expandedScreening === screening.id && (
                  <div className="border-t border-gray-200 p-6 bg-gray-50">
                    <h4 className="font-bold text-gray-800 mb-4">รายละเอียดคำตอบ</h4>
                    
                    {/* PAM Responses */}
                    <div className="mb-6">
                      <h5 className="font-semibold text-blue-700 mb-3">แบบประเมิน PAM</h5>
                      <div className="space-y-3">
                        {screening.screening_responses
                          .filter((r: any) => r.question_type === 'pam')
                          .sort((a: any, b: any) => a.question_number - b.question_number)
                          .map((response: any, index: number) => (
                            <div key={index} className="bg-white p-4 rounded-lg border border-gray-200">
                              <p className="text-sm font-medium text-gray-800 mb-2">
                                {response.question_number}. {getQuestionText(response.question_id, 'pam', response.question_number)}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">คำตอบ:</span>
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                                  {getOptionText(response.question_id, 'pam', response.question_number, response.score)}
                                </span>
                                <span className="text-sm text-gray-500">(คะแนน: {response.score})</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* PROMs Responses */}
                    <div className="mb-6">
                      <h5 className="font-semibold text-purple-700 mb-3">แบบประเมิน PROMs</h5>
                      <div className="space-y-3">
                        {screening.screening_responses
                          .filter((r: any) => r.question_type === 'proms')
                          .sort((a: any, b: any) => a.question_number - b.question_number)
                          .map((response: any, index: number) => (
                            <div key={index} className="bg-white p-4 rounded-lg border border-gray-200">
                              <p className="text-sm font-medium text-gray-800 mb-2">
                                {response.question_number}. {getQuestionText(response.question_id, 'proms', response.question_number)}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">คำตอบ:</span>
                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                                  {getOptionText(response.question_id, 'proms', response.question_number, response.score)}
                                </span>
                                <span className="text-sm text-gray-500">(คะแนน: {response.score})</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Confidence */}
                    {screening.confidence_improvement_plan && (
                      <div>
                        <h5 className="font-semibold text-green-700 mb-3">แผนการปรับปรุง</h5>
                        <p className="text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200">
                          {screening.confidence_improvement_plan}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}