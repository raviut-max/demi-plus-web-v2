// app/admin/screening/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Select from 'react-select'; // ✅ เพิ่ม Import react-select
import {
  checkSession,
  logout,
  getScreeningQuestions,
  saveScreening,
  createDefaultGoals,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin
} from '@/lib/supabase/queries';
import { FileText, Save, ArrowLeft, LogOut, User, Hospital, Building2, UserCheck, XCircle } from 'lucide-react'; // ✅ เพิ่ม XCircle icon
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
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

export default function ScreeningPage() {
  const router = useRouter();
  
  // States
  const [patientIdFromUrl, setPatientIdFromUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [patientData, setPatientData] = useState<any>(null);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
  // PAM & PROMs States
  const [pamQuestions, setPamQuestions] = useState<any[]>([]);
  const [pamAnswers, setPamAnswers] = useState<Record<string, number>>({});
  const [promsQuestions, setPromsQuestions] = useState<any[]>([]);
  const [promsAnswers, setPromsAnswers] = useState<Record<string, number>>({});
  
  // Confidence States
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [confidencePlan, setConfidencePlan] = useState('');

  // =====================================================
  // INITIAL DATA LOADING
  // =====================================================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const pid = urlParams.get('patient_id');
      setPatientIdFromUrl(pid);
      if (pid) setSelectedPatient(pid);
    }
  }, []);

  useEffect(() => {
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
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  // =====================================================
  // DATA LOADING FUNCTIONS
  // =====================================================
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error(' [loadUserHospital] Error:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      loadPatients(ids);
      loadQuestions();
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    }
  };

  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      let query = supabase
        .from('profiles')
        .select(`*, hospitals ( id, name, type )`)
        .eq('is_active', true)
        .order('first_name', { ascending: true });
      
      if (hospitalIds && hospitalIds.length > 0) {
        query = query.in('hospital_id', hospitalIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const patientsWithData = data?.map(patient => ({
        ...patient,
        full_name: patient.first_name && patient.last_name
          ? `${patient.first_name} ${patient.last_name}`
          : '',
      })) || [];

      setPatients(patientsWithData);
    } catch (error) {
      console.error('❌ [loadPatients] Error:', error);
    }
  };

  useEffect(() => {
    if (selectedPatient && patients.length > 0) {
      loadPatientData(selectedPatient);
    }
  }, [selectedPatient, patients]);

  const loadPatientData = async (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient) setPatientData(patient);
  };

  const loadQuestions = async () => {
    try {
      const pamData = await getScreeningQuestions('pam');
      const promsData = await getScreeningQuestions('proms');
      setPamQuestions(pamData);
      setPromsQuestions(promsData);
    } catch (error) {
      console.error('❌ [loadQuestions] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // FORM HANDLERS
  // =====================================================
  const handlePamAnswer = (questionId: string, score: number) => {
    setPamAnswers(prev => ({ ...prev, [questionId]: score }));
  };

  const handlePromsAnswer = (questionId: string, score: number) => {
    setPromsAnswers(prev => ({ ...prev, [questionId]: score }));
  };

  // ✅ ฟังก์ชันยกเลิกการประเมิน (Reset State)
  const handleCancelAssessment = () => {
    if (confirm('คุณต้องการยกเลิกการประเมินนี้หรือไม่? ข้อมูลทั้งหมดจะหายไป')) {
      setSelectedPatient('');
      setPatientData(null);
      setPamAnswers({});
      setPromsAnswers({});
      setConfidenceScore(0);
      setConfidencePlan('');
    }
  };

  // =====================================================
  // CALCULATE PATIENT LEVEL
  // =====================================================
  const calculatePatientLevel = () => {
    const pamScores = Object.values(pamAnswers);
    const pamTotal = pamScores.reduce((a, b) => a + b, 0);
    const pamAvg = pamScores.length > 0 ? pamTotal / pamScores.length : 0;
    const pamMax = 20;

    const promsScores = Object.values(promsAnswers);
    const promsTotal = promsScores.reduce((a, b) => a + b, 0);
    const promsAvg = promsScores.length > 0 ? promsTotal / promsScores.length : 0;
    const promsMin = promsScores.length > 0 ? Math.min(...promsScores) : 0;
    const promsMax = 24;

    if (pamTotal <= 5) return { level: 'L1', zone: 'Red Zone', reason: 'PAM Score ต่ำมาก (≤5)', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, promsMin, priority: 'high', requiresIntensiveCare: true };
    if (promsMin <= 2) return { level: 'L1', zone: 'Red Zone', reason: 'PROMs มีข้อที่คะแนนต่ำมาก (≤2)', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, promsMin, priority: 'high', requiresIntensiveCare: true };
    if (promsTotal <= 8) return { level: 'L1', zone: 'Red Zone', reason: 'PROMs Score รวมต่ำมาก (≤8)', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, promsMin, priority: 'high', requiresIntensiveCare: true };

    const totalScore = pamTotal + promsTotal;
    const maxScore = 44;
    const percentage = (totalScore / maxScore) * 100;

    if (percentage >= 75) return { level: 'L4', zone: 'Green Zone', reason: 'มีความพร้อมสูงสุด', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, totalScore, maxScore, percentage, priority: 'low', requiresIntensiveCare: false };
    if (percentage >= 50) return { level: 'L3', zone: 'Yellow Zone', reason: 'มีความพร้อมปานกลาง', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, totalScore, maxScore, percentage, priority: 'medium', requiresIntensiveCare: false };
    
    return { level: 'L2', zone: 'Green Zone', reason: 'ต้องการการสนับสนุน', pamTotal, pamAvg, pamMax, promsTotal, promsAvg, promsMax, totalScore, maxScore, percentage, priority: 'medium', requiresIntensiveCare: false };
  };

  const handleSubmit = async () => {
    if (!selectedPatient) return alert('กรุณาเลือกผู้ป่วย');
    if (Object.keys(pamAnswers).length === 0) return alert('กรุณาตอบคำถาม PAM ให้ครบ');
    if (Object.keys(promsAnswers).length < 4) return alert('กรุณาตอบคำถาม PROMs ให้ครบทั้ง 4 ข้อ');
    
    // ✅ ยืนยันก่อนบันทึกจริง
    const isConfirmed = confirm(
      '️ คุณแน่ใจหรือไม่ว่าต้องการบันทึกผลการประเมินนี้?\n\n' +
      'โปรดตรวจสอบว่า:\n' +
      '- ตอบคำถาม PAM ครบทุกข้อ\n' +
      '- ตอบคำถาม PROMs ครบทุกข้อ\n' +
      '- ระบุระดับความมั่นใจเรียบร้อยแล้ว\n\n' +
      'เมื่อบันทึกแล้วจะไม่สามารถแก้ไขย้อนหลังได้'
    );

    if (!isConfirmed) return; // ✅ ยกเลิกถ้า user กด Cancel
    
    setSaving(true);
    try {
      const patientLevel = calculatePatientLevel();
      const promsEntries = Object.entries(promsAnswers);
      const promsQ1Score = promsEntries.find(([key]) => key.includes('proms1'))?.[1] || 0;
      const promsQ2Score = promsEntries.find(([key]) => key.includes('proms2'))?.[1] || 0;
      const promsQ3Score = promsEntries.find(([key]) => key.includes('proms3'))?.[1] || 0;
      const promsQ4Score = promsEntries.find(([key]) => key.includes('proms4'))?.[1] || 0;

      const responses = [
        ...Object.entries(pamAnswers).map(([qId, score]) => ({ question_id: qId, question_number: pamQuestions.find(q => q.id === qId)?.question_number || 0, question_type: 'pam', score })),
        ...Object.entries(promsAnswers).map(([qId, score]) => ({ question_id: qId, question_number: promsQuestions.find(q => q.id === qId)?.question_number || 0, question_type: 'proms', score })),
      ];

      const result = await saveScreening({
        user_id: selectedPatient,
        screening_type: 'full',
        pam_total_score: patientLevel.pamTotal,
        pam_level_result: patientLevel.level === 'L1' ? 'Deny' : patientLevel.level === 'L2' ? 'General' : patientLevel.level === 'L3' ? 'Intensive' : 'Champion',
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
        const goalsResult = await createDefaultGoals(selectedPatient, patientLevel.level, user?.id);
        let goalsMessage = '';
        if (goalsResult.success && goalsResult.count > 0) {
          goalsMessage = `\n\n🎯 สร้างเป้าหมายเริ่มต้นสำเร็จ: ${goalsResult.count} กิจกรรม`;
          if (patientLevel.level === 'L2' || patientLevel.level === 'L3') goalsMessage += '\n(กฎทอง 5 ข้อ - 5 วัน/สัปดาห์)';
          else if (patientLevel.level === 'L4') goalsMessage += '\n(แชมป์ 8 กิจกรรม - 5 วัน/สัปดาห์)';
        } else if (patientLevel.level === 'L1') {
          goalsMessage = '\n\n⚠️ ผู้ป่วยระดับ L1 - ไม่สร้างเป้าหมายอัตโนมัติ';
        }

        const confirmGoToGoals = confirm(
          `✅ บันทึกแบบประเมินสำเร็จ!\n\nระดับผู้ป่วย: ${patientLevel.level} - ${patientLevel.zone}\nเหตุผล: ${patientLevel.reason}${goalsMessage}\n\n ไปหน้าบันทึกเป้าหมายเลยหรือไม่?`
        );

        if (confirmGoToGoals) router.push(`/admin/patients/${selectedPatient}/goals/setup`);
        else router.back();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('❌ [handleSubmit] Error:', error);
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

  // ✅ Helper สำหรับแปลงข้อมูลผู้ป่วยให้เข้ากับ react-select
  const patientOptions = patients.map((patient) => ({
    value: patient.id,
    label: `${patient.hospital_number} - ${patient.full_name} (PAM: ${patient.pam_level})${patient.hospitals?.name ? ` - ${patient.hospitals.name}` : ''}`,
  }));

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
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">📝 แบบประเมินผู้ป่วย</h1>
              <p className="text-gray-600">แบบประเมิน PAM และ PROMs</p>
            </div>
            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'doctor' ? '👨‍️ แพทย์' : user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">🏥 ลูกข่าย</span>
                      )}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* ✅ SELECT PATIENT SECTION - จะหายไปเมื่อเลือกผู้ป่วยแล้ว */}
        {!patientIdFromUrl && !selectedPatient && patients.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> เลือกผู้ป่วย
            </h2>
            
            {/* ✅ เปลี่ยนจาก select เป็น react-searchable */}
            <Select
              options={patientOptions}
              value={patientOptions.find(opt => opt.value === selectedPatient)}
              onChange={(option) => setSelectedPatient(option?.value || '')}
              placeholder="-- พิมพ์ค้นหาผู้ป่วย (ชื่อ, สกุล, HN) --"
              isClearable
              isSearchable
              className="w-full"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '48px',
                  borderColor: '#d1d5db',
                  '&:hover': { borderColor: '#3b82f6' },
                }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#eff6ff' : undefined,
                  color: state.isSelected ? 'white' : '#1f2937',
                  padding: '12px 16px',
                }),
              }}
            />

            {accessibleHospitalIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                🔒 แสดงผู้ป่วยจาก {accessibleHospitalIds.length} โรงพยาบาลที่คุณมีสิทธิ์เข้าถึง
              </p>
            )}
          </div>
        )}

        {/* ✅ PATIENT INFO CARD - แสดงเสมอเมื่อมีผู้ป่วยที่เลือก */}
        {patientData && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">ผู้ป่วย: {patientData.first_name} {patientData.last_name}</p>
                <p className="text-sm text-blue-700">HN: {patientData.hospital_number} | PAM Level: {patientData.pam_level || 'L1'}</p>
                {patientData.hospitals && (
                  <p className="text-xs text-blue-600 mt-1"> สังกัด: {patientData.hospitals.name}{patientData.hospitals.type === 'main' ? ' (แม่ข่าย)' : ' (ลูกข่าย)'}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Assessment Forms - แสดงเมื่อเลือกผู้ป่วยแล้ว */}
        {selectedPatient && (
          <>
            {/* PAM Questions */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">แบบประเมิน PAM</h2>
              <p className="text-sm text-gray-600 mb-6">ไม้บรรทัดวัดใจ - กรุณาเลือกระดับที่ตรงกับคุณมากที่สุด (5 ข้อ × 4 คะแนน = 20 คะแนน)</p>
              <div className="space-y-8">
                {pamQuestions.map((q, index) => (
                  <div key={q.id} className="border-b border-gray-200 pb-6 last:border-0">
                    <p className="font-medium text-gray-800 mb-4">{index + 1}. {q.question_text}</p>
                    <div className="bg-gradient-to-r from-red-50 via-yellow-50 to-green-50 p-4 rounded-lg">
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[1, 2, 3, 4].map((score) => {
                          const optionText = q[`option_${score}_text`];
                          return (
                            <button
                              key={score}
                              onClick={() => handlePamAnswer(q.id, score)}
                              className={`px-3 py-3 rounded-lg border-2 transition-all text-sm ${
                                pamAnswers[q.id] === score ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-300 hover:border-gray-400 bg-white'
                              }`}
                            >
                              <div className="text-xs mb-1">{optionText}</div>
                              <div className="text-lg font-bold">{score}</div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="relative mt-3">
                        <div className="h-2 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"></div>
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                          <span>ไม่เห็นด้วย</span><span>เห็นด้วย</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {patientLevel.pamTotal > 0 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">คะแนน PAM: {patientLevel.pamTotal} / {patientLevel.pamMax} (เฉลี่ย {patientLevel.pamAvg.toFixed(2)} / 4)</p>
                </div>
              )}
            </div>

            {/* PROMs Questions */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">แบบประเมิน PROMs</h2>
              <p className="text-sm text-gray-600 mb-6">กรุณาเลือกคำตอบที่ตรงกับสุขภาพของคุณ (4 ข้อ × 6 คะแนน = 24 คะแนน)</p>
              <div className="space-y-8">
                {promsQuestions.map((q, index) => (
                  <div key={q.id} className="border-b border-gray-200 pb-6 last:border-0">
                    <p className="font-medium text-gray-800 mb-4">{index + 1}. {q.question_text}</p>
                    <div className="grid grid-cols-6 gap-2">
                      {[1, 2, 3, 4, 5, 6].map((score) => {
                        const optionText = q[`option_${score}_text`];
                        return (
                          <button
                            key={score}
                            onClick={() => handlePromsAnswer(q.id, score)}
                            className={`px-2 py-3 rounded-lg border-2 transition-all text-xs ${
                              promsAnswers[q.id] === score ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-gray-300 hover:border-gray-400 bg-white'
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
                <div className={`mt-6 p-4 rounded-lg border ${patientLevel.zone === 'Green Zone' ? 'bg-green-50 border-green-200' : patientLevel.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`text-sm font-medium ${patientLevel.zone === 'Green Zone' ? 'text-green-800' : patientLevel.zone === 'Yellow Zone' ? 'text-yellow-800' : 'text-red-800'}`}>
                    คะแนน PROMs: {patientLevel.promsTotal} / {patientLevel.promsMax} (เฉลี่ย {patientLevel.promsAvg.toFixed(2)} / 6){patientLevel.promsMin <= 2 && ' ⚠️ มีข้อที่คะแนนต่ำมาก'}
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            {patientLevel.level && (
              <div className={`p-6 rounded-xl border-2 mb-6 ${patientLevel.zone === 'Red Zone' ? 'bg-red-50 border-red-500' : patientLevel.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-500' : 'bg-green-50 border-green-500'}`}>
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
                        <div className="bg-blue-500 h-4 rounded-full transition-all" style={{ width: `${patientLevel.percentage}%` }}></div>
                      </div>
                      <p className="text-xl font-bold">{patientLevel.totalScore} / {patientLevel.maxScore} ({patientLevel.percentage.toFixed(1)}%)</p>
                    </div>
                  </div>
                )}
                <div className="bg-white bg-opacity-75 p-4 rounded-lg mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-3xl font-bold">{patientLevel.level} - {patientLevel.zone}</span>
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

            {/* Confidence Scale */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">ความมั่นใจในการดูแลตนเอง</h2>
              <p className="text-sm text-gray-600 mb-6">คุณมีความพร้อมในการทำเป้าหมายแค่ไหน (0-10)</p>
              <div className="mb-6">
                <div className="bg-gradient-to-r from-red-50 via-yellow-50 to-green-50 p-6 rounded-lg">
                  <div className="relative mb-4">
                    <div className="h-3 bg-gradient-to-r from-red-400 via-yellow-400 to-green-400 rounded-full"></div>
                    <div className="flex justify-between mt-2 text-xs text-gray-600">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          onClick={() => setConfidenceScore(num)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all ${
                            confidenceScore === num ? 'bg-blue-500 text-white scale-125' : 'bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span>น้อยที่สุด</span><span>มากที่สุด</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-600">{confidenceScore}</p>
                    <p className="text-sm text-gray-600">คะแนนความมั่นใจ</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">แผนการปรับปรุง</label>
                <textarea
                  value={confidencePlan}
                  onChange={(e) => setConfidencePlan(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ระบุแผนการปรับปรุงความมั่นใจในการดูแลตนเอง..."
                />
              </div>
            </div>

            {/* Submit Button & Cancel Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> กำลังบันทึก...</>
                ) : (
                  <><Save className="w-5 h-5" /> บันทึกแบบประเมิน</>
                )}
              </button>
              
              {/* ✅ ปุ่มยกเลิกการประเมิน */}
              <button
                onClick={handleCancelAssessment}
                disabled={saving}
                className="px-6 py-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-gray-300"
              >
                <XCircle className="w-5 h-5" /> ยกเลิก
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}