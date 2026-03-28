// app/admin/appointments/followup/[id]/view/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { ArrowLeft, FileText, Calendar, Activity, Heart, TrendingUp, Printer, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function FollowupViewPage() {
  const router = useRouter();
  const params = useParams();
  const followupId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [followup, setFollowup] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [appointment, setAppointment] = useState<any>(null);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    loadFollowupData();
  }, [router]);

  const loadFollowupData = async () => {
    try {
      const { data, error } = await supabase
        .from('appointment_followups')
        .select(`
          *,
          appointments (
            appointment_date,
            appointment_type
          ),
          profiles!appointment_followups_user_id_fkey (
            first_name,
            last_name,
            hospital_number
          )
        `)
        .eq('id', followupId)
        .single();

      if (error) throw error;

      setFollowup(data);
      setPatient(data.profiles);
      setAppointment(data.appointments);
    } catch (error) {
      console.error('Error loading followup:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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

  if (!followup) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">ไม่พบข้อมูล</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'bg-green-100 text-green-700 border-green-300';
      case 'good': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'fair': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'needs_improvement': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'monitoring': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'excellent': return 'ดีมาก';
      case 'good': return 'ดี';
      case 'fair': return 'พอใช้';
      case 'needs_improvement': return 'ปรับปรุง';
      case 'monitoring': return 'เฝ้าระวัง';
      default: return status;
    }
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'not_completed': return 'bg-red-500';
      case 'not_in_plan': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getGoalStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'สำเร็จ';
      case 'not_completed': return 'ไม่สำเร็จ';
      case 'not_in_plan': return 'ยังไม่อยู่ในแผน';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>กลับ</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                รายละเอียดการติดตามนัดหมาย
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number} | 
                ครั้งที่: {followup.followup_round}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Printer className="w-4 h-4" />
                พิมพ์
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        
        {/* 1. ข้อมูลสุขภาพ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ข้อมูลสุขภาพ
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">น้ำหนัก</p>
              <p className="text-2xl font-bold text-blue-700">
                {followup.weight || '-'} <span className="text-sm font-normal">กก.</span>
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">รอบเอว</p>
              <p className="text-2xl font-bold text-green-700">
                {followup.waist_circumference || '-'} <span className="text-sm font-normal">ซม.</span>
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">ความดันโลหิต</p>
              <p className="text-2xl font-bold text-purple-700">
                {followup.blood_pressure_sys || '-'}/{followup.blood_pressure_dia || '-'} <span className="text-sm font-normal">mmHg</span>
              </p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">ค่าน้ำตาล (DTX)</p>
              <p className="text-2xl font-bold text-orange-700">
                {followup.blood_sugar_dtx || '-'} <span className="text-sm font-normal">mg%</span>
              </p>
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
            {followup.life_schedule_image_url && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">ตารางชีวิต</p>
                <a
                  href={followup.life_schedule_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                >
                  <FileText className="w-4 h-4" />
                  ดูรูปภาพ/ใบงาน
                </a>
              </div>
            )}
            {followup.adaptation_summary && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">สรุปการปรับตัว</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">
                  {followup.adaptation_summary === 'obstacles' && 'พบอุปสรรค/ความกังวล'}
                  {followup.adaptation_summary === 'opportunities' && 'โอกาส'}
                  {followup.adaptation_summary === 'other' && 'อื่นๆ'}
                </p>
              </div>
            )}
            {followup.adaptation_obstacles && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">อุปสรรค/ความกังวล</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{followup.adaptation_obstacles}</p>
              </div>
            )}
            {followup.adaptation_opportunities && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">โอกาส</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{followup.adaptation_opportunities}</p>
              </div>
            )}
            {followup.adaptation_other && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">อื่นๆ</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{followup.adaptation_other}</p>
              </div>
            )}
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
              <p className="text-sm font-medium text-gray-700 mb-2">การปรับปริมาณอาหาร</p>
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-3 h-3 rounded-full ${getGoalStatusColor(followup.food_amount_status)}`}></span>
                <span className="text-gray-800">{getGoalStatusText(followup.food_amount_status)}</span>
              </div>
              {followup.food_amount_note && (
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{followup.food_amount_note}</p>
              )}
            </div>
            <div className="border-b pb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">การปรับชนิดอาหาร</p>
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-3 h-3 rounded-full ${getGoalStatusColor(followup.food_type_status)}`}></span>
                <span className="text-gray-800">{getGoalStatusText(followup.food_type_status)}</span>
              </div>
              {followup.food_type_note && (
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{followup.food_type_note}</p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">การปรับการเคลื่อนไหว</p>
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-3 h-3 rounded-full ${getGoalStatusColor(followup.movement_status)}`}></span>
                <span className="text-gray-800">{getGoalStatusText(followup.movement_status)}</span>
              </div>
              {followup.movement_note && (
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{followup.movement_note}</p>
              )}
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
            <p className="text-sm text-gray-500 mb-3">ความมั่นใจ</p>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 bg-gray-200 rounded-full h-6">
                <div
                  className="bg-gradient-to-r from-pink-500 to-pink-600 h-6 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${(followup.confidence_score || 0) * 10}%` }}
                >
                  <span className="text-white text-sm font-bold">{followup.confidence_score || '-'}</span>
                </div>
              </div>
              <span className="text-2xl font-bold text-pink-600">{followup.confidence_score || '-'}/10</span>
            </div>
            {followup.confidence_improvement_plan && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">แผนปรับปรุงความมั่นใจ</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{followup.confidence_improvement_plan}</p>
              </div>
            )}
          </div>
        </div>

        {/* 5. สรุปข้อมูลการติดตามวันนี้ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">5</span>
            สรุปข้อมูลการติดตามวันนี้
          </h2>
          <div className="space-y-4">
            {followup.summary && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">สิ่งที่ทำได้สำเร็จ</p>
                <p className="text-gray-800 bg-green-50 p-4 rounded-lg border border-green-200">{followup.summary}</p>
              </div>
            )}
            {followup.recommendations && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">คำแนะนำเพิ่มเติม</p>
                <p className="text-gray-800 bg-blue-50 p-4 rounded-lg border border-blue-200">{followup.recommendations}</p>
              </div>
            )}
          </div>
        </div>

        {/* 6. สถานะการติดตาม */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-bold">6</span>
            สถานะการติดตาม
          </h2>
          <div className="flex items-center gap-4">
            <span className={`px-6 py-3 rounded-full text-lg font-semibold border-2 ${getStatusColor(followup.followup_status)}`}>
              {getStatusText(followup.followup_status)}
            </span>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">ข้อมูลระบบ</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">วันที่ติดตาม:</span>
              <p className="text-gray-800 font-medium">
                {new Date(followup.followup_date).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <span className="text-gray-500">วันที่บันทึก:</span>
              <p className="text-gray-800 font-medium">
                {new Date(followup.created_at).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}