'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getUserHospitalInfo,
  isSuperAdmin,
  isHospitalAdmin
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Save,
  User,
  Calendar,
  Activity,
  FileText,
  AlertCircle,
  CheckCircle,
  Hospital,
  Shield,
  LogOut,
  Upload
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface PatientDetail {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  birth_date: string;
  gender: string;
  phone?: string;
  email?: string;
  pam_level?: string;
  zone?: string;
  hospitals?: {
    name: string;
    code: string;
  };
}

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_hospital?: {
    name: string;
  };
}

export default function FollowupPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [followupRound, setFollowupRound] = useState(1);

  // Form states
  const [formData, setFormData] = useState({
    weight: '',
    waist_circumference: '',
    blood_pressure_sys: '',
    blood_pressure_dia: '',
    blood_sugar_dtx: '',
    life_schedule_image_url: '',
    adaptation_summary: '',
    adaptation_obstacles: '',
    adaptation_opportunities: '',
    adaptation_other: '',
    food_amount_status: '' as 'completed' | 'not_completed' | 'not_in_plan' | '',
    food_type_status: '' as 'completed' | 'not_completed' | 'not_in_plan' | '',
    movement_status: '' as 'completed' | 'not_completed' | 'not_in_plan' | '',
    food_amount_note: '',
    food_type_note: '',
    movement_note: '',
    confidence_score: '',
    confidence_improvement_plan: '',
    summary: '',
    recommendations: '',
    followup_status: '' as 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'monitoring' | '',
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadUserHospital(userData.id);
    
    // Only fetch patient data if id is not "new"
    if (params.id !== 'new') {
      loadPatientData(params.id);
    } else {
      setLoading(false);
    }
  }, [params.id, router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadPatientData = async (appointmentId: string) => {
    try {
      setLoading(true);
      setAppointmentId(appointmentId);

      // Fetch appointment details first to get patient_id
      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select('user_id, followup_round')
        .eq('id', appointmentId)
        .single();

      if (apptError) throw apptError;

      if (appointment) {
        // Fetch patient details
        const patientData = await getPatientDetail(appointment.user_id);
        setPatient(patientData);
        setFollowupRound(appointment.followup_round || 1);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('followup-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('followup-images')
        .getPublicUrl(fileName);

      setFormData(prev => ({
        ...prev,
        [field]: data.publicUrl
      }));

      alert('อัปโหลดรูปภาพสำเร็จ');
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('ไม่พบข้อมูลผู้ใช้งาน');
      return;
    }

    try {
      setSaving(true);

      const submitData = {
        appointment_id: appointmentId,
        user_id: patient?.id,
        followup_date: new Date().toISOString(),
        followup_round: followupRound,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
        blood_pressure_sys: formData.blood_pressure_sys ? parseInt(formData.blood_pressure_sys) : null,
        blood_pressure_dia: formData.blood_pressure_dia ? parseInt(formData.blood_pressure_dia) : null,
        blood_sugar_dtx: formData.blood_sugar_dtx ? parseInt(formData.blood_sugar_dtx) : null,
        life_schedule_image_url: formData.life_schedule_image_url || null,
        adaptation_summary: formData.adaptation_summary || null,
        adaptation_obstacles: formData.adaptation_obstacles || null,
        adaptation_opportunities: formData.adaptation_opportunities || null,
        adaptation_other: formData.adaptation_other || null,
        food_amount_status: formData.food_amount_status || null,
        food_type_status: formData.food_type_status || null,
        movement_status: formData.movement_status || null,
        food_amount_note: formData.food_amount_note || null,
        food_type_note: formData.food_type_note || null,
        movement_note: formData.movement_note || null,
        confidence_score: formData.confidence_score ? parseInt(formData.confidence_score) : null,
        confidence_improvement_plan: formData.confidence_improvement_plan || null,
        summary: formData.summary || null,
        recommendations: formData.recommendations || null,
        followup_status: formData.followup_status || null,
        conducted_by: user.id,
      };

      const { error } = await supabase
        .from('appointment_followups')
        .insert(submitData);

      if (error) throw error;

      alert('บันทึกผลการติดตามสำเร็จ');
      router.push('/admin/appointments');
    } catch (error: any) {
      console.error('Error saving followup:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
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
      {/* Header with User Info */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/appointments')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Title */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                บันทึกผลการติดตามนัดหมาย
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient ? `${patient.first_name} ${patient.last_name}` : 'ใหม่'} | 
                HN: {patient?.hospital_number || '-'} | 
                ครั้งที่: {followupRound}
              </p>
            </div>

            {/* User Info Card */}
            {user && userHospital && (
              <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-800 text-sm truncate max-w-[150px]">
                      {user.full_name_th || 'ผู้ดูแลระบบ'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${
                      isSuperAdmin(user) ? 'bg-purple-200 text-purple-700' :
                      isHospitalAdmin(user) ? 'bg-blue-200 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {isSuperAdmin(user) ? '👑 Super Admin' : 
                       isHospitalAdmin(user) ? '🏥 Hospital Admin' : 
                       'เจ้าหน้าที่'}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 text-gray-500">
                      <Hospital className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{userHospital.name}</span>
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <span className="text-[10px] text-gray-400">
                          ({userHospital.parent_hospital.name})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Patient Info Card */}
      {patient && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-green-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5" />
              ข้อมูลผู้ป่วย
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-green-600 mb-1">ชื่อ-นามสกุล</p>
                <p className="font-semibold text-gray-800">
                  {patient.first_name} {patient.last_name}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-600 mb-1">HN</p>
                <p className="font-semibold text-gray-800">{patient.hospital_number}</p>
              </div>
              <div>
                <p className="text-sm text-green-600 mb-1">วันเกิด</p>
                <p className="font-semibold text-gray-800">
                  {new Date(patient.birth_date).toLocaleDateString('th-TH')}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-600 mb-1">เพศ</p>
                <p className="font-semibold text-gray-800">
                  {patient.gender === 'male' ? 'ชาย' : patient.gender === 'female' ? 'หญิง' : 'อื่นๆ'}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-600 mb-1">PAM Level</p>
                <p className="font-semibold text-gray-800">{patient.pam_level || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-green-600 mb-1">Zone</p>
                <p className="font-semibold text-gray-800">{patient.zone || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Health Data */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">บันทึกข้อมูลสุขภาพ</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  น้ำหนัก (kg.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น 80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รอบเอว (ซม.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.waist_circumference}
                  onChange={(e) => setFormData({ ...formData, waist_circumference: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น 100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ความดันโลหิต (mmHg)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.blood_pressure_sys}
                    onChange={(e) => setFormData({ ...formData, blood_pressure_sys: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="SYS"
                  />
                  <span className="text-gray-500">/</span>
                  <input
                    type="number"
                    value={formData.blood_pressure_dia}
                    onChange={(e) => setFormData({ ...formData, blood_pressure_dia: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="DIA"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ค่าน้ำตาล (DTX) mg%
                </label>
                <input
                  type="number"
                  value={formData.blood_sugar_dtx}
                  onChange={(e) => setFormData({ ...formData, blood_sugar_dtx: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น 110"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Adaptation */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-bold">2</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">ความก้าวหน้าในการปรับตัว</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ตารางชีวิตของฉัน
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>อัปโหลดรูปภาพ/ใบงาน</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'life_schedule_image_url')}
                      className="hidden"
                    />
                  </label>
                  {formData.life_schedule_image_url && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      อัปโหลดแล้ว
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สรุปการปรับตัว
                </label>
                <select
                  value={formData.adaptation_summary}
                  onChange={(e) => setFormData({ ...formData, adaptation_summary: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- เลือก --</option>
                  <option value="ดีขึ้น">ดีขึ้น</option>
                  <option value="คงที่">คงที่</option>
                  <option value="แย่ลง">แย่ลง</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    อุปสรรคในการปรับตัว
                  </label>
                  <textarea
                    value={formData.adaptation_obstacles}
                    onChange={(e) => setFormData({ ...formData, adaptation_obstacles: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="บรรยายอุปสรรค..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    โอกาสในการปรับตัว
                  </label>
                  <textarea
                    value={formData.adaptation_opportunities}
                    onChange={(e) => setFormData({ ...formData, adaptation_opportunities: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="บรรยายโอกาส..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  อื่นๆ
                </label>
                <textarea
                  value={formData.adaptation_other}
                  onChange={(e) => setFormData({ ...formData, adaptation_other: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="รายละเอียดเพิ่มเติม..."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Food & Exercise */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <span className="text-yellow-600 font-bold">3</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">อาหารและการออกกำลังกาย</h2>
            </div>

            <div className="space-y-6">
              {/* Food Amount */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3">ปริมาณอาหาร</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">สถานะ</label>
                    <select
                      value={formData.food_amount_status}
                      onChange={(e) => setFormData({ ...formData, food_amount_status: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- เลือก --</option>
                      <option value="completed">ทำตามแผน</option>
                      <option value="not_completed">ไม่ทำตามแผน</option>
                      <option value="not_in_plan">ไม่มีในแผน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">บันทึก</label>
                    <input
                      type="text"
                      value={formData.food_amount_note}
                      onChange={(e) => setFormData({ ...formData, food_amount_note: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="บันทึกเพิ่มเติม..."
                    />
                  </div>
                </div>
              </div>

              {/* Food Type */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3">ประเภทอาหาร</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">สถานะ</label>
                    <select
                      value={formData.food_type_status}
                      onChange={(e) => setFormData({ ...formData, food_type_status: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- เลือก --</option>
                      <option value="completed">ทำตามแผน</option>
                      <option value="not_completed">ไม่ทำตามแผน</option>
                      <option value="not_in_plan">ไม่มีในแผน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">บันทึก</label>
                    <input
                      type="text"
                      value={formData.food_type_note}
                      onChange={(e) => setFormData({ ...formData, food_type_note: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="บันทึกเพิ่มเติม..."
                    />
                  </div>
                </div>
              </div>

              {/* Movement */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3">การออกกำลังกาย</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">สถานะ</label>
                    <select
                      value={formData.movement_status}
                      onChange={(e) => setFormData({ ...formData, movement_status: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- เลือก --</option>
                      <option value="completed">ทำตามแผน</option>
                      <option value="not_completed">ไม่ทำตามแผน</option>
                      <option value="not_in_plan">ไม่มีในแผน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">บันทึก</label>
                    <input
                      type="text"
                      value={formData.movement_note}
                      onChange={(e) => setFormData({ ...formData, movement_note: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="บันทึกเพิ่มเติม..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Confidence */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-bold">4</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">ความมั่นใจ</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  คะแนนความมั่นใจ (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.confidence_score}
                  onChange={(e) => setFormData({ ...formData, confidence_score: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="เช่น 75"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  แผนการเพิ่มความมั่นใจ
                </label>
                <input
                  type="text"
                  value={formData.confidence_improvement_plan}
                  onChange={(e) => setFormData({ ...formData, confidence_improvement_plan: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="แผนการ..."
                />
              </div>
            </div>
          </div>

          {/* Section 5: Summary */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-red-600 font-bold">5</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">สรุปและข้อเสนอแนะ</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สรุปผลการติดตาม
                </label>
                <textarea
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="สรุปผลการติดตาม..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ข้อเสนอแนะ
                </label>
                <textarea
                  value={formData.recommendations}
                  onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="ข้อเสนอแนะสำหรับผู้ป่วย..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สถานะการติดตาม
                </label>
                <select
                  value={formData.followup_status}
                  onChange={(e) => setFormData({ ...formData, followup_status: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- เลือก --</option>
                  <option value="excellent">ยอดเยี่ยม</option>
                  <option value="good">ดี</option>
                  <option value="fair">ปานกลาง</option>
                  <option value="needs_improvement">ต้องปรับปรุง</option>
                  <option value="monitoring">เฝ้าระวัง</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/admin/appointments')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกผลการติดตาม'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}