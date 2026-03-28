import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ✅ เพิ่มฟังก์ชันนี้ เพื่อตั้งค่า current user ID สำหรับ RLS
export async function setRLSUserContext(userId: string) {
  // ใช้การตั้งค่า session variable ใน Supabase
  await supabase.rpc('set_app_user_id', { user_id: userId });
}