'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getScreeningQuestions, saveScreening } from '@/lib/supabase/queries';
import { FileText, Save, ArrowLeft, LogOut, AlertCircle } from 'lucide-react';

export default function ScreeningPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [selectedPatient, setSelectedPatient] = useState('');
  
  // PAM Questions & Answers
  const [pamQuestions, setPamQuestions] = useState<any[]>([]);
  const [pamAnswers, setPamAnswers] = useState<Record<string, number>>({});
  
  // PROMs Questions & Answers
  const [promsQuestions, setPromsQuestions] = useState<any[]>([]);
  const [promsAnswers, setPromsAnswers] = useState<Record<string, number>>({});
  
  // Confidence
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [confidencePlan, setConfidencePlan] = useState('');

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
    loadQuestions();
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadQuestions = async () => {
    try {
      const pamData = await getScreeningQuestions('pam');
      const promsData = await getScreeningQuestions('proms');
      
      setPamQuestions(pamData);
      setPromsQuestions(promsData);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePamAnswer = (questionId: string, score: number) => {
    setPamAnswers(prev => ({
      ...prev,
      [questionId]: score
    }));
  };

  const handlePromsAnswer = (questionId: string, score: number) => {
    setPromsAnswers(prev => ({
      ...prev,
      [questionId]: score
    }));
  };

  const calculatePAMScore = () => {
    const scores = Object.values(pamAnswers);
    if (scores.length === 0) return { total: 0, level: '', levelText: '' };
    
    const total = scores.reduce((a, b) => a + b, 0);
    const avg = total / scores.length;
    
    let level = '';
    let levelText = '';
    
    if (avg <= 1.5) {
      level = 'L1';
      levelText = 'Deny';
    } else if (avg <= 2.5) {
      level = 'L2';
      levelText = 'General';
    } else if (avg <= 3.5) {
      level = 'L3';
      levelText = 'Intensive';
    } else {
      level = 'L4';
      levelText = 'Champion';
    }
    
    return { total, level, levelText };
  };

  const calculatePROMSScore = () => {
    const scores = Object.values(promsAnswers);
    if (scores.length === 0) return { total: 0, zone: '', hasLowScore: false };
    
    const total = scores.reduce((a, b) => a + b, 0);
    const avg = total / scores.length;
    
    let zone = '';
    let hasLowScore = false;
    
    if (avg >= 5) {
      zone = 'Green Zone';
    } else if (avg >= 3) {
      zone = 'Yellow Zone';
    } else {
      zone = 'Red Zone';
      hasLowScore = true;
    }
    
    return { total, zone, hasLowScore };
  };

const handleSubmit = async () => {
  if (!selectedPatient) {
    alert('กรุณาเลือกผู้ป่วย');
    return;
  }

  if (Object.keys(pamAnswers).length === 0) {
    alert('กรุณาตอบคำถาม PAM ให้ครบ');
    return;
  }

  if (Object.keys(promsAnswers).length < 4) {
    alert('กรุณาตอบคำถาม PROMs ให้ครบทั้ง 4 ข้อ');
    return;
  }

  setSaving(true);

  try {
    const pamResult = calculatePAMScore();
    const promsResult = calculatePROMSScore();

    // แปลง answers object เป็น array เพื่อดูว่ามีอะไรบ้าง
    console.log('📊 PAM Answers:', pamAnswers);
    console.log('📊 PROMs Answers:', promsAnswers);
    console.log('📊 PROMs Questions:', promsQuestions);

    // ดึงคะแนนจาก answers โดยใช้ key ที่ถูกต้อง
    const promsEntries = Object.entries(promsAnswers);
    const promsQ1Score = promsEntries.find(([key]) => key.includes('proms1'))?.[1] || 0;
    const promsQ2Score = promsEntries.find(([key]) => key.includes('proms2'))?.[1] || 0;
    const promsQ3Score = promsEntries.find(([key]) => key.includes('proms3'))?.[1] || 0;
    const promsQ4Score = promsEntries.find(([key]) => key.includes('proms4'))?.[1] || 0;

    console.log('📊 Sending PROMs scores:', {
      q1: promsQ1Score,
      q2: promsQ2Score,
      q3: promsQ3Score,
      q4: promsQ4Score,
      total: promsResult.total
    });

    // Prepare responses
    const responses = [
      ...Object.entries(pamAnswers).map(([questionId, score]) => ({
        question_id: questionId,
        question_number: pamQuestions.find(q => q.id === questionId)?.question_number || 0,
        question_type: 'pam',
        score,
      })),
      ...Object.entries(promsAnswers).map(([questionId, score]) => ({
        question_id: questionId,
        question_number: promsQuestions.find(q => q.id === questionId)?.question_number || 0,
        question_type: 'proms',
        score,
      })),
    ];

    const result = await saveScreening({
      user_id: selectedPatient,
      screening_type: 'full', // ✅ เปลี่ยนจาก 'pam_proms' เป็น 'full'
      pam_total_score: pamResult.total,
      pam_level_result: pamResult.levelText,
      proms_q1_score: promsQ1Score,
      proms_q2_score: promsQ2Score,
      proms_q3_score: promsQ3Score,
      proms_q4_score: promsQ4Score,
      proms_zone: promsResult.zone,
      proms_has_low_score: promsResult.hasLowScore,
      confidence_score: confidenceScore,
      confidence_improvement_plan: confidencePlan,
      conducted_by: user?.id,
      responses,
    });

    if (result.success) {
      alert('บันทึกแบบประเมินสำเร็จ!');
      // Reset form
      setSelectedPatient('');
      setPamAnswers({});
      setPromsAnswers({});
      setConfidenceScore(0);
      setConfidencePlan('');
    } else {
      alert('เกิดข้อผิดพลาด: ' + result.error);
    }
  } catch (error) {
    console.error('Error saving screening:', error);
    alert('เกิดข้อผิดพลาดในการบันทึก');
  } finally {
    setSaving(false);
  }
};

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const pamResult = calculatePAMScore();
  const promsResult = calculatePROMSScore();

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-8">
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
              <h1 className="text-2xl font-bold text-gray-800">แบบประเมินผู้ป่วย</h1>
              <p className="text-sm text-gray-600">แบบประเมิน PAM และ PROMs</p>
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Select Patient */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            เลือกผู้ป่วย
          </h2>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">-- เลือกผู้ป่วย --</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.hospital_number} - {patient.full_name} (PAM: {patient.pam_level})
              </option>
            ))}
          </select>
        </div>

        {selectedPatient && (
          <>
            {/* PAM Questions - ไม้บรรทัดวัดใจ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">แบบประเมิน PAM</h2>
              <p className="text-sm text-gray-600 mb-6">
                ไม้บรรทัดวัดใจ - กรุณาเลือกระดับที่ตรงกับคุณมากที่สุด
              </p>
              
              <div className="space-y-8">
                {pamQuestions.map((q, index) => (
                  <div key={q.id} className="border-b border-gray-200 pb-6 last:border-0">
                    <p className="font-medium text-gray-800 mb-4">
                      {index + 1}. {q.question_text}
                    </p>
                    
                    {/* ไม้บรรทัดวัดใจ */}
                    <div className="bg-gradient-to-r from-red-50 via-yellow-50 to-green-50 p-4 rounded-lg">
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[1, 2, 3, 4].map((score) => {
                          const optionText = q[`option_${score}_text`];
                          return (
                            <button
                              key={score}
                              onClick={() => handlePamAnswer(q.id, score)}
                              className={`px-3 py-3 rounded-lg border-2 transition-all text-sm ${
                                pamAnswers[q.id] === score
                                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                                  : 'border-gray-300 hover:border-gray-400 bg-white'
                              }`}
                            >
                              <div className="text-xs mb-1">{optionText}</div>
                              <div className="text-lg font-bold">{score}</div>
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* ไม้บรรทัด */}
                      <div className="relative mt-3">
                        <div className="h-2 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"></div>
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                          <span>ไม่เห็นด้วย</span>
                          <span>เห็นด้วย</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pamResult.level && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">
                    คะแนน PAM: {pamResult.total.toFixed(1)} | ระดับ: {pamResult.level} ({pamResult.levelText})
                  </p>
                </div>
              )}
            </div>

            {/* PROMs Questions - 6 ระดับ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">แบบประเมิน PROMs</h2>
              <p className="text-sm text-gray-600 mb-6">
                กรุณาเลือกคำตอบที่ตรงกับสุขภาพของคุณ (1-6)
              </p>
              
              <div className="space-y-8">
                {promsQuestions.map((q, index) => (
                  <div key={q.id} className="border-b border-gray-200 pb-6 last:border-0">
                    <p className="font-medium text-gray-800 mb-4">
                      {index + 1}. {q.question_text}
                    </p>
                    
                    {/* 6 ระดับ */}
                    <div className="grid grid-cols-6 gap-2">
                      {[1, 2, 3, 4, 5, 6].map((score) => {
                        const optionText = q[`option_${score}_text`];
                        return (
                          <button
                            key={score}
                            onClick={() => handlePromsAnswer(q.id, score)}
                            className={`px-2 py-3 rounded-lg border-2 transition-all text-xs ${
                              promsAnswers[q.id] === score
                                ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                                : 'border-gray-300 hover:border-gray-400 bg-white'
                            }`}
                          >
                            <div className="mb-1">{optionText}</div>
                            <div className="text-lg font-bold">{score}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {promsResult.zone && (
                <div className={`mt-6 p-4 rounded-lg border ${
                  promsResult.zone === 'Green Zone' ? 'bg-green-50 border-green-200' :
                  promsResult.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${
                    promsResult.zone === 'Green Zone' ? 'text-green-800' :
                    promsResult.zone === 'Yellow Zone' ? 'text-yellow-800' :
                    'text-red-800'
                  }`}>
                    คะแนน PROMs: {promsResult.total.toFixed(1)} | Zone: {promsResult.zone}
                    {promsResult.hasLowScore && ' ⚠️ ต้องการการดูแลเป็นพิเศษ'}
                  </p>
                </div>
              )}
            </div>

            {/* Confidence Scale - ไม้บรรทัดความมั่นใจ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">ความมั่นใจในการดูแลตนเอง</h2>
              <p className="text-sm text-gray-600 mb-6">
                คุณมีความพร้อมในการทำเป้าหมายแค่ไหน (0-10)
              </p>
              
              <div className="mb-6">
                <div className="bg-gradient-to-r from-red-50 via-yellow-50 to-green-50 p-6 rounded-lg">
                  {/* ไม้บรรทัด */}
                  <div className="relative mb-4">
                    <div className="h-3 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"></div>
                    <div className="flex justify-between mt-2 text-xs text-gray-600">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          onClick={() => setConfidenceScore(num)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all ${
                            confidenceScore === num
                              ? 'bg-blue-500 text-white scale-125'
                              : 'bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span>น้อยที่สุด</span>
                      <span>มากที่สุด</span>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-600">{confidenceScore}</p>
                    <p className="text-sm text-gray-600">คะแนนความมั่นใจ</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  แผนการปรับปรุง
                </label>
                <textarea
                  value={confidencePlan}
                  onChange={(e) => setConfidencePlan(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ระบุแผนการปรับปรุงความมั่นใจในการดูแลตนเอง..."
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    กำลังบันทึก...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    บันทึกแบบประเมิน
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}