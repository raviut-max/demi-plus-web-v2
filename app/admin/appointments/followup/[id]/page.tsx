// app/admin/appointments/followup/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 16 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ปรับส่วนหัวให้กระชับ สวยงาม ประหยัดพื้นที่
//    2. แสดงข้อมูลผู้ป่วย: ชื่อ, HN, โรงพยาบาล
//    3. แสดงข้อมูลผู้ใช้งาน: ชื่อ, บทบาท, สังกัด
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { checkSession, logout, getUserHospitalInfo, isSuperAdmin, isHospitalAdmin } from '@/lib/supabase/queries';
import { ArrowLeft, Save, Upload, AlertCircle, FileText, Calendar, User, Hospital, Shield, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function FollowupPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const appointmentId = params.id as string;
  const patientIdFromQuery = searchParams.get('patient_id');
  
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFloating, setUploadingFloating] = useState(false);
  const [uploadingDream, setUploadingDream] = useState(false);
  const [appointment, setAppointment] = useState<any>(null);
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [followupRound, setFollowupRound] = useState(1);
  const [pastFollowups, setPastFollowups] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    // 1. ข้อมูลสุขภาพ
    weight: '',
    waist_circumference: '',
    blood_pressure_sys: '',
    blood_pressure_dia: '',
    blood_sugar_dtx: '',
    
    // 2. ความก้าวหน้าในการปรับตัว
    life_schedule_image_url: '',
    adaptation_summary: '',
    adaptation_obstacles: '',
    adaptation_opportunities: '',
    adaptation_other: '',
    
    // 3. กราฟวัดลอยจม (ใหม่)
    floating_chart_image_url: '',
    floating_chart_summary: '',
    
    // 4. การ์ดภาพความฝัน (ใหม่)
    dream_card_image_url: '',
    dream_card_description: '',
    
    // 5. ติดตามแผนปฏิบัติกิจกรรม (ย้ายจาก 3 → 5)
    food_amount_status: 'not_in_plan',
    food_type_status: 'not_in_plan',
    movement_status: 'not_in_plan',
    food_amount_note: '',
    food_type_note: '',
    movement_note: '',
    
    // 6. คะแนนไม้บรรทัดวัดใจ (เดิม 4 → 6)
    confidence_score: 5,
    confidence_improvement_plan: '',
    
    // 7. สรุป (เดิม 5 → 7)
    summary: '',
    recommendations: '',
    
    // 8. สถานะการติดตาม (เดิม 6 → 8)
    followup_status: 'fair',
  });

  // ✅ useEffect สำหรับตรวจสอบ session และโหลดข้อมูลเริ่มต้น
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
    loadUserHospital(userData.id);
    loadAppointmentData();
  }, [router]);

  // ✅ useEffect สำหรับนับรอบ followup
  useEffect(() => {
    if (appointment?.user_id || patientIdFromQuery) {
      loadFollowupRound();
    }
  }, [appointment, patientIdFromQuery]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAppointmentData = async () => {
    try {
      console.log('🔍 Loading appointment:', appointmentId, 'Patient ID from query:', patientIdFromQuery);
      setError(null);
      
      let patientId = patientIdFromQuery;
      
      // ถ้ามี appointment_id ให้โหลดข้อมูล appointment
      if (appointmentId && appointmentId !== 'new') {
        const { data: aptData, error: aptError } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .single();

        if (aptError) throw aptError;
        setAppointment(aptData);
        patientId = aptData.user_id;
      }
      
      // โหลดข้อมูลคนไข้
      if (patientId) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(`
            id,
            first_name,
            last_name,
            hospital_number,
            hospitals (
              id,
              name,
              code,
              type,
              parent_hospital:hospitals!parent_id (
                id,
                name,
                code
              )
            )
          `)
          .eq('id', patientId)
          .single();

        if (profileError) {
          console.error('Error loading patient profile:', profileError);
        } else if (profileData) {
          setPatientProfile(profileData);
          console.log('✅ Patient profile loaded:', profileData);
        }

        const { data: historyData } = await supabase
          .from('appointment_followups')
          .select('*')
          .eq('user_id', patientId)
          .order('followup_date', { ascending: false })
          .limit(3);

        if (historyData) {
          setPastFollowups(historyData);
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('❌ เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFollowupRound = async () => {
    const userId = patientIdFromQuery || appointment?.user_id;
    if (userId) {
      const { count } = await supabase
        .from('appointment_followups')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      setFollowupRound((count || 0) + 1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ✅ ฟังก์ชันอัปโหลดรูปภาพ (ใช้สำหรับทั้ง 2 รูป)
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: 'floating_chart_image_url' | 'dream_card_image_url',
    setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setUploading(true);

      // ตรวจสอบขนาดไฟล์
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`❌ ไฟล์มีขนาดใหญ่เกิน 5MB (ขนาด: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        return;
      }

      // ตรวจสอบประเภทไฟล์
      if (!file.type.startsWith('image/')) {
        alert('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)');
        return;
      }

      // สร้างชื่อไฟล์
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const fileName = `${patientIdFromQuery || appointment?.user_id}_${followupRound}_${fieldName}_${timestamp}_${randomStr}.${fileExt}`;

      // อัปโหลดไฟล์
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('followup-images') // ✅ ต้องสร้าง bucket นี้ใน Supabase Storage
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      // สร้าง Signed URL
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('followup-images')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 ปี

      if (signedUrlError) throw signedUrlError;
      if (!signedUrlData?.signedUrl) throw new Error('ไม่สามารถสร้าง Signed URL ได้');

      // บันทึก URL ลง formData
      setFormData({
        ...formData,
        [fieldName]: signedUrlData.signedUrl,
      });

      alert('✅ อัปโหลดรูปภาพสำเร็จ!');
    } catch (err: any) {
      console.error('Error uploading image:', err);
      alert('❌ เกิดข้อผิดพลาดในการอัปโหลด: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // ✅ Auto-generate summary
  useEffect(() => {
    const successes: string[] = [];
    if (formData.food_amount_status === 'completed') successes.push('ปรับปริมาณอาหาร');
    if (formData.food_type_status === 'completed') successes.push('ปรับชนิดอาหาร');
    if (formData.movement_status === 'completed') successes.push('ปรับการเคลื่อนไหว');
    
    if (successes.length > 0) {
      setFormData(prev => ({
        ...prev,
        summary: `ผู้ป่วยสามารถทำสำเร็จใน: ${successes.join(', ')}`,
      }));
    }
  }, [formData.food_amount_status, formData.food_type_status, formData.movement_status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const currentUser = checkSession();
      if (!currentUser || !currentUser.id) {
        throw new Error('กรุณาเข้าสู่ระบบใหม่');
      }

      const userId = patientIdFromQuery || appointment?.user_id;
      
      const followupData = {
        appointment_id: appointmentId && appointmentId !== 'new' ? appointmentId : null,
        user_id: userId,
        followup_date: appointment?.appointment_date || new Date().toISOString(),
        followup_round: followupRound,
        
        // 1. ข้อมูลสุขภาพ
        weight: formData.weight ? parseFloat(formData.weight) : null,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
        blood_pressure_sys: formData.blood_pressure_sys ? parseInt(formData.blood_pressure_sys) : null,
        blood_pressure_dia: formData.blood_pressure_dia ? parseInt(formData.blood_pressure_dia) : null,
        blood_sugar_dtx: formData.blood_sugar_dtx ? parseFloat(formData.blood_sugar_dtx) : null,
        
        // 2. ความก้าวหน้าในการปรับตัว
        life_schedule_image_url: formData.life_schedule_image_url || null,
        adaptation_summary: formData.adaptation_summary || null,
        adaptation_obstacles: formData.adaptation_obstacles || null,
        adaptation_opportunities: formData.adaptation_opportunities || null,
        adaptation_other: formData.adaptation_other || null,
        
        // 3. กราฟวัดลอยจม
        floating_chart_image_url: formData.floating_chart_image_url || null,
        floating_chart_summary: formData.floating_chart_summary || null,
        
        // 4. การ์ดภาพความฝัน
        dream_card_image_url: formData.dream_card_image_url || null,
        dream_card_description: formData.dream_card_description || null,
        
        // 5. ติดตามแผนปฏิบัติกิจกรรม
        food_amount_status: formData.food_amount_status,
        food_type_status: formData.food_type_status,
        movement_status: formData.movement_status,
        food_amount_note: formData.food_amount_note || null,
        food_type_note: formData.food_type_note || null,
        movement_note: formData.movement_note || null,
        
        // 6. คะแนนไม้บรรทัดวัดใจ
        confidence_score: parseInt(formData.confidence_score.toString()),
        confidence_improvement_plan: formData.confidence_improvement_plan || null,
        
        // 7. สรุป
        summary: formData.summary || null,
        recommendations: formData.recommendations || null,
        
        // 8. สถานะการติดตาม
        followup_status: formData.followup_status,
        
        conducted_by: currentUser.id,
      };

      const { data: followup, error: saveError } = await supabase
        .from('appointment_followups')
        .insert(followupData)
        .select()
        .single();

      if (saveError) throw saveError;

      // อัปเดตสถานะนัดหมาย (ถ้ามี)
      if (appointmentId && appointmentId !== 'new') {
        await supabase
          .from('appointments')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', appointmentId);
      }

      alert('✅ บันทึกผลการติดตามสำเร็จ!');
      router.push(`/admin/patients/${userId}/followup-history`);
    } catch (err: any) {
      console.error('Error saving followup:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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
      {/* ✅ Header - ปรับรูปแบบใหม่ให้กระชับ */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          {/* ✅ Grid Layout: ข้อมูลผู้ป่วย | ข้อมูลผู้ใช้งาน */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* ✅ ข้อมูลผู้ป่วย - กระชับ */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xs font-semibold text-blue-900 mb-1">ข้อมูลผู้ป่วย</h2>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600 w-12 flex-shrink-0">ชื่อ:</span>
                      <span className="font-semibold text-gray-800 truncate">
                        {patientProfile?.first_name} {patientProfile?.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600 w-12 flex-shrink-0">HN:</span>
                      <span className="font-mono font-semibold text-gray-800">
                        {patientProfile?.hospital_number}
                      </span>
                    </div>
                    {patientProfile?.hospitals && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600 w-12 flex-shrink-0">รพ.:</span>
                        <span className="text-gray-700 truncate">
                          {patientProfile.hospitals.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ ข้อมูลผู้ใช้งาน - กระชับ */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xs font-semibold text-purple-900 mb-1">ผู้บันทึก</h2>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600 w-12 flex-shrink-0">ชื่อ:</span>
                      <span className="font-semibold text-gray-800 truncate">
                        {user?.full_name_th || 'ผู้ใช้งาน'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600 w-12 flex-shrink-0">ระดับ:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isSuperAdmin(user) ? 'bg-purple-200 text-purple-800' :
                        isHospitalAdmin(user) ? 'bg-blue-200 text-blue-800' :
                        user?.role === 'doctor' ? 'bg-green-200 text-green-800' :
                        user?.role === 'helper' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {isSuperAdmin(user) ? '👑 Super Admin' :
                         isHospitalAdmin(user) ? '🏥 Hospital Admin' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                         user?.role === 'helper' ? '👩‍⚕️ เจ้าหน้าที่' : 'ผู้ดูแล'}
                      </span>
                    </div>
                    {userHospital && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600 w-12 flex-shrink-0">สังกัด:</span>
                        <span className="text-gray-700 truncate">
                          {userHospital.name}
                          {userHospital.type === 'sub' && userHospital.parent_hospital && (
                            <span className="text-gray-500"> ({userHospital.parent_hospital.name})</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-800 mb-2">⚠️ เกิดข้อผิดพลาด</h3>
                <div className="text-red-700 text-sm">{error}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        
        {/* 1. ข้อมูลสุขภาพ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            บันทึกข้อมูลสุขภาพ
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">น้ำหนัก (กก.)</label>
              <input
                type="number"
                name="weight"
                value={formData.weight}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="เช่น 80"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รอบเอว (ซม.)</label>
              <input
                type="number"
                name="waist_circumference"
                value={formData.waist_circumference}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="เช่น 100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ความดันโลหิต (mmHg)</label>
              <div className="flex gap-2">
                <input type="number" name="blood_pressure_sys" value={formData.blood_pressure_sys} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="SYS" />
                <span className="flex items-center">/</span>
                <input type="number" name="blood_pressure_dia" value={formData.blood_pressure_dia} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="DIA" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค่าน้ำตาล (DTX) mg%</label>
              <input
                type="number"
                name="blood_sugar_dtx"
                value={formData.blood_sugar_dtx}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="เช่น 110"
              />
            </div>
          </div>
        </div>

        {/* 2. ความก้าวหน้าในการปรับตัว */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm font-bold">2</span>
            ความก้าวหน้าในการปรับตัว
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ตารางชีวิตของฉัน</label>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-all w-fit">
                <Upload className="w-5 h-5" />
                <span>อัปโหลดรูปภาพ/ใบงาน</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImageUpload(e, 'life_schedule_image_url', () => {});
                    }
                  }}
                  className="hidden"
                />
              </label>
              {formData.life_schedule_image_url && (
                <div className="mt-2">
                  <img src={formData.life_schedule_image_url} alt="Life Schedule" className="w-32 h-32 object-cover rounded border" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">สรุปการปรับตัว</label>
              <select
                name="adaptation_summary"
                value={formData.adaptation_summary}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">-- เลือก --</option>
                <option value="obstacles">พบอุปสรรค/ความกังวล</option>
                <option value="opportunities">โอกาส</option>
                <option value="other">อื่นๆ</option>
              </select>
              {formData.adaptation_summary === 'obstacles' && (
                <textarea name="adaptation_obstacles" value={formData.adaptation_obstacles} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-2" placeholder="อธิบายอุปสรรค/ความกังวล..." />
              )}
              {formData.adaptation_summary === 'opportunities' && (
                <textarea name="adaptation_opportunities" value={formData.adaptation_opportunities} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-2" placeholder="อธิบายโอกาส..." />
              )}
              {formData.adaptation_summary === 'other' && (
                <textarea name="adaptation_other" value={formData.adaptation_other} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-2" placeholder="อธิบายอื่นๆ..." />
              )}
            </div>
          </div>
        </div>

        {/* 3. กราฟวัดลอยจม (ใหม่) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">3</span>
            กราฟวัดลอยจม
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">รูปภาพกราฟวัดลอยจม</label>
              <label className={`flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg cursor-pointer hover:bg-purple-600 transition-all w-fit ${uploadingFloating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-5 h-5" />
                <span>{uploadingFloating ? '⏳ กำลังอัปโหลด...' : 'อัปโหลดรูปภาพ'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'floating_chart_image_url', setUploadingFloating)}
                  className="hidden"
                  disabled={uploadingFloating}
                />
              </label>
              {formData.floating_chart_image_url && (
                <div className="mt-2">
                  <img src={formData.floating_chart_image_url} alt="Floating Chart" className="w-32 h-32 object-cover rounded border" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">สรุปข้อมูลจากกราฟวัดลอยจม</label>
              <textarea
                name="floating_chart_summary"
                value={formData.floating_chart_summary}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="บันทึกข้อความสรุปจากกราฟ..."
              />
            </div>
          </div>
        </div>

        {/* 4. การ์ดภาพความฝัน (ใหม่) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            การ์ดภาพความฝัน
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">รูปภาพความฝัน</label>
              <label className={`flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg cursor-pointer hover:bg-pink-600 transition-all w-fit ${uploadingDream ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-5 h-5" />
                <span>{uploadingDream ? '⏳ กำลังอัปโหลด...' : 'อัปโหลดรูปภาพ'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'dream_card_image_url', setUploadingDream)}
                  className="hidden"
                  disabled={uploadingDream}
                />
              </label>
              {formData.dream_card_image_url && (
                <div className="mt-2">
                  <img src={formData.dream_card_image_url} alt="Dream Card" className="w-32 h-32 object-cover rounded border" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ความฝัน</label>
              <textarea
                name="dream_card_description"
                value={formData.dream_card_description}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="บันทึกข้อความอธิบายความฝัน..."
              />
            </div>
          </div>
        </div>

        {/* 5. ติดตามแผนปฏิบัติกิจกรรม (ย้ายจาก 3 → 5) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">5</span>
            ติดตามแผนปฏิบัติกิจกรรม
          </h2>
          <div className="space-y-4">
            {['food_amount', 'food_type', 'movement'].map((type) => (
              <div key={type} className="border-b pb-4 last:border-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {type === 'food_amount' ? 'การปรับปริมาณอาหาร' : type === 'food_type' ? 'การปรับชนิดอาหาร' : 'การปรับการเคลื่อนไหว'}
                </label>
                <div className="flex gap-4 mb-2">
                  {['completed', 'not_completed', 'not_in_plan'].map((status) => (
                    <label key={status} className="flex items-center">
                      <input
                        type="radio"
                        name={`${type}_status`}
                        value={status}
                        checked={formData[`${type}_status` as keyof typeof formData] === status}
                        onChange={handleChange}
                        className="mr-2"
                      />
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        status === 'completed' ? 'bg-green-100 text-green-700' :
                        status === 'not_completed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {status === 'completed' ? 'สำเร็จ' : status === 'not_completed' ? 'ไม่สำเร็จ' : 'ยังไม่อยู่ในแผน'}
                      </span>
                    </label>
                  ))}
                </div>
                <textarea
                  name={`${type}_note`}
                  value={formData[`${type}_note` as keyof typeof formData]}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="หมายเหตุเพิ่มเติม..."
                />
              </div>
            ))}
          </div>
        </div>

        {/* 6. คะแนนไม้บรรทัดวัดใจ (เดิม 4 → 6) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-bold">6</span>
            คะแนนไม้บรรทัดวัดใจ
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ความมั่นใจ (0-10): <span className="text-indigo-600 font-bold text-lg">{formData.confidence_score}</span>
            </label>
            <input
              type="range"
              name="confidence_score"
              min="0"
              max="10"
              value={formData.confidence_score}
              onChange={handleChange}
              className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <textarea
              name="confidence_improvement_plan"
              value={formData.confidence_improvement_plan}
              onChange={handleChange}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-4"
              placeholder="แผนปรับปรุงความมั่นใจ..."
            />
          </div>
        </div>

        {/* 7. สรุป (เดิม 5 → 7) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 text-sm font-bold">7</span>
            สรุปข้อมูลการติดตามวันนี้
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สิ่งที่ทำได้สำเร็จ</label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                placeholder="(ระบบจะสรุปอัตโนมัติจากข้อ 5)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">คำแนะนำเพิ่มเติม</label>
              <textarea
                name="recommendations"
                value={formData.recommendations}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="คำแนะนำสำหรับผู้ป่วย..."
              />
            </div>
          </div>
        </div>

        {/* 8. สถานะการติดตาม (เดิม 6 → 8) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-bold">8</span>
            สถานะการติดตาม
          </h2>
          <select
            name="followup_status"
            value={formData.followup_status}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg"
          >
            <option value="excellent">ดีมาก</option>
            <option value="good">ดี</option>
            <option value="fair">พอใช้</option>
            <option value="needs_improvement">ปรับปรุง</option>
            <option value="monitoring">เฝ้าระวัง</option>
          </select>
        </div>

        {/* ประวัติการติดตาม */}
        {pastFollowups.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-gray-600" />
              📋 ประวัติการติดตาม (3 ครั้งล่าสุด)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold">ครั้งที่</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">วันที่</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">น้ำหนัก</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {pastFollowups.map((followup) => (
                    <tr key={followup.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">ครั้งที่ {followup.followup_round}</td>
                      <td className="px-4 py-2 text-sm">{new Date(followup.followup_date).toLocaleDateString('th-TH')}</td>
                      <td className="px-4 py-2 text-sm">{followup.weight || '-'} กก.</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          followup.followup_status === 'excellent' ? 'bg-green-100 text-green-700' :
                          followup.followup_status === 'good' ? 'bg-blue-100 text-blue-700' :
                          followup.followup_status === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                          followup.followup_status === 'needs_improvement' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {followup.followup_status === 'excellent' ? 'ดีมาก' :
                           followup.followup_status === 'good' ? 'ดี' :
                           followup.followup_status === 'fair' ? 'พอใช้' :
                           followup.followup_status === 'needs_improvement' ? 'ปรับปรุง' :
                           'เฝ้าระวัง'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
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
                บันทึกผลการติดตาม
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-500 text-white font-bold py-4 rounded-xl hover:bg-gray-600 transition-all"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  );
}