// app/admin/appointments/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, User, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function AppointmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [followupData, setFollowupData] = useState<any>(null);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadAppointmentDetail();
  }, [router]);

  const loadAppointmentDetail = async () => {
    try {
      // โหลดข้อมูลนัดหมาย
      const { data: apptData } = await supabase
        .from('appointments')
        .select(`
          *,
          patients:profiles!inner (
            id,
            first_name,
            last_name,
            hospital_number,
            phone
          ),
          doctor:profiles!appointments_doctor_id_fkey (
            id,
            first_name,
            last_name
          )
        `)
        .eq('id', appointmentId)
        .single();

      setAppointment(apptData);
      setPatient(apptData?.patients);

      // ถ้าเป็น followup ให้โหลดข้อมูลการติดตาม
      if (apptData?.type === 'followup' && apptData?.followup_id) {
        const { data: followup } = await supabase
          .from('followups')
          .select('*')
          .eq('id', apptData.followup_id)
          .single();
        
        setFollowupData(followup);
      }
    } catch (error) {
      console.error('Error loading appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!appointment) return <div className="min-h-screen flex items-center justify-center">ไม่พบข้อมูล</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/appointments/view')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับรายการนัดหมาย
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              📅 รายละเอียดการนัดหมาย
            </h1>
            <p className="text-gray-600">
              ผู้ป่วย: {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ข้อมูลนัดหมาย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            ข้อมูลการนัดหมาย
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">ประเภท</p>
              <p className="font-semibold">
                {appointment.type === 'followup' ? 'ติดตามผล' : 
                 appointment.type === 'appointment' ? 'นัดหมาย' : appointment.type}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">วันที่/เวลา</p>
              <p className="font-semibold">
                {new Date(appointment.appointment_date).toLocaleString('th-TH', {
                  dateStyle: 'full',
                  timeStyle: 'short'
                })}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">สถานะ</p>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                appointment.status === 'completed' ? 'bg-green-100 text-green-700' :
                appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {appointment.status === 'completed' ? 'เสร็จสิ้น' :
                 appointment.status === 'cancelled' ? 'ยกเลิก' :
                 appointment.status === 'in_progress' ? 'กำลังดำเนินการ' : 'รอดำเนินการ'}
              </span>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">หมายเหตุ</p>
              <p className="font-semibold">{appointment.notes || '-'}</p>
            </div>
          </div>
        </div>

        {/* ข้อมูลการติดตาม (ถ้ามี) */}
        {followupData && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              ข้อมูลการติดตาม
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">น้ำหนัก</p>
                <p className="font-semibold">{followupData.weight || '-'} กก.</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">รอบเอว</p>
                <p className="font-semibold">{followupData.waist_circumference || '-'} ซม.</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ความดัน</p>
                <p className="font-semibold">
                  {followupData.blood_pressure_sys || '-'}/{followupData.blood_pressure_dia || '-'} mmHg
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">น้ำตาล (DTX)</p>
                <p className="font-semibold">{followupData.blood_sugar_dtx || '-'} mg%</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ความมั่นใจ</p>
                <p className="font-semibold">{followupData.confidence_score || '-'}/10</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">สถานะ</p>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  followupData.followup_status === 'excellent' ? 'bg-green-100 text-green-700' :
                  followupData.followup_status === 'good' ? 'bg-blue-100 text-blue-700' :
                  followupData.followup_status === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {followupData.followup_status === 'excellent' ? 'ดีมาก' :
                   followupData.followup_status === 'good' ? 'ดี' :
                   followupData.followup_status === 'fair' ? 'พอใช้' : 'ปรับปรุง'}
                </span>
              </div>
            </div>
            
            {followupData.notes && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">หมายเหตุ</p>
                <p className="text-gray-800">{followupData.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ปุ่มดำเนินการ */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push(`/admin/patients/${patient?.id}`)}
            className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-all"
          >
            ไปหน้าผู้ป่วย
          </button>
          
          {appointment.status !== 'completed' && (
            <button
              onClick={async () => {
                if (confirm('ยืนยันว่าติดตามผลเสร็จสิ้นแล้ว?')) {
                  await supabase
                    .from('appointments')
                    .update({ status: 'completed' })
                    .eq('id', appointmentId);
                  
                  alert('✅ บันทึกสำเร็จ');
                  loadAppointmentDetail();
                }
              }}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 transition-all"
            >
              <CheckCircle className="w-5 h-5 inline mr-2" />
              ติดตามเสร็จสิ้น
            </button>
          )}
        </div>
      </div>
    </div>
  );
}