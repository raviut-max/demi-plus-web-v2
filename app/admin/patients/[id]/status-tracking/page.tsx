// app/admin/patients/[id]/status-tracking/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, Upload, Image as ImageIcon, Trash2, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface StatusImage {
  id: string;
  user_id: string;
  image_path: string;
  caption: string | null;
  created_at: string;
  created_by: string;
}

export default function PatientStatusTrackingPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<StatusImage[]>([]);
  const [caption, setCaption] = useState('');

  // 🔐 ตรวจสอบ Session
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

  // 📥 โหลดข้อมูล
  const loadData = async () => {
    try {
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);
      await loadImages();
    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };


// =====================================================
// 📥 ฟังก์ชันโหลดรูปภาพ - เพิ่ม Debug
// =====================================================
const loadImages = async () => {
  console.log('📥 ========== START LOAD IMAGES ==========');
  console.log('🔍 Patient ID:', patientId);
  
  try {
    console.log('📡 Querying database...');
    const { data, error } = await supabase
      .from('patient_status_images')
      .select('*')
      .eq('user_id', patientId)
      .order('created_at', { ascending: false });

    console.log('📊 Query result:', {
      dataCount: data?.length || 0,
      error: error,
      hasData: !!data,
    });

    if (error) {
      console.error('❌ Error loading images:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      throw error;
    }

    console.log('✅ Images loaded successfully:', data?.length || 0, 'images');
    if (data && data.length > 0) {
      console.log('📋 First image:', data[0]);
    }
    
    setImages(data || []);
    console.log('📦 Images state updated');
    console.log('🎉 ========== LOAD IMAGES COMPLETE ==========');
    
  } catch (error: any) {
    console.error('💥 ========== LOAD IMAGES FAILED ==========');
    console.error('❌ Error in loadImages:', error);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
  }
};

// =====================================================
// 📤 ฟังก์ชันอัปโหลดรูปภาพ - เพิ่ม Debug ละเอียด
// =====================================================
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  
  console.log('📤 ========== START IMAGE UPLOAD ==========');
  
  if (!file) {
    alert('กรุณาเลือกไฟล์รูปภาพ');
    return;
  }

  try {
    setUploading(true);

    // ✅ ตรวจสอบขนาดไฟล์
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`❌ ไฟล์มีขนาดใหญ่เกิน 5MB`);
      return;
    }

    // ✅ ตรวจสอบประเภทไฟล์
    if (!file.type.startsWith('image/')) {
      alert('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    // ✅ สร้างชื่อไฟล์
    const fileExt = file.name.split('.').pop();
    const timestamp = Date.now();
    const fileName = `${patientId}-${timestamp}.${fileExt}`;
    
    console.log('📝 Filename:', fileName);

    // ⬆️ อัปโหลดไฟล์
    const { error: uploadError } = await supabase.storage
      .from('patient-status-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    console.log('✅ Upload successful!');

    // 🔗 สร้าง Public URL (✅ แก้ไขแล้ว)
    console.log('🔗 Generating public URL...');
    const { publicUrl } = supabase.storage
      .from('patient-status-images')
      .getPublicUrl(fileName);

    console.log('📊 Public URL:', publicUrl);

    if (!publicUrl) {
      throw new Error('ไม่สามารถสร้าง Public URL ได้');
    }

    // 💾 บันทึกข้อมูลลงฐานข้อมูล
    const { error: dbError } = await supabase
      .from('patient_status_images')
      .insert({
        user_id: patientId,
        image_url: publicUrl,  // ✅ ใช้ publicUrl โดยตรง
        image_path: fileName,
        caption: caption || null,
        created_by: user.id,
      });

    if (dbError) throw dbError;

    alert('✅ อัปโหลดรูปภาพสำเร็จ!');
    setCaption('');
    await loadImages();
    
  } catch (err: any) {
    console.error('❌ Error:', err);
    alert(`❌ เกิดข้อผิดพลาด: ${err.message}`);
  } finally {
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
};


  // 🗑️ ลบรูปภาพ
  const handleDeleteImage = async (image: StatusImage) => {
    if (!confirm('คุณต้องการลบรูปภาพนี้หรือไม่?')) return;

    try {
      // ลบไฟล์จาก Storage
      await supabase.storage
        .from('patient-status-images')
        .remove([image.image_path]);

      // ลบข้อมูลจาก Database
      const { error } = await supabase
        .from('patient_status_images')
        .delete()
        .eq('id', image.id);

      if (error) throw error;

      alert('✅ ลบริูปภาพสำเร็จ!');
      await loadImages();
      
    } catch (error: any) {
      console.error('❌ Error:', error);
      alert(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    }
  };

  // 🔗 สร้าง URL สำหรับแสดงรูปภาพ
  const getImageUrl = (imagePath: string) => {
    const { data } = supabase.storage
      .from('patient-status-images')
      .getPublicUrl(imagePath);
    
    return data?.publicUrl || '';
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
              📸 การติดตามสถานะ
            </h1>
            <p className="text-gray-600">
              ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
              HN: {patient?.hospital_number}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            อัปโหลดรูปภาพ
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                คำบรรยาย (ถ้ามี)
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น รูปวันที่ติดตามครั้งที่ 1"
              />
            </div>

            <div className="flex items-center gap-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-5 h-5" />
                {uploading ? '⏳ กำลังอัปโหลด...' : '📷 เลือกรูปภาพ'}
              </button>
            </div>

            <p className="text-sm text-gray-500">
              📎 รองรับไฟล์รูปภาพ JPG, PNG, WEBP (ขนาดไม่เกิน 5MB)
            </p>
          </div>
        </div>

        {/* Images Gallery */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-blue-600" />
            รูปภาพที่บันทึก ({images.length})
          </h2>

          {images.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">ยังไม่มีรูปภาพ</p>
              <p className="text-sm text-gray-400 mt-1">อัปโหลดรูปภาพแรกของคุณด้านบน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((image) => (
                <div key={image.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Image */}
                  <div className="relative aspect-video bg-gray-100">
                    <img
                      src={getImageUrl(image.image_path)}
                      alt={image.caption || 'Status image'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/400x300?text=Image+Not+Found';
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    {image.caption && (
                      <p className="text-sm text-gray-700 mb-2">
                        📝 {image.caption}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {new Date(image.created_at).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteImage(image)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}