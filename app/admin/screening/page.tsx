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

  // =====================================================
  // 📊 ฟังก์ชันคำนวณระดับผู้ป่วย (ฉบับแก้ไข)
  // =====================================================
  /**
   * ระบบการประเมินระดับผู้ป่วยแบบมีเงื่อนไข
   * 
   * คะแนน:
   * - PAM: 5 ข้อ × 4 คะแนน = 20 คะแนน (สูงสุด)
   * - PROMs: 4 ข้อ × 6 คะแนน = 24 คะแนน (สูงสุด)
   * - รวม: 44 คะแนน
   * 
   * เงื่อนไขบังคับ Red Zone (L1):
   * 1. PAM ≤ 5 → L1 ทันที (ไม่ว่า PROMs จะเป็นเท่าไหร่)
   * 2. PROMs ข้อใดข้อหนึ่ง ≤ 2 → L1 ทันที
   * 3. PROMs รวม ≤ 8 → L1 ทันที
   * 
   * เงื่อนไขอื่นๆ (PAM > 5 และ PROMs > 10):
   * - L2: คะแนนรวม < 22 (< 50%)
   * - L3: คะแนนรวม 22-32 (50-75%)
   * - L4: คะแนนรวม ≥ 33 (≥ 75%)
   */
  const calculatePatientLevel = () => {
    // คำนวณคะแนน PAM
    const pamScores = Object.values(pamAnswers);
    const pamTotal = pamScores.reduce((a, b) => a + b, 0);
    const pamAvg = pamScores.length > 0 ? pamTotal / pamScores.length : 0;
    const pamMax = 20; // 5 ข้อ × 4 คะแนน

    // คำนวณคะแนน PROMs
    const promsScores = Object.values(promsAnswers);
    const promsTotal = promsScores.reduce((a, b) => a + b, 0);
    const promsAvg = promsScores.length > 0 ? promsTotal / promsScores.length : 0;
    const promsMin = promsScores.length > 0 ? Math.min(...promsScores) : 0;
    const promsMax = 24; // 4 ข้อ × 6 คะแนน

    // ===========================================
    // 🔴 เงื่อนไขบังคับ Red Zone (L1)
    // ===========================================
    
    // 1. PAM ≤ 5 → L1 ทันที
    if (pamTotal <= 5) {
      return {
        level: 'L1',
        zone: 'Red Zone',
        reason: 'PAM Score ต่ำมาก (≤5 จาก 20)',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        promsMin,
        priority: 'high',
        requiresIntensiveCare: true,
      };
    }

    // 2. PROMs ข้อใดข้อหนึ่ง ≤ 2 → L1 ทันที
    if (promsMin <= 2) {
      return {
        level: 'L1',
        zone: 'Red Zone',
        reason: 'PROMs มีข้อที่คะแนนต่ำมาก (≤2)',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        promsMin,
        priority: 'high',
        requiresIntensiveCare: true,
      };
    }

    // 3. PROMs รวม ≤ 8 → L1 ทันที
    if (promsTotal <= 8) {
      return {
        level: 'L1',
        zone: 'Red Zone',
        reason: 'PROMs Score รวมต่ำมาก (≤10 จาก 24)',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        promsMin,
        priority: 'high',
        requiresIntensiveCare: true,
      };
    }

    // ===========================================
    // 🟢🟡 พิจารณาตามคะแนนรวม (PAM + PROMs)
    // ===========================================
    const totalScore = pamTotal + promsTotal;
    const maxScore = 44; // 20 + 24
    const percentage = (totalScore / maxScore) * 100;

    if (percentage >= 75) {
      // L4: Champion (≥75% = ≥33 คะแนน)
      return {
        level: 'L4',
        zone: 'Green Zone',
        reason: 'มีความพร้อมสูงสุด',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        totalScore,
        maxScore,
        percentage,
        priority: 'low',
        requiresIntensiveCare: false,
      };
    } else if (percentage >= 50) {
      // L3: Intensive (50-74% = 22-32 คะแนน)
      return {
        level: 'L3',
        zone: 'Yellow Zone',
        reason: 'มีความพร้อมปานกลาง',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        totalScore,
        maxScore,
        percentage,
        priority: 'medium',
        requiresIntensiveCare: false,
      };
    } else {
      // L2: General (<50% = <22 คะแนน)
      return {
        level: 'L2',
        zone: 'Green Zone',
        reason: 'ต้องการการสนับสนุน',
        pamTotal,
        pamAvg,
        pamMax,
        promsTotal,
        promsAvg,
        promsMax,
        totalScore,
        maxScore,
        percentage,
        priority: 'medium',
        requiresIntensiveCare: false,
      };
    }
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
      // คำนวณระดับผู้ป่วย
      const patientLevel = calculatePatientLevel();

      console.log('📊 Patient Level Result:', patientLevel);

      // ดึงคะแนนแต่ละข้อของ PROMs
      const promsEntries = Object.entries(promsAnswers);
      const promsQ1Score = promsEntries.find(([key]) => key.includes('proms1'))?.[1] || 0;
      const promsQ2Score = promsEntries.find(([key]) => key.includes('proms2'))?.[1] || 0;
      const promsQ3Score = promsEntries.find(([key]) => key.includes('proms3'))?.[1] || 0;
      const promsQ4Score = promsEntries.find(([key]) => key.includes('proms4'))?.[1] || 0;

      console.log('📊 PROMs Scores:', {
        q1: promsQ1Score,
        q2: promsQ2Score,
        q3: promsQ3Score,
        q4: promsQ4Score,
        total: patientLevel.promsTotal,
        min: patientLevel.promsMin,
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
        screening_type: 'full',
        pam_total_score: patientLevel.pamTotal,
        pam_level_result: patientLevel.level === 'L1' ? 'Deny' : 
                          patientLevel.level === 'L2' ? 'General' : 
                          patientLevel.level === 'L3' ? 'Intensive' : 'Champion',
        proms_q1_score: promsQ1Score,
        proms_q2_score: promsQ2Score,
        proms_q3_score: promsQ3Score,
        proms_q4_score: promsQ4Score,
        proms_zone: patientLevel.zone,
        proms_has_low_score: patientLevel.promsMin <= 2,
        confidence_score: confidenceScore,
        confidence_improvement_plan: confidencePlan,
        conducted_by: user?.id,
        responses,
      });

      if (result.success) {
        alert(`บันทึกแบบประเมินสำเร็จ!\n\nระดับผู้ป่วย: ${patientLevel.level} - ${patientLevel.zone}\nเหตุผล: ${patientLevel.reason}`);
        
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

  const patientLevel = calculatePatientLevel();

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
                ไม้บรรทัดวัดใจ - กรุณาเลือกระดับที่ตรงกับคุณมากที่สุด (5 ข้อ × 4 คะแนน = 20 คะแนน)
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

              {patientLevel.pamTotal > 0 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">
                    คะแนน PAM: {patientLevel.pamTotal} / {patientLevel.pamMax} 
                    (เฉลี่ย {patientLevel.pamAvg.toFixed(2)} / 4)
                  </p>
                </div>
              )}
            </div>

            {/* PROMs Questions - 6 ระดับ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">แบบประเมิน PROMs</h2>
              <p className="text-sm text-gray-600 mb-6">
                กรุณาเลือกคำตอบที่ตรงกับสุขภาพของคุณ (4 ข้อ × 6 คะแนน = 24 คะแนน)
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

              {patientLevel.promsTotal > 0 && (
                <div className={`mt-6 p-4 rounded-lg border ${
                  patientLevel.zone === 'Green Zone' ? 'bg-green-50 border-green-200' :
                  patientLevel.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${
                    patientLevel.zone === 'Green Zone' ? 'text-green-800' :
                    patientLevel.zone === 'Yellow Zone' ? 'text-yellow-800' :
                    'text-red-800'
                  }`}>
                    คะแนน PROMs: {patientLevel.promsTotal} / {patientLevel.promsMax}
                    (เฉลี่ย {patientLevel.promsAvg.toFixed(2)} / 6)
                    {patientLevel.promsMin <= 2 && ' ⚠️ มีข้อที่คะแนนต่ำมาก'}
                  </p>
                </div>
              )}
            </div>

            {/* สรุปผลการประเมิน */}
            {patientLevel.level && (
              <div className={`p-6 rounded-xl border-2 mb-6 ${
                patientLevel.zone === 'Red Zone' ? 'bg-red-50 border-red-500' :
                patientLevel.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-500' :
                'bg-green-50 border-green-500'
              }`}>
                <h3 className="text-2xl font-bold mb-4">📊 สรุปผลการประเมิน</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">คะแนน PAM</p>
                    <p className="text-3xl font-bold">{patientLevel.pamTotal} / {patientLevel.pamMax}</p>
                    <p className="text-sm">เฉลี่ย: {patientLevel.pamAvg.toFixed(2)} / 4</p>
                  </div>
                  <div className="bg-white bg-opacity-50 p-4 rounded-lg">
                    <p className="text-sm opacity-75">คะแนน PROMs</p>
                    <p className="text-3xl font-bold">{patientLevel.promsTotal} / {patientLevel.promsMax}</p>
                    <p className="text-sm">เฉลี่ย: {patientLevel.promsAvg.toFixed(2)} / 6</p>
                  </div>
                </div>

                {patientLevel.totalScore && (
                  <div className="mb-4">
                    <p className="text-sm opacity-75">คะแนนรวม</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white bg-opacity-50 rounded-full h-4">
                        <div 
                          className="bg-blue-500 h-4 rounded-full transition-all"
                          style={{ width: `${patientLevel.percentage}%` }}
                        />
                      </div>
                      <p className="text-xl font-bold">{patientLevel.totalScore} / {patientLevel.maxScore} ({patientLevel.percentage.toFixed(1)}%)</p>
                    </div>
                  </div>
                )}

                <div className="bg-white bg-opacity-75 p-4 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl font-bold">
                      {patientLevel.level} - {patientLevel.zone}
                    </span>
                  </div>
                  <p className="text-lg">📌 {patientLevel.reason}</p>
                </div>

                {patientLevel.requiresIntensiveCare && (
                  <div className="bg-red-500 bg-opacity-20 border-2 border-red-500 p-4 rounded-lg">
                    <p className="font-bold text-red-700">⚠️ ต้องการการดูแลอย่างใกล้ชิด</p>
                    <p className="text-sm text-red-600">ผู้ป่วยควรได้รับการติดตามและสนับสนุนเป็นพิเศษ</p>
                  </div>
                )}
              </div>
            )}

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