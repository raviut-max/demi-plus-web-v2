// app/admin/appointments/followup/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientFollowupHistory, saveAppointmentFollowupComplete } from '@/lib/supabase/queries';
import { ArrowLeft, Save, Upload, AlertCircle, FileText, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function FollowupPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    
    // 3. ติดตามแผนปฏิบัติกิจกรรม
    food_amount_status: 'not_in_plan',
    food_type_status: 'not_in_plan',
    movement_status: 'not_in_plan',
    food_amount_note: '',
    food_type_note: '',
    movement_note: '',
    
    // 4. คะแนนไม้บรรทัดวัดใจ
    confidence_score: 5,
    confidence_improvement_plan: '',
    
    // 5. สรุป
    summary: '',
    recommendations: '',
    
    // 6. สถานะการติดตาม
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
    loadAppointmentData();
    // ❌ ไม่ต้องเรียก loadFollowupRound() ที่นี่ เพราะ appointment ยังเป็น null
    // loadFollowupRound(); 
  }, [router]);

  // ✅ useEffect สำหรับนับรอบ followup - เรียกเมื่อ appointment โหลดเสร็จ
  useEffect(() => {
    if (appointment?.user_id) {
      loadFollowupRound();
    }
  }, [appointment]); // ✅ เรียกเมื่อ appointment เปลี่ยน

  const loadAppointmentData = async () => {
    try {
      console.log('🔍 Loading appointment:', appointmentId);
      setError(null);
      
      // ✅ ขั้นตอนที่ 1: ดึงข้อมูลนัดหมาย
      const { data: aptData, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (aptError) {
        console.error('Error loading appointment:', aptError);
        throw aptError;
      }

      setAppointment(aptData);

      // ✅ ขั้นตอนที่ 2: ดึงข้อมูลผู้ป่วยจาก profiles
      if (aptData.user_id) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, hospital_number')
          .eq('id', aptData.user_id)
          .single();

        if (profileError) {
          console.error('Error loading profile:', profileError);
        } else {
          setPatientProfile(profileData);
        }

        // โหลดประวัติการติดตาม (3 ครั้งล่าสุด)
        const history = await getPatientFollowupHistory(aptData.user_id, 3);
        setPastFollowups(history);
      }

      console.log('✅ Appointment loaded:', aptData);
    } catch (err: any) {
      console.error('💥 Exception in loadAppointmentData:', err);
      
      if (err.code === 'PGRST200') {
        setError(
          '⚠️ เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล\n\n' +
          'รายละเอียด: ไม่สามารถค้นหาข้อมูลผู้ป่วยได้\n' +
          'รหัสข้อผิดพลาด: ' + err.code + '\n\n' +
          'กรุณาตรวจสอบ:\n' +
          '1. การเชื่อมต่ออินเทอร์เน็ต\n' +
          '2. Foreign key relationship ในฐานข้อมูล\n' +
          '3. ติดต่อผู้ดูแลระบบหากปัญหายังคงอยู่'
        );
      } else {
        setError(
          '❌ เกิดข้อผิดพลาดในการโหลดข้อมูลนัดหมาย\n\n' +
          'รายละเอียด: ' + err.message + '\n' +
          'รหัสข้อผิดพลาด: ' + (err.code || 'ไม่ทราบ')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFollowupRound = async () => {
    if (appointment?.user_id) {
      try {
        console.log('🔢 Counting followups for user:', appointment.user_id);
        
        const { count, error } = await supabase
          .from('appointment_followups')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', appointment.user_id);

        if (error) {
          console.error('Error counting followups:', error);
          setFollowupRound(1);
          return;
        }

        const nextRound = (count || 0) + 1;
        console.log('✅ Found', count, 'existing followups. Next round:', nextRound);
        setFollowupRound(nextRound);
      } catch (err) {
        console.error('Error in loadFollowupRound:', err);
        setFollowupRound(1);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${appointmentId}_${followupRound}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('life-schedule-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('life-schedule-images')
        .getPublicUrl(fileName);

      setFormData({
        ...formData,
        life_schedule_image_url: urlData.publicUrl,
      });

      alert('✅ อัปโหลดรูปภาพสำเร็จ!');
    } catch (err) {
      console.error('Error uploading image:', err);
      alert('❌ เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    }
  };

  // ✅ Auto-generate summary จากข้อมูลที่ทำสำเร็จ
  useEffect(() => {
    const successes: string[] = [];
    
    if (formData.food_amount_status === 'completed') {
      successes.push('ปรับปริมาณอาหาร');
    }
    if (formData.food_type_status === 'completed') {
      successes.push('ปรับชนิดอาหาร');
    }
    if (formData.movement_status === 'completed') {
      successes.push('ปรับการเคลื่อนไหว');
    }
    
    if (successes.length > 0) {
      setFormData(prev => ({
        ...prev,
        summary: `ผู้ป่วยสามารถทำสำเร็จใน: ${successes.join(', ')}`,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        summary: '',
      }));
    }
  }, [formData.food_amount_status, formData.food_type_status, formData.movement_status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // ✅ ขั้นตอนที่ 1: ตรวจสอบ session ปัจจุบัน
      const currentUser = checkSession();
      if (!currentUser || !currentUser.id) {
        throw new Error('กรุณาเข้าสู่ระบบใหม่');
      }

      console.log('👤 Current user:', currentUser);
      console.log('🔑 User role:', currentUser.role);

      // ✅ ขั้นตอนที่ 2: ตรวจสอบสิทธิ์จาก database จริง
      const { data: userRoleData, error: roleError } = await supabase
        .from('users')
        .select('role, is_active')
        .eq('id', currentUser.id)
        .single();

      if (roleError || !userRoleData) {
        console.error('Error fetching user role:', roleError);
        throw new Error('ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้');
      }

      if (!userRoleData.is_active) {
        throw new Error('บัญชีผู้ใช้ถูกระงับการใช้งาน');
      }

      const allowedRoles = ['admin', 'doctor', 'helper'];
      if (!allowedRoles.includes(userRoleData.role)) {
        throw new Error(`ไม่มีสิทธิ์บันทึกข้อมูล (บทบาทปัจจุบัน: ${userRoleData.role})`);
      }

      console.log('✅ Role verified:', userRoleData.role);

      // ✅ ขั้นตอนที่ 3: เตรียมข้อมูลสำหรับบันทึก
      const followupData = {
        appointment_id: appointmentId,
        user_id: appointment.user_id,
        followup_date: appointment.appointment_date,
        followup_round: followupRound,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
        blood_pressure_sys: formData.blood_pressure_sys ? parseInt(formData.blood_pressure_sys) : null,
        blood_pressure_dia: formData.blood_pressure_dia ? parseInt(formData.blood_pressure_dia) : null,
        blood_sugar_dtx: formData.blood_sugar_dtx ? parseFloat(formData.blood_sugar_dtx) : null,
        life_schedule_image_url: formData.life_schedule_image_url || null,
        adaptation_summary: formData.adaptation_summary || null,
        adaptation_obstacles: formData.adaptation_obstacles || null,
        adaptation_opportunities: formData.adaptation_opportunities || null,
        adaptation_other: formData.adaptation_other || null,
        food_amount_status: formData.food_amount_status as any || null,
        food_type_status: formData.food_type_status as any || null,
        movement_status: formData.movement_status as any || null,
        food_amount_note: formData.food_amount_note || null,
        food_type_note: formData.food_type_note || null,
        movement_note: formData.movement_note || null,
        confidence_score: parseInt(formData.confidence_score.toString()),
        confidence_improvement_plan: formData.confidence_improvement_plan || null,
        summary: formData.summary || null,
        recommendations: formData.recommendations || null,
        followup_status: formData.followup_status as any || null,
        conducted_by: currentUser.id,
      };

      console.log('💾 Saving followup with data:', followupData);

      // ✅ ขั้นตอนที่ 4: บันทึกข้อมูล
      const { success, error: saveError, followup } = await saveAppointmentFollowupComplete(followupData);

      if (!success) {
        throw new Error(saveError || 'ไม่สามารถบันทึกข้อมูลได้');
      }

      console.log('✅ Followup saved successfully:', followup);

      // ✅ ขั้นตอนที่ 5: อัปเดตสถานะนัดหมายเป็น completed
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'completed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.warn('⚠️ Failed to update appointment status:', updateError);
      }

      alert('✅ บันทึกผลการติดตามสำเร็จ!');
      router.push(`/admin/patients/${appointment.user_id}/followup-history`);
    } catch (err: any) {
      console.error('💥 Error saving followup:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            บันทึกผลการติดตามนัดหมาย
          </h1>
          <p className="text-gray-600">
            ผู้ป่วย: {patientProfile?.first_name} {patientProfile?.last_name} | 
            HN: {patientProfile?.hospital_number} | 
            ครั้งที่: {followupRound}
          </p>
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
                <div className="text-red-700 whitespace-pre-line text-sm leading-relaxed">
                  {error}
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    loadAppointmentData();
                  }}
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm"
                >
                  🔄 ลองใหม่อีกครั้ง
                </button>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                น้ำหนัก (กก.)
              </label>
              <input
                type="number"
                name="weight"
                value={formData.weight}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น 80"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รอบเอว (ซม.)
              </label>
              <input
                type="number"
                name="waist_circumference"
                value={formData.waist_circumference}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น 100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ความดันโลหิต (mmHg)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="blood_pressure_sys"
                  value={formData.blood_pressure_sys}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="SYS"
                />
                <span className="flex items-center">/</span>
                <input
                  type="number"
                  name="blood_pressure_dia"
                  value={formData.blood_pressure_dia}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="DIA"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ค่าน้ำตาล (DTX) mg%
              </label>
              <input
                type="number"
                name="blood_sugar_dtx"
                value={formData.blood_sugar_dtx}
                onChange={handleChange}
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ตารางชีวิตของฉัน
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-all">
                  <Upload className="w-5 h-5" />
                  <span>อัปโหลดรูปภาพ/ใบงาน</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {formData.life_schedule_image_url && (
                  <a
                    href={formData.life_schedule_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FileText className="w-4 h-4" />
                    ดูรูปภาพ
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สรุปการปรับตัว
              </label>
              <select
                name="adaptation_summary"
                value={formData.adaptation_summary}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 mb-2"
              >
                <option value="">-- เลือก --</option>
                <option value="obstacles">พบอุปสรรค/ความกังวล</option>
                <option value="opportunities">โอกาส</option>
                <option value="other">อื่นๆ</option>
              </select>
              
              {formData.adaptation_summary === 'obstacles' && (
                <textarea
                  name="adaptation_obstacles"
                  value={formData.adaptation_obstacles}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="อธิบายอุปสรรค/ความกังวล..."
                />
              )}
              
              {formData.adaptation_summary === 'opportunities' && (
                <textarea
                  name="adaptation_opportunities"
                  value={formData.adaptation_opportunities}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="อธิบายโอกาส..."
                />
              )}
              
              {formData.adaptation_summary === 'other' && (
                <textarea
                  name="adaptation_other"
                  value={formData.adaptation_other}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="อธิบายอื่นๆ..."
                />
              )}
            </div>
          </div>
        </div>

        {/* 3. ติดตามแผนปฏิบัติกิจกรรม */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">3</span>
            ติดตามแผนปฏิบัติกิจกรรม
          </h2>
          <div className="space-y-4">
            <div className="border-b pb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                การปรับปริมาณอาหาร
              </label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_amount_status"
                    value="completed"
                    checked={formData.food_amount_status === 'completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_amount_status"
                    value="not_completed"
                    checked={formData.food_amount_status === 'not_completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">ไม่สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_amount_status"
                    value="not_in_plan"
                    checked={formData.food_amount_status === 'not_in_plan'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">ยังไม่อยู่ในแผน</span>
                </label>
              </div>
              <textarea
                name="food_amount_note"
                value={formData.food_amount_note}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="หมายเหตุเพิ่มเติม..."
              />
            </div>

            <div className="border-b pb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                การปรับชนิดอาหาร
              </label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_type_status"
                    value="completed"
                    checked={formData.food_type_status === 'completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_type_status"
                    value="not_completed"
                    checked={formData.food_type_status === 'not_completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">ไม่สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="food_type_status"
                    value="not_in_plan"
                    checked={formData.food_type_status === 'not_in_plan'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">ยังไม่อยู่ในแผน</span>
                </label>
              </div>
              <textarea
                name="food_type_note"
                value={formData.food_type_note}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="หมายเหตุเพิ่มเติม..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                การปรับการเคลื่อนไหว
              </label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="movement_status"
                    value="completed"
                    checked={formData.movement_status === 'completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="movement_status"
                    value="not_completed"
                    checked={formData.movement_status === 'not_completed'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">ไม่สำเร็จ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="movement_status"
                    value="not_in_plan"
                    checked={formData.movement_status === 'not_in_plan'}
                    onChange={handleChange}
                    className="mr-2"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">ยังไม่อยู่ในแผน</span>
                </label>
              </div>
              <textarea
                name="movement_note"
                value={formData.movement_note}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="หมายเหตุเพิ่มเติม..."
              />
            </div>
          </div>
        </div>

        {/* 4. คะแนนไม้บรรทัดวัดใจ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">4</span>
            คะแนนไม้บรรทัดวัดใจ
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ความมั่นใจ (0-10): <span className="text-pink-600 font-bold text-lg">{formData.confidence_score}</span>
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
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0 - ไม่มั่นใจเลย</span>
              <span>5 - ปานกลาง</span>
              <span>10 - มั่นใจมาก</span>
            </div>
            <textarea
              name="confidence_improvement_plan"
              value={formData.confidence_improvement_plan}
              onChange={handleChange}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 mt-4"
              placeholder="แผนปรับปรุงความมั่นใจ..."
            />
          </div>
        </div>

        {/* 5. สรุปข้อมูลการติดตามวันนี้ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">5</span>
            สรุปข้อมูลการติดตามวันนี้
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                สิ่งที่ทำได้สำเร็จ
              </label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-orange-500"
                placeholder="(ระบบจะสรุปอัตโนมัติจากข้อ 3)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                คำแนะนำเพิ่มเติม
              </label>
              <textarea
                name="recommendations"
                value={formData.recommendations}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                placeholder="คำแนะนำสำหรับผู้ป่วย..."
              />
            </div>
          </div>
        </div>

        {/* 6. สถานะการติดตาม */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-bold">6</span>
            สถานะการติดตาม
          </h2>
          <select
            name="followup_status"
            value={formData.followup_status}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="excellent">ดีมาก</option>
            <option value="good">ดี</option>
            <option value="fair">พอใช้</option>
            <option value="needs_improvement">ปรับปรุง</option>
            <option value="monitoring">เฝ้าระวัง</option>
          </select>
        </div>

        {/* ประวัติการนัดหมายครั้งก่อนๆ */}
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
                    <th className="px-4 py-2 text-left text-sm font-semibold">ความมั่นใจ</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {pastFollowups.map((followup) => (
                    <tr key={followup.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">ครั้งที่ {followup.followup_round}</td>
                      <td className="px-4 py-2 text-sm">
                        {new Date(followup.followup_date).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-4 py-2 text-sm">{followup.weight || '-'} กก.</td>
                      <td className="px-4 py-2 text-sm">{followup.confidence_score || '-'}/10</td>
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