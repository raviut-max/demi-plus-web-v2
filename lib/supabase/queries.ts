import { supabase } from './client';

// =====================================================
// ฟังก์ชัน Login (รองรับทั้ง Patient และ Staff)
// =====================================================
export async function login(idCard: string, password: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, id_card, password_hash, role, is_active')
      .eq('id_card', idCard)
      .eq('password_hash', password)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    let full_name_th = 'ผู้ใช้';
    let hospital_number = '';
    let pam_level = 'L2';
    let zone = 'Green Zone';
    let current_step = 'Starter';

    if (['admin', 'doctor', 'helper'].includes(data.role)) {
      const { data: doctor } = await supabase
        .from('doctors')
        .select('full_name_th, specialization_th')
        .eq('user_id', data.id)
        .single();

      full_name_th = doctor?.full_name_th || 'ผู้ดูแลระบบ';
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, hospital_number, pam_level, pam_score, zone, current_step')
        .eq('id', data.id)
        .single();

      full_name_th = profile?.first_name && profile?.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : 'ผู้ใช้';
      hospital_number = profile?.hospital_number || '';
      pam_level = profile?.pam_level || 'L2';
      zone = profile?.zone || 'Green Zone';
      current_step = profile?.current_step || 'Starter';
    }

    return {
      id: data.id,
      id_card: data.id_card,
      full_name_th: full_name_th,
      hospital_number: hospital_number,
      pam_level: pam_level,
      pam_score: 0,
      zone: zone,
      current_step: current_step,
      role: data.role,
    };
  } catch (err) {
    console.error('Login error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชัน Logout
// =====================================================
export async function logout() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_data');
  localStorage.removeItem('login_time');
}

// =====================================================
// ฟังก์ชันตรวจสอบ Session
// =====================================================
export function checkSession() {
  const userId = localStorage.getItem('user_id');
  const userData = localStorage.getItem('user_data');
  const loginTime = localStorage.getItem('login_time');

  if (!userId || !userData) {
    return null;
  }

  if (loginTime) {
    const loginDate = new Date(loginTime);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 7) {
      logout();
      return null;
    }
  }

  return JSON.parse(userData);
}

// =====================================================
// ฟังก์ชันดึงข้อมูลผู้ใช้ (Profile)
// =====================================================
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;

  if (data) {
    data.full_name = data.first_name && data.last_name
      ? `${data.first_name} ${data.last_name}`
      : '';
  }

  return data;
}


// =====================================================
// ฟังก์ชันดึงรายการผู้ป่วยทั้งหมด (Admin)
// =====================================================
export async function getPatientList(search?: string, pamLevel?: string) {
  try {
    let query = supabase
      .from('profiles')
      .select(`
        *, 
        users!profiles_id_fkey ( 
          id_card, 
          role, 
          is_active, 
          created_at 
        ),
        hospitals (
          id,
          name,
          code
        )
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,hospital_number.ilike.%${search}%`
      );
    }

    if (pamLevel) {
      query = query.eq('pam_level', pamLevel);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching patient list:', error);
      return [];
    }

    const patientsWithData = data?.map(patient => ({
      ...patient,
      full_name: patient.first_name && patient.last_name 
        ? `${patient.first_name} ${patient.last_name}` 
        : '',
    })) || [];

    console.log('📊 Patient List Data:', patientsWithData.length);
    return patientsWithData;
  } catch (err) {
    console.error('Get patient list error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันกู้คืนผู้ป่วย (Restore)
// =====================================================
export async function restorePatient(patientId: string) {
  try {
    console.log('♻️ Restoring patient:', patientId);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: true,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error restoring profile:', profileError);
      return { success: false, error: profileError.message };
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', patientId);

    if (userError) {
      console.error('Error restoring user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนผู้ป่วย' };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการผู้ป่วยที่ถูกลบแล้ว
// =====================================================
export async function getDeletedPatients() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`*, users!profiles_id_fkey ( id_card, role, is_active )`)
      .eq('is_active', false)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching deleted patients:', error);
      return [];
    }

    const patientsWithData = data?.map(patient => ({
      ...patient,
      full_name: patient.first_name && patient.last_name 
        ? `${patient.first_name} ${patient.last_name}` 
        : '',
    })) || [];

    return patientsWithData;
  } catch (err) {
    console.error('Get deleted patients error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันลงทะเบียนผู้ป่วยใหม่ (Admin)
// =====================================================
export async function registerPatient(data: {
  id_card: string;
  password: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  birth_date: string;
  gender: string;
  phone?: string;
  email?: string;
  current_weight?: number;
  height?: number;
  waist_circumference?: number;
  coach_id?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  house_number?: string;
  address_line1?: string;
  soi?: string;
  road?: string;
  village_no?: string;
  village_name?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  postal_code?: string;
  subdistrict_health_center?: string;
  diabetes_type?: string;
  blood_sugar?: number;
  hba1c_level?: number;
  notes?: string;
  occupation?: string;
  education_level?: string;
  hospital_id?: string;
  village_id?: string;
  pam_level?: string;
  pam_score?: number;
  zone?: string;
  created_by: string;
}) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: 'patient',
        is_active: true,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        first_name: data.first_name,
        last_name: data.last_name,
        hospital_number: data.hospital_number,
        birth_date: data.birth_date,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        current_weight: data.current_weight,
        height: data.height,
        waist_circumference: data.waist_circumference,
        coach_id: data.coach_id,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        emergency_contact_relationship: data.emergency_contact_relationship,
        house_number: data.house_number,
        address_line1: data.address_line1,
        soi: data.soi,
        road: data.road,
        village_no: data.village_no,
        village_name: data.village_name,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        postal_code: data.postal_code,
        subdistrict_health_center: data.subdistrict_health_center,
        diabetes_type: data.diabetes_type,
        blood_sugar: data.blood_sugar,
        hba1c_level: data.hba1c_level,
        notes: data.notes,
        occupation: data.occupation,
        education_level: data.education_level,
        hospital_id: data.hospital_id,
        village_id: data.village_id,
        
        // ✅ ใช้ค่าที่ส่งมา หรือ default สำหรับผู้ป่วยใหม่
        pam_level: data.pam_level || 'L0',
        pam_score: data.pam_score ?? 0,
        zone: data.zone || 'Zero Zone',
        
        current_step: 'Starter',
        is_active: true,
        status: 'active',
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      await supabase.from('users').delete().eq('id', user.id);
      return { success: false, error: profileError.message };
    }

    return { success: true, user, profile };
  } catch (err) {
    console.error('Register patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลงทะเบียน' };
  }
}


// =====================================================
// ฟังก์ชันดึงข้อมูลผู้ป่วยรายคน (Admin)
// =====================================================
export async function getPatientDetail(userId: string) {
  try {
    console.log('🔍 Fetching patient detail for ID:', userId);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        hospitals (
          id,
          name,
          code,
          type
        )
      `)
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      return null;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id_card, role, is_active, created_at')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Error fetching user:', userError);
      return null;
    }

    const result = {
      ...profile,
      full_name: profile.first_name && profile.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : '',
      users: userData
    };

    console.log('✅ Patient detail fetched successfully:', result);
    return result;
  } catch (err) {
    console.error('❌ Get patient detail error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงคำถาม Screening
// =====================================================
export async function getScreeningQuestions(questionType: string = 'pam') {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('question_type', questionType)
      .eq('is_active', true)
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching screening questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get screening questions error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันบันทึก Screening
// =====================================================
export async function saveScreening(data: {
  user_id: string;
  screening_type: string;
  pam_total_score?: number;
  pam_level_result?: string;
  proms_q1_score?: number;
  proms_q2_score?: number;
  proms_q3_score?: number;
  proms_q4_score?: number;
  proms_zone?: string;
  proms_has_low_score?: boolean;
  confidence_score?: number;
  confidence_improvement_plan?: string;
  conducted_by?: string;
  responses: Array<{
    question_id: string;
    question_number: number;
    question_type: string;
    selected_option?: string;
    score?: number;
  }>;
}) {
  try {
    const { data: screening, error: screeningError } = await supabase
      .from('screenings')
      .insert({
        user_id: data.user_id,
        screening_type: data.screening_type,
        pam_total_score: data.pam_total_score,
        pam_level_result: data.pam_level_result,
        proms_q1_score: data.proms_q1_score,
        proms_q2_score: data.proms_q2_score,
        proms_q3_score: data.proms_q3_score,
        proms_q4_score: data.proms_q4_score,
        proms_zone: data.proms_zone,
        proms_has_low_score: data.proms_has_low_score,
        confidence_score: data.confidence_score,
        confidence_improvement_plan: data.confidence_improvement_plan,
        conducted_by: data.conducted_by,
      })
      .select()
      .single();

    if (screeningError) {
      console.error('Error creating screening:', screeningError);
      return { success: false, error: screeningError.message };
    }

    const responses = data.responses.map(r => ({
      screening_id: screening.id,
      question_id: r.question_id,
      question_number: r.question_number,
      question_type: r.question_type,
      selected_option: r.selected_option,
      score: r.score,
    }));

    const { error: responsesError } = await supabase
      .from('screening_responses')
      .insert(responses);

    if (responsesError) {
      console.error('Error saving responses:', responsesError);
      return { success: false, error: responsesError.message };
    }

    if (data.pam_level_result) {
      const levelMap: Record<string, string> = {
        'Deny': 'L1',
        'General': 'L2',
        'Intensive': 'L3',
        'Champion': 'L4',
      };

      const zoneMap: Record<string, string> = {
        'Deny': 'Red Zone',
        'General': 'Green Zone',
        'Intensive': 'Green Zone',
        'Champion': 'Green Zone',
      };

      await supabase
        .from('profiles')
        .update({
          pam_level: levelMap[data.pam_level_result] || 'L1',
          zone: zoneMap[data.pam_level_result] || 'Green Zone',
          pam_score: data.pam_total_score,
        })
        .eq('id', data.user_id);
    }

    return { success: true, screening };
  } catch (err) {
    console.error('Save screening error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึก screening' };
  }
}

// =====================================================
// ฟังก์ชันดึงข้อมูลโค้ช/หมอทั้งหมด
// =====================================================
export async function getCoaches() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('id, user_id, full_name_th, specialization_th, is_active')
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });

    if (error) {
      console.error('Error fetching coaches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get coaches error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงนัดหมายทั้งหมด (Admin)
// =====================================================
// ✅ แก้ไขแล้ว - ระบุ relationship ให้ชัดเจน
export async function getAppointments(patientId: string) {
  try {
    console.log('📅 [getAppointments] Fetching for patient:', patientId);
    
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors:doctor_id (
          id,
          full_name_th,
          specialization_th
        )
      `)
      .eq('user_id', patientId)
      .order('appointment_date', { ascending: true });

    if (error) {
      console.error('❌ [getAppointments] Error:', error);
      return [];
    }

    console.log('✅ [getAppointments] Found:', data?.length || 0, 'appointments');
    return data || [];
  } catch (err) {
    console.error('❌ [getAppointments] Error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันสร้างนัดหมายใหม่ (Admin)
// =====================================================
export async function createAppointment(data: {
  user_id: string;
  doctor_id: string;
  appointment_type: string;
  appointment_date: string;
  duration_minutes?: number;
  location_type?: string;
  location_detail?: string;
  notes?: string;
  created_by: string;
}) {
  try {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        user_id: data.user_id,
        doctor_id: data.doctor_id,
        appointment_type: data.appointment_type,
        appointment_date: data.appointment_date,
        duration_minutes: data.duration_minutes || 30,
        location_type: data.location_type || 'clinic',
        location_detail: data.location_detail,
        status: 'scheduled',
        notes: data.notes,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating appointment:', error);
      return { success: false, error: error.message };
    }

    return { success: true, appointment };
  } catch (err) {
    console.error('Create appointment error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างนัดหมาย' };
  }
}

// =====================================================
// ฟังก์ชันดึงสถิติ Dashboard (Admin)
// =====================================================
export async function getDashboardStats() {
  try {
    const { count: totalPatients } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const today = new Date().toISOString().split('T')[0];

    const { count: todayRecords } = await supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('record_date', today);

    const { count: todayAppointments } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('appointment_date', today)
      .lte('appointment_date', today + 'T23:59:59');

    const { count: pendingAssessments } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('pam_level', 'L1');

    return {
      totalPatients: totalPatients || 0,
      todayRecords: todayRecords || 0,
      todayAppointments: todayAppointments || 0,
      pendingAssessments: pendingAssessments || 0,
    };
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return {
      totalPatients: 0,
      todayRecords: 0,
      todayAppointments: 0,
      pendingAssessments: 0,
    };
  }
}

// ✅ แก้ไขฟังก์ชัน addStaff
export async function addStaff(data: {
  id_card: string;
  password: string;
  full_name_th: string;
  role: 'doctor' | 'helper';
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;  // ✅ เพิ่ม field นี้
  created_by: string;
}) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: data.role,
        is_active: true,
        created_by: data.created_by,
        hospital_id: data.hospital_id || null,  // ✅ บันทึก hospital_id
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    if (data.role === 'doctor' || data.role === 'helper') {
      const { error: doctorError } = await supabase
        .from('doctors')
        .insert({
          user_id: user.id,
          full_name: data.id_card,
          full_name_th: data.full_name_th,
          specialization_th: data.specialization_th || (data.role === 'helper' ? 'เจ้าหน้าที่สาธารณสุข' : 'แพทย์'),
          is_active: true,
          is_verified: false,
        });

      if (doctorError) {
        console.error('Error creating doctor profile:', doctorError);
        await supabase.from('users').delete().eq('id', user.id);
        return { success: false, error: doctorError.message };
      }
    }

    return { success: true, user };
  } catch (err) {
    console.error('Add staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการเพิ่มเจ้าหน้าที่' };
  }
}

// ✅ แก้ไขฟังก์ชัน updateStaff
export async function updateStaff(userId: string, data: {
  full_name_th?: string;
  specialization_th?: string;
  phone?: string;
  email?: string;
  hospital_id?: string;  // ✅ เพิ่ม field นี้
  is_active?: boolean;
}) {
  try {
    // ✅ อัปเดต hospital_id ในตาราง users
    if (data.hospital_id !== undefined) {
      const { error: userError } = await supabase
        .from('users')
        .update({ hospital_id: data.hospital_id })
        .eq('id', userId);

      if (userError) {
        console.error('Error updating user hospital:', userError);
      }
    }

    // ✅ อัปเดตข้อมูลในตาราง doctors
    const { error } = await supabase
      .from('doctors')
      .update({
        full_name_th: data.full_name_th,
        specialization_th: data.specialization_th,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' };
  }
}

// ✅ แก้ไขฟังก์ชัน getStaffList ให้ดึงข้อมูลโรงพยาบาลมาด้วย
export async function getStaffList(role?: string) {
  try {
    let query = supabase
      .from('users')
      .select(`
        *,
        doctors (
          id,
          full_name_th,
          specialization_th,
          is_active,
          is_verified
        ),
        hospitals (
          id,
          name,
          code
        )
      `)
      .in('role', ['admin', 'doctor', 'helper'])
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching staff list:', error);
      return [];
    }

    // ✅ เพิ่ม hospital_name จาก hospitals table
    const staffWithData = data?.map(staff => ({
      ...staff,
      hospital_name: staff.hospitals?.name || '-',
      hospital_code: staff.hospitals?.code || '-',
    })) || [];

    console.log('📊 Staff List Data:', staffWithData.length);
    return staffWithData;
  } catch (err) {
    console.error('Get staff list error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันลบ/ปิดการใช้งานเจ้าหน้าที่
// =====================================================
export async function deactivateStaff(userId: string) {
  try {
    await supabase
      .from('doctors')
      .update({ is_active: false })
      .eq('user_id', userId);

    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      console.error('Error deactivating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Deactivate staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการปิดการใช้งาน' };
  }
}

// =====================================================
// ฟังก์ชันดึงข้อมูลเจ้าหน้าที่รายคน
// =====================================================
export async function getStaffDetail(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email, is_active, is_verified )`)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching staff detail:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get staff detail error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงประวัติการประเมินพร้อมคำตอบ
// =====================================================
export async function getScreeningHistory(patientId: string) {
  try {
    const { data: screenings, error } = await supabase
      .from('screenings')
      .select(`*, screening_responses ( question_id, question_number, question_type, selected_option, score )`)
      .eq('user_id', patientId)
      .order('screening_date', { ascending: false });

    if (error) {
      console.error('Error fetching screening history:', error);
      return [];
    }

    return screenings || [];
  } catch (err) {
    console.error('Get screening history error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงคำถามทั้งหมด
// =====================================================
export async function getAllScreeningQuestions() {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('is_active', true)
      .order('question_type', { ascending: true })
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get all questions error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันลบผู้ป่วย (Soft Delete)
// =====================================================
export async function deletePatient(patientId: string) {
  try {
    console.log('🗑️ Deleting patient:', patientId);

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: false,
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return { success: false, error: profileError.message };
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', patientId);

    if (userError) {
      console.error('Error updating user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient deleted successfully');
    return { success: true };
  } catch (err) {
    console.error('Delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วย' };
  }
}

// =====================================================
// ฟังก์ชันลบผู้ป่วยถาวร (Permanent Delete)
// =====================================================
export async function permanentlyDeletePatient(patientId: string) {
  try {
    console.log('🗑️ Permanently deleting patient:', patientId);

    const screenings = await supabase
      .from('screenings')
      .select('id')
      .eq('user_id', patientId);

    if (screenings.data && screenings.data.length > 0) {
      await supabase
        .from('screening_responses')
        .delete()
        .in(
          'screening_id',
          screenings.data.map((s: any) => s.id)
        );
    }

    await supabase.from('screenings').delete().eq('user_id', patientId);
    await supabase.from('appointments').delete().eq('user_id', patientId);

    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', patientId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return { success: false, error: profileError.message };
    }

    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', patientId);

    if (userError) {
      console.error('Error deleting user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient permanently deleted');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วยถาวร' };
  }
}

// =====================================================
// ฟังก์ชันลบเจ้าหน้าที่ถาวร (Permanent Delete)
// =====================================================
export async function permanentlyDeleteStaff(staffId: string) {
  try {
    console.log('🗑️ Permanently deleting staff:', staffId);

    await supabase.from('doctors').delete().eq('user_id', staffId);

    const { error } = await supabase.from('users').delete().eq('id', staffId);

    if (error) {
      console.error('Error deleting staff:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Staff permanently deleted');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบเจ้าหน้าที่ถาวร' };
  }
}

// =====================================================
// ฟังก์ชันกู้คืนเจ้าหน้าที่ (Restore)
// =====================================================
export async function restoreStaff(staffId: string) {
  try {
    console.log('♻️ Restoring staff:', staffId);

    await supabase.from('doctors').update({ is_active: true }).eq('user_id', staffId);

    const { error } = await supabase.from('users').update({ is_active: true }).eq('id', staffId);

    if (error) {
      console.error('Error restoring staff:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Staff restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนเจ้าหน้าที่' };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการเจ้าหน้าที่ที่ปิดการใช้งาน
// =====================================================
export async function getDeactivatedStaff() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email )`)
      .in('role', ['admin', 'doctor', 'helper'])
      .eq('is_active', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching deactivated staff:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get deactivated staff error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันสร้างเป้าหมายเริ่มต้นตาม PAM Level (แก้ไขแล้ว)
// =====================================================
export async function createDefaultGoals(
  userId: string,
  pamLevel: string,
  createdBy: string
) {
  try {
    console.log('🎯 Creating default goals for user:', userId, 'PAM Level:', pamLevel);
    
    if (pamLevel === 'L1') {
      console.log('⚠️ L1 Patient: No default goals created');
      return { success: true, message: 'L1 - ไม่สร้างเป้าหมายอัตโนมัติ', count: 0 };
    }

    // ✅ 1. ตรวจสอบว่ามี goals อยู่แล้วหรือไม่
    const { data: existingGoals, error: checkError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (checkError) {
      console.error('Error checking existing goals:', checkError);
    }

    // ✅ 2. ถ้ามี goals อยู่แล้ว → ตรวจสอบว่าตรงกับ PAM Level หรือไม่
    if (existingGoals && existingGoals.length > 0) {
      const goalNames = existingGoals.map(g => g.goal_name);
      
      // ✅ ตรวจสอบว่าเป็น L4 แต่ได้ goals ของ L2/L3 หรือไม่
      const isL4ButHasL2L3Goals = pamLevel === 'L4' && 
        goalNames.some(name => ['stop_sweet', 'reduce_rice', 'protein_vegetable', 'exercise_walk', 'record_weight_sugar'].includes(name));
      
      // ✅ ตรวจสอบว่าเป็น L2/L3 แต่ได้ goals ของ L4 หรือไม่
      const isL2L3ButHasL4Goals = (pamLevel === 'L2' || pamLevel === 'L3') && 
        goalNames.some(name => ['carb_control', 'protein_intake', 'water_intake', 'stretching', 'cardio', 'strengthening', 'hiit', 'sleep'].includes(name));

      if (isL4ButHasL2L3Goals || isL2L3ButHasL4Goals) {
        console.log('⚠️ PAM Level changed! Archiving old goals and creating new ones...');
        
        // ✅ Archive goals เก่า
        const { error: archiveError } = await supabase
          .from('goals')
          .update({ 
            status: 'archived',
            is_current: false,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active');

        if (archiveError) {
          console.error('Error archiving old goals:', archiveError);
        }
      } else {
        // ✅ Goals ตรงกับ PAM Level แล้ว → ไม่ต้องสร้างใหม่
        console.log('✅ Goals already exist and match PAM Level:', existingGoals.length, 'goals');
        return { 
          success: true, 
          message: 'มีเป้าหมายอยู่แล้วและตรงกับ PAM Level', 
          count: existingGoals.length,
          alreadyExists: true
        };
      }
    }

    // ✅ 3. สร้าง goals ใหม่
    const today = new Date().toISOString().split('T')[0];
    const goals = [];

    if (pamLevel === 'L2' || pamLevel === 'L3') {
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          'stop_sweet',
          'reduce_rice',
          'protein_vegetable',
          'exercise_walk',
          'record_weight_sugar'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          if (activity.activity_code === 'exercise_walk') {
            targetValue = 15;
            targetUnit = 'minutes';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th,
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L2/L3: Created ${goals.length} default goals`);
    }

    if (pamLevel === 'L4') {
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          'carb_control',
          'protein_intake',
          'water_intake',
          'stretching',
          'cardio',
          'strengthening',
          'hiit',
          'sleep'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          if (activity.activity_code === 'water_intake') {
            targetValue = 1;
            targetUnit = 'liters';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th,
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L4: Created ${goals.length} default goals`);
    }

    if (goals.length > 0) {
      const { error } = await supabase.from('goals').insert(goals);

      if (error) {
        console.error('❌ Error creating goals:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ Created ${goals.length} default goals successfully`);
      return { success: true, count: goals.length };
    }

    return { success: true, count: 0 };
  } catch (err) {
    console.error('Create default goals error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย' };
  }
}

// =====================================================
// ฟังก์ชันดึงเป้าหมายของผู้ป่วย
// =====================================================
export async function getPatientGoals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching goals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get patient goals error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันอัปเดตเวลาออกกำลังกายใน Goals
// =====================================================
export async function updateExerciseGoal(
  userId: string,
  goalName: string,
  targetValue: number,
  targetUnit: string = 'minutes'
) {
  try {
    const { error } = await supabase
      .from('goals')
      .update({
        target_value: targetValue,
        target_unit: targetUnit,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('goal_name', goalName)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (error) {
      console.error('Error updating exercise goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update exercise goal error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการอัปเดตเป้าหมาย' };
  }
}

// =====================================================
// ฟังก์ชันบันทึกเวลาออกกำลังกายที่ทำได้จริง
// =====================================================
export async function saveExerciseRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  exercise_minutes: number;
  is_completed: boolean;
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        exercise_minutes: data.exercise_minutes,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Error saving exercise record:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save exercise record error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงกิจกรรมตาม PAM Level
// =====================================================
export async function getActivities(pamLevel: string) {
  console.log('Fetching activities for pamLevel:', pamLevel);

  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching activities:', error);
    return [];
  }

  console.log('Activities fetched:', data?.length || 0);
  return data || [];
}

// =====================================================
// ฟังก์ชันบันทึกกิจกรรม (ใช้ upsert)
// =====================================================
export async function saveRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  is_completed: boolean;
  weight?: number;
  blood_sugar?: number;
  sweet_type?: string[];
  exercise_minutes?: number;
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.blood_sugar !== undefined && { blood_sugar: data.blood_sugar }),
        ...(data.sweet_type !== undefined && { sweet_type: data.sweet_type }),
        ...(data.exercise_minutes !== undefined && { exercise_minutes: data.exercise_minutes }),
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Upsert error:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save record error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงบันทึกวันนี้
// =====================================================
export async function getTodayRecords(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('records')
      .select(`
        id, 
        activity_id, 
        is_completed, 
        record_date, 
        sweet_type, 
        weight, 
        blood_sugar,
        exercise_minutes
      `)
      .eq('user_id', userId)
      .eq('record_date', today);

    if (error) {
      console.error('Error fetching today records:', error);
      return [];
    }

    console.log('📝 Today records:', data);
    return data || [];
  } catch (err) {
    console.error('Get today records error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงเป้าหมายรายสัปดาห์
// =====================================================
export async function getWeeklyGoals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('goal_type', 'weekly_activity');

    if (error) {
      console.error('Error fetching weekly goals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get weekly goals error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึง Progress 7 วัน
// =====================================================
export async function getProgress(userId: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('records')
    .select(`*, activities ( activity_code, activity_name_th, activity_type )`)
    .eq('user_id', userId)
    .gte('record_date', startDate.toISOString())
    .order('record_date', { ascending: false });

  if (error) return [];
  return data;
}

// =====================================================
// ฟังก์ชันดึงเป้าหมาย
// =====================================================
export async function getGoals(userId: string) {
  try {
    console.log('Fetching goals for userId:', userId);

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error fetching goals:', error);
      return [];
    }

    console.log('Goals fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get goals error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงนัดหมายครั้งถัดไป
// =====================================================
export async function getNextAppointment(userId: string) {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors (
          id,
          full_name_th,
          specialization_th
        )
      `)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'confirmed', 'pending'])
      .gte('appointment_date', startOfToday.toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching appointment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Appointment error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงความรู้ (Knowledge)
// =====================================================
export async function getKnowledge(pamLevel: string = 'ALL') {
  try {
    console.log('📚 [getKnowledge] Fetching for pamLevel:', pamLevel);

    const { data, error } = await supabase
      .from('knowledge')
      .select('*')
      .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [getKnowledge] Error:', error);
      return [];
    }

    console.log('✅ [getKnowledge] Fetched:', data?.length || 0, 'items');
    return data || [];
  } catch (err) {
    console.error('❌ [getKnowledge] Error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันนับจำนวนรอบการบันทึกเป้าหมาย
// =====================================================
export async function getGoalRoundCount(userId: string) {
  try {
    const { count, error } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'archived');

    if (error) {
      console.error('Error counting goal rounds:', error);
      return 1;
    }

    return (count || 0) + 1;
  } catch (err) {
    console.error('Get goal round count error:', err);
    return 1;
  }
}

// =====================================================
// ฟังก์ชันดึงรอบล่าสุดที่บันทึก
// =====================================================
export async function getLatestGoalRound(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('round_number, created_at')
      .eq('user_id', userId)
      .eq('goal_type', 'weekly_activity')
      .order('round_number', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching latest goal round:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('Get latest goal round error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันบันทึกเป้าหมายรอบใหม่
// =====================================================
export async function saveGoalsNewRound(data: {
  user_id: string;
  goals: Array<{
    goal_name: string;
    goal_name_th: string;
    target_days: number;
    target_value?: number;
    target_unit?: string;
    activity_id?: string;
    primary_goal_note?: string;
    weekly_goal_note?: string;
  }>;
  created_by: string;
}) {
  try {
    console.log('💾 [saveGoalsNewRound] Starting...', data.user_id);
    const today = new Date().toISOString().split('T')[0];
    console.log('[saveGoalsNewRound] Today:', today);

    const { data: existingTodayGoals, error: fetchError } = await supabase
      .from('goals')
      .select('id, goal_name, created_at')
      .eq('user_id', data.user_id)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active')
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59');

    if (fetchError) {
      console.error('Error fetching existing goals:', fetchError);
    }

    console.log('📋 [saveGoalsNewRound] Existing goals today:', existingTodayGoals?.length || 0);

    let nextRound: number;

    if (existingTodayGoals && existingTodayGoals.length > 0) {
      nextRound = existingTodayGoals[0].round_number || 1;
      console.log('📅 [saveGoalsNewRound] Same day - using existing round:', nextRound);

      const { error: deleteError } = await supabase
        .from('goals')
        .delete()
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');

      if (deleteError) {
        console.error('❌ [saveGoalsNewRound] Error deleting today goals:', deleteError);
      } else {
        console.log('✅ [saveGoalsNewRound] Successfully deleted', existingTodayGoals.length, 'goals for today');
      }
    } else {
      console.log('🆕 [saveGoalsNewRound] New day - archiving old goals');

      const { data: goalsToArchive } = await supabase
        .from('goals')
        .select('id, goal_name')
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');

      console.log('📦 [saveGoalsNewRound] Goals to archive:', goalsToArchive?.length || 0);

      if (goalsToArchive && goalsToArchive.length > 0) {
        const { error: archiveError } = await supabase
          .from('goals')
          .update({
            is_current: false,
            status: 'archived',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', data.user_id)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active');

        if (archiveError) {
          console.error('❌ [saveGoalsNewRound] Error archiving goals:', archiveError);
        } else {
          console.log('✅ [saveGoalsNewRound] Archived', goalsToArchive?.length || 0, 'old goals');
        }
      }

      const { data: allRounds } = await supabase
        .from('goals')
        .select('round_number')
        .eq('user_id', data.user_id)
        .eq('goal_type', 'weekly_activity');

      const uniqueRounds = new Set(allRounds?.map(g => g.round_number) || []);
      nextRound = uniqueRounds.size + 1;

      console.log('🆕 [saveGoalsNewRound] New day - next round:', nextRound);
    }

    const newGoals = data.goals.map(goal => ({
      user_id: data.user_id,
      goal_type: 'weekly_activity' as const,
      goal_name: goal.goal_name,
      goal_name_th: goal.goal_name_th,
      target_days: goal.target_days,
      target_value: goal.target_value || null,
      target_unit: goal.target_unit || null,
      activity_id: goal.activity_id || null,
      status: 'active' as const,
      is_current: true,
      round_number: nextRound,
      start_date: today,
      priority: 1,
      is_core_goal: true,
      created_by: data.created_by,
      primary_goal_note: goal.primary_goal_note || null,
      weekly_goal_note: goal.weekly_goal_note || null,
      last_recorded_date: today,
    }));

    console.log('📝 [saveGoalsNewRound] Creating', newGoals.length, 'new goals');

    const { error: insertError, data: insertedData } = await supabase
      .from('goals')
      .insert(newGoals)
      .select();

    if (insertError) {
      console.error('❌ [saveGoalsNewRound] Error creating new goals:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ [saveGoalsNewRound] Created new goals successfully');
    console.log('✅ [saveGoalsNewRound] Inserted IDs:', insertedData?.map(g => g.id));

    return {
      success: true,
      round_number: nextRound,
      goals_count: newGoals.length,
    };
  } catch (err) {
    console.error('❌ [saveGoalsNewRound] Error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึกเป้าหมาย' };
  }
}

// =====================================================
// ฟังก์ชันบันทึกการติดตามนัดหมาย
// =====================================================
export async function saveAppointmentFollowup(data: {
  appointment_id: string;
  user_id: string;
  followup_date: string;
  followup_round: number;
  blood_sugar_dtx?: number;
  blood_pressure_sys?: number;
  blood_pressure_dia?: number;
  pulse?: number;
  weight?: number;
  waist_circumference?: number;
  food_amount_status?: 'completed' | 'not_completed' | 'not_in_plan';
  food_type_status?: 'completed' | 'not_completed' | 'not_in_plan';
  movement_status?: 'completed' | 'not_completed' | 'not_in_plan';
  confidence_score?: number;
  notes?: string;
  life_schedule_image_url?: string;
  followup_status?: 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'monitoring';
  conducted_by: string;
}) {
  try {
    const { data: followup, error } = await supabase
      .from('appointment_followups')
      .upsert({
        appointment_id: data.appointment_id,
        user_id: data.user_id,
        followup_date: data.followup_date,
        followup_round: data.followup_round,
        blood_sugar_dtx: data.blood_sugar_dtx,
        blood_pressure_sys: data.blood_pressure_sys,
        blood_pressure_dia: data.blood_pressure_dia,
        pulse: data.pulse,
        weight: data.weight,
        waist_circumference: data.waist_circumference,
        food_amount_status: data.food_amount_status,
        food_type_status: data.food_type_status,
        movement_status: data.movement_status,
        confidence_score: data.confidence_score,
        notes: data.notes,
        life_schedule_image_url: data.life_schedule_image_url,
        followup_status: data.followup_status,
        conducted_by: data.conducted_by,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'appointment_id,followup_round',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving followup:', error);
      return { success: false, error: error.message };
    }

    return { success: true, followup };
  } catch (err) {
    console.error('Save followup error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึก' };
  }
}

// =====================================================
// ฟังก์ชันดึงประวัติการติดตามนัดหมายของผู้ป่วย
// =====================================================
export async function getPatientFollowupHistory(userId: string, limit?: number) {
  try {
    console.log('📋 Fetching followup history for user:', userId);

    let query = supabase
      .from('appointment_followups')
      .select(`
        *,
        appointments (
          appointment_date,
          appointment_type
        )
      `)
      .eq('user_id', userId)
      .order('followup_date', { ascending: false })
      .order('followup_round', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching followup history:', error);
      return [];
    }

    console.log('✅ Followup history fetched:', data?.length || 0, 'records');
    return data || [];
  } catch (err) {
    console.error('❌ Get followup history error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงการติดตามตาม appointment_id
// =====================================================
export async function getFollowupByAppointmentId(appointmentId: string) {
  try {
    const { data, error } = await supabase
      .from('appointment_followups')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('followup_round', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching followup:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get followup error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันนับจำนวนรอบการติดตาม
// =====================================================
export async function getFollowupRoundCount(userId: string) {
  try {
    const { count, error } = await supabase
      .from('appointment_followups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error counting followups:', error);
      return 1;
    }

    return (count || 0) + 1;
  } catch (err) {
    console.error('Get followup round count error:', err);
    return 1;
  }
}

// =====================================================
// ฟังก์ชันบันทึกการติดตามนัดหมาย (แบบสมบูรณ์)
// =====================================================
export async function saveAppointmentFollowupComplete(data: {
  appointment_id: string;
  user_id: string;
  followup_date: string;
  followup_round: number;
  weight?: number | null;
  waist_circumference?: number | null;
  blood_pressure_sys?: number | null;
  blood_pressure_dia?: number | null;
  blood_sugar_dtx?: number | null;
  life_schedule_image_url?: string | null;
  adaptation_summary?: string | null;
  adaptation_obstacles?: string | null;
  adaptation_opportunities?: string | null;
  adaptation_other?: string | null;
  food_amount_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  food_type_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  movement_status?: 'completed' | 'not_completed' | 'not_in_plan' | null;
  food_amount_note?: string | null;
  food_type_note?: string | null;
  movement_note?: string | null;
  confidence_score?: number | null;
  confidence_improvement_plan?: string | null;
  summary?: string | null;
  recommendations?: string | null;
  followup_status?: 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'monitoring' | null;
  conducted_by: string;
}) {
  try {
    console.log('💾 [saveAppointmentFollowupComplete] Starting...');
    console.log('📝 Data to save:', data);

    if (!data.conducted_by) {
      throw new Error('conducted_by is required');
    }

    const { data: followup, error } = await supabase
      .from('appointment_followups')
      .insert({
        appointment_id: data.appointment_id,
        user_id: data.user_id,
        followup_date: data.followup_date,
        followup_round: data.followup_round,
        weight: data.weight || null,
        waist_circumference: data.waist_circumference || null,
        blood_pressure_sys: data.blood_pressure_sys || null,
        blood_pressure_dia: data.blood_pressure_dia || null,
        blood_sugar_dtx: data.blood_sugar_dtx || null,
        life_schedule_image_url: data.life_schedule_image_url || null,
        adaptation_summary: data.adaptation_summary || null,
        adaptation_obstacles: data.adaptation_obstacles || null,
        adaptation_opportunities: data.adaptation_opportunities || null,
        adaptation_other: data.adaptation_other || null,
        food_amount_status: data.food_amount_status || null,
        food_type_status: data.food_type_status || null,
        movement_status: data.movement_status || null,
        food_amount_note: data.food_amount_note || null,
        food_type_note: data.food_type_note || null,
        movement_note: data.movement_note || null,
        confidence_score: data.confidence_score || null,
        confidence_improvement_plan: data.confidence_improvement_plan || null,
        summary: data.summary || null,
        recommendations: data.recommendations || null,
        followup_status: data.followup_status || null,
        conducted_by: data.conducted_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [saveAppointmentFollowupComplete] Error:', error);
      return { success: false, error: error.message, details: error };
    }

    console.log('✅ [saveAppointmentFollowupComplete] Success:', followup);
    return { success: true, followup };
  } catch (err: any) {
    console.error('❌ [saveAppointmentFollowupComplete] Exception:', err);
    return { success: false, error: err.message };
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงนัดหมายครั้งถัดไปของผู้ป่วย (สำหรับการ์ด)
// =====================================================
// ✅ แก้ไขฟังก์ชัน getNextPatientAppointment
export async function getNextPatientAppointment(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')  // ❌ ลบ doctors ออก
      .eq('user_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('appointment_date', new Date().toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching next appointment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get next appointment error:', err);
    return null;
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงการประเมินล่าสุดของผู้ป่วย (สำหรับการ์ด)
// =====================================================
export async function getLatestScreening(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('screenings')
      .select('*')
      .eq('user_id', patientId)
      .order('screening_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest screening:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get latest screening error:', err);
    return null;
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงการติดตามล่าสุดของผู้ป่วย (สำหรับการ์ด)
// =====================================================
export async function getLatestFollowup(patientId: string) {
  try {
    const { data, error } = await supabase
      .from('appointment_followups')
      .select('*')
      .eq('user_id', patientId)
      .order('followup_date', { ascending: false })
      .order('followup_round', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest followup:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get latest followup error:', err);
    return null;
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงสถิติเป้าหมายของผู้ป่วย (สำหรับการ์ด)
// =====================================================
// ✅ แก้ไขฟังก์ชัน getPatientGoalsStats
export async function getPatientGoalsStats(patientId: string) {
  try {
    const { count: total } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', patientId)
      .eq('status', 'active');

    return {
      total: total || 0,
      completed: 0,  // ✅ ตั้งเป็น 0 ไปก่อน
    };
  } catch (err) {
    return { total: 0, completed: 0 };
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงจำนวนการประเมินทั้งหมด (สำหรับการ์ด)
// =====================================================
export async function getScreeningCount(patientId: string) {
  try {
    const { count, error } = await supabase
      .from('screenings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', patientId);

    if (error) {
      console.error('Error counting screenings:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Get screening count error:', err);
    return 0;
  }
}

// =====================================================
// ✅ ฟังก์ชันดึงจำนวนเป้าหมายทั้งหมด (สำหรับการ์ด)
// =====================================================
export async function getGoalsCount(patientId: string) {
  try {
    const { count, error } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', patientId);

    if (error) {
      console.error('Error counting goals:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Get goals count error:', err);
    return 0;
  }
}

// =====================================================
// 🏥 ฟังก์ชันจัดการโรงพยาบาล
// =====================================================

// =====================================================
// 🏥 ฟังก์ชันจัดการโรงพยาบาล
// =====================================================
// ดึงโรงพยาบาลทั้งหมด (แก้ไขแล้ว - แสดงทั้งหมดไม่กรอง parent_id)
export async function getHospitals() {
  try {
    console.log('🏥 Fetching all hospitals...');
    
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('is_active', true)  // ✅ เอาเฉพาะที่ active
      .order('type', { ascending: true })  // ✅ เรียงตาม type (main ก่อน sub)
      .order('name', { ascending: true });  // ✅ แล้วเรียงตามชื่อ

    if (error) {
      console.error('❌ Error fetching hospitals:', error);
      return [];
    }

    console.log('✅ Hospitals loaded:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get hospitals error:', err);
    return [];
  }
}

// เพิ่มโรงพยาบาลใหม่
export async function createHospital(data: {
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id?: string;
  address?: string;
  phone?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
}) {
  try {
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .insert({
        name: data.name,
        code: data.code,
        type: data.type,
        parent_id: data.parent_id,
        address: data.address,
        phone: data.phone,
        province: data.province,
        district: data.district,
        subdistrict: data.subdistrict,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, hospital };
  } catch (err) {
    console.error('Create hospital error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างโรงพยาบาล' };
  }
}

// =====================================================
// 🏘️ ฟังก์ชันจัดการหมู่บ้าน
// =====================================================

// ดึงหมู่บ้านทั้งหมด
export async function getVillages(hospitalId?: string) {
  try {
    let query = supabase
      .from('villages')
      .select(`
        *,
        hospitals (
          name,
          type
        )
      `)
      .eq('is_active', true)
      .order('province', { ascending: true })
      .order('district', { ascending: true })
      .order('subdistrict', { ascending: true })
      .order('village_no', { ascending: true });

    if (hospitalId) {
      query = query.eq('hospital_id', hospitalId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get villages error:', err);
    return [];
  }
}

// เพิ่มหมู่บ้านใหม่
export async function createVillage(data: {
  village_no: string;
  village_name?: string;
  subdistrict: string;
  district: string;
  province: string;
  postal_code?: string;
  hospital_id?: string;
}) {
  try {
    const { data: village, error } = await supabase
      .from('villages')
      .insert({
        village_no: data.village_no,
        village_name: data.village_name,
        subdistrict: data.subdistrict,
        district: data.district,
        province: data.province,
        postal_code: data.postal_code,
        hospital_id: data.hospital_id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, village };
  } catch (err) {
    console.error('Create village error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างหมู่บ้าน' };
  }
}

// =====================================================
// 👩‍⚕️ ฟังก์ชันจัดการ อสม. และหมู่บ้านที่ดูแล
// =====================================================

// ดึงหมู่บ้านที่ อสม. ดูแล
export async function getVolunteerVillages(volunteerId: string) {
  try {
    const { data, error } = await supabase
      .from('volunteer_villages')
      .select(`
        *,
        villages (
          village_no,
          village_name,
          subdistrict,
          district,
          province
        )
      `)
      .eq('volunteer_id', volunteerId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Get volunteer villages error:', err);
    return [];
  }
}

// เพิ่มหมู่บ้านให้อสม. ดูแล
export async function assignVolunteerVillage(data: {
  volunteer_id: string;
  village_id: string;
}) {
  try {
    const { data: result, error } = await supabase
      .from('volunteer_villages')
      .insert({
        volunteer_id: data.volunteer_id,
        village_id: data.village_id,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: result };
  } catch (err) {
    console.error('Assign volunteer village error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการมอบหมายหมู่บ้าน' };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการจังหวัดทั้งหมด (จาก villages)
// =====================================================
export async function getProvinces() {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('province')
      .neq('province', null)
      .order('province', { ascending: true });

    if (error) {
      console.error('Error fetching provinces:', error);
      return [];
    }

    // ✅ ดึง province ที่ไม่ซ้ำกัน
    const provinces = [...new Set(data?.map(v => v.province) || [])];
    console.log('✅ Provinces fetched:', provinces.length);
    return provinces;
  } catch (err) {
    console.error('Get provinces error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงรายการอำเภอในจังหวัดที่เลือก
// =====================================================
export async function getDistricts(province: string) {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('district')
      .eq('province', province)
      .neq('district', null)
      .order('district', { ascending: true });

    if (error) {
      console.error('Error fetching districts:', error);
      return [];
    }

    // ✅ ดึง district ที่ไม่ซ้ำกัน
    const districts = [...new Set(data?.map(v => v.district) || [])];
    console.log('✅ Districts fetched for', province, ':', districts.length);
    return districts;
  } catch (err) {
    console.error('Get districts error:', err);
    return [];
  }
}



// =====================================================
// ✅ ฟังก์ชันดึงรายการตำบลในอำเภอที่เลือก
// =====================================================
export async function getSubdistricts(province: string, district: string) {
  try {
    const { data, error } = await supabase
      .from('villages')
      .select('subdistrict, postal_code')
      .eq('province', province)
      .eq('district', district)
      .neq('subdistrict', null)
      .order('subdistrict', { ascending: true });

    if (error) {
      console.error('Error fetching subdistricts:', error);
      return [];
    }

    console.log('✅ Subdistricts fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get subdistricts error:', err);
    return [];
  }
}

// =====================================================
// 🏥 ฟังก์ชันดึงโรงพยาบาลแบบ Hierarchical (พร้อมลูกข่าย)
// =====================================================
export async function getHospitalsWithHierarchy() {
  try {
    console.log('🏥 Fetching hospitals with hierarchy...');
    
    const { data, error } = await supabase
      .from('hospitals')
      .select(`
        *,
        parent_hospital:hospitals!parent_id (
          id,
          name,
          code
        )
      `)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching hospitals:', error);
      return [];
    }

    console.log('✅ Hospitals with hierarchy fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('❌ Get hospitals with hierarchy error:', err);
    return [];
  }
}

