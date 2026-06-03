import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('v_problematic_patients')
      .select('problem_type');

    if (error) throw error;

    // นับจำนวนตามประเภท
    const stats = data?.reduce((acc, curr) => {
      acc[curr.problem_type] = (acc[curr.problem_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    return NextResponse.json({
      total: data?.length || 0,
      byType: stats
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}