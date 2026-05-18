// app/admin/screening/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  checkSession, 
  logout, 
  getScreeningQuestions, 
  saveScreening,
  getPatientList 
} from '@/lib/supabase/queries'; // ✅ Using your existing queries.ts
import { ArrowLeft, Save, User, FileText, LogOut } from 'lucide-react';

export default function ScreeningPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [screeningType, setScreeningType] = useState<'pam' | 'proms'>('pam');

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    // ✅ Added 'osm' to allowed roles
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    
    setUser(userData);
    loadPatients();
    loadQuestions('pam');
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (type: 'pam' | 'proms') => {
    try {
      const data = await getScreeningQuestions(type);
      setQuestions(data || []);
      setAnswers({});
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  };

  const handleTypeChange = (type: 'pam' | 'proms') => {
    setScreeningType(type);
    loadQuestions(type);
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }

    if (Object.keys(answers).length === 0) {
      alert('กรุณาตอบคำถามให้ครบถ้วน');
      return;
    }

    setSaving(true);

    try {
      // ✅ Prepare responses for your saveScreening function
      const responses = questions.map(q => ({
        question_id: q.id,
        question_number: q.question_number,
        question_type: screeningType,
        selected_option: answers[q.id] || '',
        score: parseInt(answers[q.id] || '0')
      }));

      // ✅ Call your existing saveScreening function
      const result = await saveScreening({
        user_id: selectedPatientId,
        screening_type: screeningType,
        responses,
        conducted_by: user?.id
      });

      if (result.success) {
        alert('บันทึกผลประเมินสำเร็จ!');
        router.push('/admin/patients');
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSaving(false);
    }
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
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📝 ทำแบบประเมินผู้ป่วย</h1>
            <button
              onClick={() => { logout(); router.push('/admin/login'); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Selection */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5" /> เลือกผู้ป่วย
            </h2>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} (HN: {p.hospital_number})
                </option>
              ))}
            </select>
          </div>

          {/* Screening Type Tabs */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> ประเภทแบบประเมิน
            </h2>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => handleTypeChange('pam')}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  screeningType === 'pam'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                PAM (Patient Activation Measure)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('proms')}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  screeningType === 'proms'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                PROMS (Patient Reported Outcome Measures)
              </button>
            </div>
          </div>

          {/* Questions */}
          {selectedPatientId && questions.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                📋 คำถามแบบประเมิน ({screeningType.toUpperCase()})
              </h2>
              <div className="space-y-6">
                {questions.map((q) => (
                  <div key={q.id} className="border-b border-gray-100 pb-4 last:border-0">
                    <p className="font-medium text-gray-800 mb-3">
                      {q.question_number}. {q.question_text_th || q.question_text}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options?.map((option: any) => (
                        <label
                          key={option.id}
                          className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`question_${q.id}`}
                            value={option.score}
                            checked={answers[q.id] === option.score?.toString()}
                            onChange={() => handleAnswerChange(q.id, option.score?.toString())}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="ml-3 text-gray-700">{option.option_text}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          {selectedPatientId && (
            <button
              type="submit"
              disabled={saving || Object.keys(answers).length < questions.length}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึกผลประเมิน
                </>
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}