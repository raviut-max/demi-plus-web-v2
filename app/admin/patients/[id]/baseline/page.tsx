// app/admin/patients/[id]/baseline/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, getPatientDetail, getPatientFollowupHistory } from '@/lib/supabase/queries';
import { ArrowLeft, Save, Upload, AlertCircle, FileText, Calendar, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function BaselinePage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const [patient, setPatient] = useState(null);
  const [pastFollowups, setPastFollowups] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);

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

    // 6. สถานะการติดตาม (✅ แก้ไข: ใช้ 'fair' แทน 'baseline')
    followup_status: 'fair',
  });

  // ✅ useEffect สำหรับตรวจสอบ session และโหลดข้อมูลเริ่มต้น
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
    loadPatientData();
  }, [router]);

  const loadPatientData = async () => {
    try {
      console.log('🔍 Loading patient:', patientId);
      setError(null);

      // ✅ ขั้นตอนที่ 1: ดึงข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      // ✅ ขั้นตอนที่ 2: โหลดประวัติการติดตาม (ถ้ามี) เพื่อเปรียบเทียบ
      const history = await getPatientFollowupHistory(patientId, 3);
      setPastFollowups(history);

      // ✅ ขั้นตอนที่ 3: โหลดรูปภาพที่เคยอัปโหลดไว้แล้ว
      await loadUploadedImages();

      console.log('✅ Patient loaded:', patientData);
    } catch (err: any) {
      console.error('💥 Exception in loadPatientData:', err);
      setError(
        '❌ เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย\n\n' +
        'รายละเอียด: ' + err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันโหลดรูปภาพที่เคยอัปโหลดไว้แล้ว
  const loadUploadedImages = async () => {
    try {
      console.log('🖼️ Loading uploaded images for patient:', patientId);
      
      const { data, error } = await supabase
        .from('patient_status_images')
        .select('*')
        .eq('user_id', patientId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error loading images:', error);
        return;
      }

      console.log('✅ Loaded images:', data?.length || 0);
      setUploadedImages(data || []);
    } catch (err) {
      console.error('Error in loadUploadedImages:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ✅ ฟังก์ชันอัปโหลดรูปภาพ (เหมือนหน้า Followup)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    console.log('📤 ========== START IMAGE UPLOAD ==========');
    console.log('📁 File selected:', {
      name: file?.name,
      size: file?.size,
      type: file?.type,
    });

    if (!file) {
      console.error('❌ No file selected');
      alert('กรุณาเลือกไฟล์รูปภาพ');
      return;
    }

    try {
      setUploading(true);
      console.log('⚙️ Uploading state set to true');

      // ✅ ใหม่: ลบภาพเก่า (ถ้ามี) ก่อนอัปโหลดภาพใหม่
      if (uploadedImagePath) {
        console.log('🗑️ Deleting old image from storage:', uploadedImagePath);
        await supabase.storage
          .from('patient-status-images')
          .remove([uploadedImagePath]);
        console.log('✅ Old image deleted');
      }

      // ✅ ขั้นตอนที่ 1: ตรวจสอบขนาดไฟล์ (ไม่เกิน 5MB)
      console.log('📏 Step 1: Checking file size...');
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        console.error('❌ File too large:', file.size, 'bytes');
        alert(`❌ ไฟล์มีขนาดใหญ่เกิน 5MB (ขนาด: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        return;
      }
      console.log('✅ File size OK:', (file.size / 1024).toFixed(2), 'KB');

      // ✅ ขั้นตอนที่ 2: ตรวจสอบประเภทไฟล์
      console.log('🖼️ Step 2: Checking file type...');
      if (!file.type.startsWith('image/')) {
        console.error('❌ Invalid file type:', file.type);
        alert('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)');
        return;
      }
      console.log('✅ File type OK:', file.type);

      // ✅ ขั้นตอนที่ 3: สร้างชื่อไฟล์
      console.log('📝 Step 3: Generating filename...');
      const fileExt = file.name.split('.').pop();
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const fileName = `${patientId}_baseline_${timestamp}_${randomStr}.${fileExt}`;
      
      console.log('📝 Generated filename:', fileName);
      console.log('🪣 Bucket name:', 'patient-status-images');

      // ✅ ขั้นตอนที่ 4: อัปโหลดไฟล์
      console.log('⬆️ Step 4: Starting upload to Supabase Storage...');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('patient-status-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        throw uploadError;
      }

      console.log('✅ Upload successful!');

      // ✅ ขั้นตอนที่ 5: สร้าง Signed URL
      console.log('🔗 Step 5: Generating signed URL...');
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('patient-status-images')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 ปี

      if (signedUrlError) {
        console.error('❌ Signed URL error:', signedUrlError);
        throw signedUrlError;
      }

      console.log('📊 Signed URL response:', signedUrlData);
      console.log('🔗 Signed URL:', signedUrlData?.signedUrl);

      if (!signedUrlData?.signedUrl) {
        throw new Error('ไม่สามารถสร้าง Signed URL ได้');
      }

      // ✅ ขั้นตอนที่ 6: บันทึก URL ลง formData และเก็บชื่อไฟล์
      console.log('💾 Step 6: Saving URL to formData...');
      setFormData({
        ...formData,
        life_schedule_image_url: signedUrlData.signedUrl,
      });

      // ✅ ใหม่: เก็บชื่อไฟล์ไว้เพื่อลบในอนาคต
      setUploadedImagePath(fileName);

      console.log('✅ FormData updated');
      console.log('🎉 ========== UPLOAD COMPLETE ==========');

      alert('✅ อัปโหลดรูปภาพสำเร็จ!');
      
      // ✅ โหลดรูปภาพใหม่เพื่อแสดง thumbnail
      await loadUploadedImages();
      
    } catch (err: any) {
      console.error('💥 ========== UPLOAD FAILED ==========');
      console.error('❌ Error uploading image:', err);
      console.error('❌ Error details:', {
        message: err.message,
        statusCode: err.statusCode,
        name: err.name,
      });
      
      let errorMessage = 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ';
      
      if (err.message?.includes('Bucket')) {
        errorMessage = '❌ ไม่พบ Storage Bucket';
      } else if (err.message?.includes('policy')) {
        errorMessage = '❌ ไม่มีสิทธิ์อัปโหลดไฟล์';
      } else if (err.message) {
        errorMessage = `❌ ${err.message}`;
      }
      
      alert(errorMessage);
    } finally {
      console.log('⚙️ Finally block: Resetting uploading state');
      setUploading(false);
    }
  };

  // ✅ ฟังก์ชันลบรูปภาพ
  const handleDeleteImage = async (imageId: string, imagePath: string) => {
    if (!confirm('คุณต้องการลบรูปภาพนี้หรือไม่?')) return;

    try {
      // ลบไฟล์จาก Storage
      await supabase.storage
        .from('patient-status-images')
        .remove([imagePath]);

      // ลบข้อมูลจาก Database
      const { error } = await supabase
        .from('patient_status_images')
        .delete()
        .eq('id', imageId);

      if (error) throw error;

      alert('✅ ลบริูปภาพสำเร็จ!');
      
      // โหลดรูปภาพใหม่
      await loadUploadedImages();
    } catch (err: any) {
      console.error('❌ Error deleting image:', err);
      alert(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // ✅ Auto-generate summary จากข้อมูลที่ทำสำเร็จ (เหมือนหน้า Followup)
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

    console.log('💾 ========== START SAVE BASELINE ==========');
    console.log('📝 FormData:', formData);

    try {
      // ✅ ขั้นตอนที่ 1: ตรวจสอบ session
      const currentUser = checkSession();
      console.log('👤 Current user:', currentUser);
      
      if (!currentUser || !currentUser.id) {
        throw new Error('กรุณาเข้าสู่ระบบใหม่');
      }

      // ✅ ขั้นตอนที่ 2: ตรวจสอบสิทธิ์
      const { data: userRoleData, error: roleError } = await supabase
        .from('users')
        .select('role, is_active')
        .eq('id', currentUser.id)
        .single();

      if (roleError || !userRoleData || !userRoleData.is_active) {
        throw new Error('ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้ได้');
      }

      const allowedRoles = ['admin', 'doctor', 'helper', 'osm'];
      if (!allowedRoles.includes(userRoleData.role)) {
        throw new Error(`ไม่มีสิทธิ์บันทึกข้อมูล (บทบาทปัจจุบัน: ${userRoleData.role})`);
      }

      console.log('✅ Role verified:', userRoleData.role);

      // ✅ ขั้นตอนที่ 3: เตรียมข้อมูลสำหรับบันทึก
      const baselineData = {
        appointment_id: null,  // ⭐ ไม่มีนัดหมาย (baseline)
        user_id: patientId,
        followup_date: new Date().toISOString(),  // ⭐ วันที่ปัจจุบัน
        followup_round: 0,  // ⭐ ครั้งที่ 0 (baseline)
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
        followup_status: formData.followup_status as any || null,  // ✅ ใช้ 'fair' (ไม่ใช่ 'baseline')
        conducted_by: currentUser.id,
      };

      console.log('💾 Baseline data to save:', baselineData);

      // ✅ ขั้นตอนที่ 4: บันทึกข้อมูล
      const { error: saveError } = await supabase
        .from('appointment_followups')
        .insert(baselineData);

      if (saveError) {
        console.error('❌ Save failed:', saveError);
        throw new Error(saveError.message || 'ไม่สามารถบันทึกข้อมูลได้');
      }

      console.log('✅ Baseline saved successfully!');
      console.log('🎉 ========== SAVE COMPLETE ==========');
      
      alert('✅ บันทึกข้อมูลเริ่มต้นสำเร็จ!');
      router.push(`/admin/patients/${patientId}`);
      
    } catch (err: any) {
      console.error('💥 ========== SAVE FAILED ==========');
      console.error('❌ Error saving baseline:', err);
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
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              📋 บันทึกข้อมูลเริ่มต้น (ครั้งที่ 0)
            </h1>
            <p className="text-gray-600">
              ผู้ป่วย: {patient?.first_name} {patient?.last_name} |
              HN: {patient?.hospital_number}
            </p>
            <p className="text-sm text-purple-600 font-medium mt-1">
              ℹ️ ข้อมูลนี้จะใช้เป็นฐานสำหรับเปรียบเทียบในการติดตามครั้งถัดไป
            </p>
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
                <div className="text-red-700 whitespace-pre-line text-sm leading-relaxed">
                  {error}
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    loadPatientData();
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
              <div className="flex items-center gap-4 flex-wrap">
                <label className={`flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-all ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}>
                  <Upload className="w-5 h-5" />
                  <span>{uploading ? '⏳ กำลังอัปโหลด...' : 'อัปโหลดรูปภาพ/ใบงาน'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
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

            {/* ✅ แสดงรูปภาพที่เคยอัปโหลดไว้แล้ว (เหมือนหน้า Followup) */}
            {uploadedImages.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-medium text-blue-900 mb-3">
                  📸 รูปภาพที่เคยบันทึกไว้ ({uploadedImages.length} รูป)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {uploadedImages.map((image) => (
                    <div key={image.id} className="relative group border border-blue-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white">
                      <img
                        src={image.image_url}
                        alt={image.caption || 'Status image'}
                        className="w-full h-24 object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'https://via.placeholder.com/150x96?text=No+Image';
                        }}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                        <a
                          href={image.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-all mr-1"
                          title="ดูรูปภาพเต็มขนาด"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(image.id, image.image_path)}
                          className="opacity-0 group-hover:opacity-100 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all"
                          title="ลบรูปภาพ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-2 bg-gray-50">
                        <p className="text-xs text-gray-600 truncate">
                          {new Date(image.created_at).toLocaleDateString('th-TH', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                          })}
                        </p>
                        {image.caption && (
                          <p className="text-xs text-gray-500 truncate mt-1">
                            {image.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        {/* ประวัติการติดตามครั้งก่อนๆ (ถ้ามี) */}
        {pastFollowups.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-gray-600" />
              📋 ประวัติการติดตาม (สำหรับเปรียบเทียบ)
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
                      <td className="px-4 py-2 text-sm">
                        {followup.followup_round === 0 ? '📋 เริ่มต้น' : `ครั้งที่ ${followup.followup_round}`}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {new Date(followup.followup_date).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-4 py-2 text-sm">{followup.weight || '-'} กก.</td>
                      <td className="px-4 py-2 text-sm">{followup.confidence_score || '-'}/10</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          followup.followup_status === 'baseline' ? 'bg-purple-100 text-purple-700' :
                          followup.followup_status === 'excellent' ? 'bg-green-100 text-green-700' :
                          followup.followup_status === 'good' ? 'bg-blue-100 text-blue-700' :
                          followup.followup_status === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                          followup.followup_status === 'needs_improvement' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {followup.followup_status === 'baseline' ? '📋 ข้อมูลเริ่มต้น' :
                           followup.followup_status === 'excellent' ? 'ดีมาก' :
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
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                บันทึกข้อมูลเริ่มต้น (ครั้งที่ 0)
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