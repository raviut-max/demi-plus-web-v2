// app/admin/patients/[id]/status-tracking/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, Upload, Image as ImageIcon, Trash2, Calendar, User } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface StatusImage {
  id: string;
  user_id: string;
  image_url: string;
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

  const loadData = async () => {
    try {
      console.log('🔍 Loading patient detail:', patientId);
      
      // โหลดข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);
      console.log('✅ Patient loaded:', patientData);

      // โหลดรูปภาพทั้งหมด
      await loadImages();
    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async () => {
    try {
      console.log('📥 Loading images for patient:', patientId);
      
      const { data, error } = await supabase
        .from('patient_status_images')
        .select('*')
        .eq('user_id', patientId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading images:', error);
        throw error;
      }

      console.log('✅ Images loaded:', data?.length || 0);
      setImages(data || []);
    } catch (error) {
      console.error('❌ Error in loadImages:', error);
    }
  };

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

    // ✅ ตรวจสอบขนาดไฟล์ (ไม่เกิน 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      console.error('❌ File too large:', file.size, 'bytes');
      alert(`❌ ไฟล์มีขนาดใหญ่เกิน 5MB (ขนาด: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }
    console.log('✅ File size OK:', (file.size / 1024).toFixed(2), 'KB');

    // ✅ ตรวจสอบประเภทไฟล์
    if (!file.type.startsWith('image/')) {
      console.error('❌ Invalid file type:', file.type);
      alert('❌ กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)');
      return;
    }
    console.log('✅ File type OK:', file.type);

    // ✅ สร้างชื่อไฟล์ที่เป็นเอกลักษณ์
    const fileExt = file.name.split('.').pop();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileName = `${patientId}_${timestamp}_${randomStr}.${fileExt}`;
    
    console.log('📝 Generated filename:', fileName);
    console.log('🪣 Bucket name:', 'patient-status-images');

    // ✅ อัปโหลดไฟล์ไปยัง Supabase Storage
    console.log('⬆️ Starting upload...');
    const { error: uploadError } = await supabase.storage
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

    // ✅ สร้าง Signed URL (แทนที่จะใช้ Public URL)
    console.log('🔗 Generating signed URL...');
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('patient-status-images')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 ปี

    if (signedUrlError) {
      console.error('❌ Signed URL error:', signedUrlError);
      throw signedUrlError;
    }

    console.log('📊 Signed URL response:', signedUrlData);

    if (!signedUrlData?.signedUrl) {
      throw new Error('Signed URL is undefined');
    }

    // ✅ บันทึกข้อมูลลงฐานข้อมูล
    console.log('💾 Saving to database...');
    const { error: dbError } = await supabase
      .from('patient_status_images')
      .insert({
        user_id: patientId,
        image_url: signedUrlData.signedUrl, // ใช้ signedUrl แทน publicUrl
        image_path: fileName,
        caption: caption || null,
        created_by: user.id,
      });

    if (dbError) {
      console.error('❌ Database error:', dbError);
      throw dbError;
    }

    console.log('✅ Saved to database successfully!');
    console.log('🎉 ========== UPLOAD COMPLETE ==========');

    alert('✅ อัปโหลดรูปภาพสำเร็จ!');
    setCaption('');
    await loadImages();
    
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
      errorMessage = '❌ ไม่พบ Storage Bucket กรุณาติดต่อผู้ดูแลระบบ';
    } else if (err.message?.includes('Duplicate')) {
      errorMessage = '❌ ไฟล์นี้มีอยู่แล้วในระบบ';
    } else if (err.message?.includes('policy')) {
      errorMessage = '❌ ไม่มีสิทธิ์อัปโหลดไฟล์ กรุณาตรวจสอบ Policy';
    } else if (err.message) { 
      errorMessage = `❌ ${err.message}`;
    }
    
    alert(errorMessage);
  } finally {
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
};

  const handleDeleteImage = async (imageId: string, imagePath: string) => {
    if (!confirm('คุณต้องการลบรูปภาพนี้หรือไม่?')) return;

    try {
      console.log('🗑️ Deleting image:', imageId);

      // ลบไฟล์จาก Storage
      const { error: storageError } = await supabase.storage
        .from('patient-status-images')
        .remove([imagePath]);

      if (storageError) {
        console.error('❌ Storage delete error:', storageError);
      }

      // ลบข้อมูลจาก Database
      const { error: dbError } = await supabase
        .from('patient_status_images')
        .delete()
        .eq('id', imageId);

      if (dbError) {
        console.error('❌ Database delete error:', dbError);
        throw dbError;
      }

      console.log('✅ Image deleted successfully!');
      alert('✅ ลบริูปภาพสำเร็จ!');
      await loadImages();
      
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      alert('เกิดข้อผิดพลาดในการลบรูปภาพ');
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
          
          <div className="flex items-center justify-between">
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
                {uploading ? 'กำลังอัปโหลด...' : 'เลือกรูปภาพ'}
              </button>

              {uploading && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <span>กำลังอัปโหลด...</span>
                </div>
              )}
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
                      src={image.image_url}
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
                        onClick={() => handleDeleteImage(image.id, image.image_path)}
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