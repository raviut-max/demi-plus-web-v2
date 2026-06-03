// File: app/api/admin/get-problems/route.ts
// Description: API ดึงข้อมูลคนไข้ที่มีปัญหา (แก้ไข syntax errors แล้ว)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    console.log('[GET PROBLEMS] Fetching fresh data...');
    
    const allProblems: any[] = [];

    // 1. ดึงข้อมูลจาก View v_problematic_patients
    const { data: viewData, error: viewError } = await supabase
      .from('v_problematic_patients')
      .select('*');

    if (viewError) {
      console.error('[GET PROBLEMS] View error:', viewError);
    } else if (viewData) {
      console.log('[GET PROBLEMS] Found', viewData.length, 'records from view');
      viewData.forEach((row: any) => {
        allProblems.push({
          patient_id: row.user_id,
          id_card: row.id_card,
          first_name: row.first_name,
          last_name: row.last_name,
          hospital_number: row.hospital_number,
          hospital_name: row.hospital_name,
          created_at: row.created_at,
          issue_type: row.problem_type,
          issue_description: row.problem_type
        });
      });
    }

    // 2. ตรวจสอบเลขบัตรประชาชนซ้ำ
    const { data: duplicateIDData } = await supabase
      .from('users')
      .select(`
        id,
        id_card,
        role,
        created_at,
        hospital_id,
        profiles!left (
          first_name,
          last_name,
          hospital_number
        ),
        hospitals!left (
          name
        )
      `)
      .eq('role', 'patient');

    if (duplicateIDData) {
      const idCardMap = new Map<string, any[]>();
      duplicateIDData.forEach((user: any) => {
        const normalizedId = user.id_card.replace(/[\s\-]/g, '');
        if (!idCardMap.has(normalizedId)) {
          idCardMap.set(normalizedId, []);
        }
        idCardMap.get(normalizedId)!.push(user);
      });

      idCardMap.forEach((users, normalizedId) => {
        if (users.length > 1) {
          users.forEach((user: any) => {
            allProblems.push({
              patient_id: user.id,
              id_card: user.id_card,
              first_name: user.profiles?.first_name || null,
              last_name: user.profiles?.last_name || null,
              hospital_number: user.profiles?.hospital_number || null,
              hospital_name: user.hospitals?.name || null,
              created_at: user.created_at,
              issue_type: 'DUPLICATE_ID',
              issue_description: `เลขบัตรซ้ำ ${users.length} รายการ`
            });
          });
        }
      });
    }

    // 3. ตรวจสอบ Format เลขบัตรผิด
    if (duplicateIDData) {
      duplicateIDData.forEach((user: any) => {
        const hasInvalidFormat = 
          user.id_card.length !== 13 ||
          /[\s\-]/.test(user.id_card) ||
          !/^[0-9]+$/.test(user.id_card);

        if (hasInvalidFormat) {
          allProblems.push({
            patient_id: user.id,
            id_card: user.id_card,
            first_name: user.profiles?.first_name || null,
            last_name: user.profiles?.last_name || null,
            hospital_number: user.profiles?.hospital_number || null,
            hospital_name: user.hospitals?.name || null,
            created_at: user.created_at,
            issue_type: 'INVALID_ID_FORMAT',
            issue_description: `Format ผิด (ความยาว: ${user.id_card.length})`
          });
        }
      });
    }

    // จัดกลุ่มและเรียงลำดับ
    const uniqueProblems = Array.from(
      new Map(allProblems.map(p => [`${p.patient_id}-${p.issue_type}`, p])).values()
    );

    uniqueProblems.sort((a, b) => {
      if (a.issue_type !== b.issue_type) {
        return a.issue_type.localeCompare(b.issue_type);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    console.log('[GET PROBLEMS] Total problems:', uniqueProblems.length);

    // ส่ง response พร้อม header ป้องกัน cache
    return NextResponse.json(uniqueProblems, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[GET PROBLEMS] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// บังคับให้ Next.js ไม่ cache API นี้
export const dynamic = 'force-dynamic';
export const revalidate = 0;