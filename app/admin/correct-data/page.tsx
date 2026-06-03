// File: app/admin/correct-data/page.tsx
// Description: หน้าจัดการข้อมูลคนไข้ที่มีปัญหา (ไม่มี Profile, ชื่อไม่ครบ, ไม่มี HN, เลขบัตรซ้ำ ฯลฯ)
// Features: ปุ่มย้อนกลับ, ลบหลายรายการ, แก้ไขข้อมูลผ่าน Modal, ค้นหา, Filter

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  Search,
  Trash2,
  Edit,
  RefreshCw,
  Download,
  UserX,
  Users,
  Hash,
  FileX,
  X,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

// Types
interface Problem {
  patient_id: string;
  id_card: string;
  first_name: string | null;
  last_name: string | null;
  hospital_number: string | null;
  hospital_name: string | null;
  created_at: string;
  issue_type: string;
  issue_description: string;
}

interface EditFormData {
  first_name: string;
  last_name: string;
  hospital_number: string;
  id_card: string;
}

export default function CorrectDataPage() {
  const router = useRouter();
  
  // States
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Problem | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    first_name: '',
    last_name: '',
    hospital_number: '',
    id_card: ''
  });
  const [saving, setSaving] = useState(false);

  // Load data on mount
  useEffect(() => {
    fetchProblems();
  }, []);

  // ✅ ฟังก์ชันย้อนกลับ
  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/admin/settings');
    }
  };

  // Fetch problems from API
  const fetchProblems = async () => {
    try {
      setLoading(true);
      console.log('[FRONTEND] Fetching problems...');
      const res = await fetch('/api/admin/get-problems', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      const data = await res.json();
      console.log('[FRONTEND] Received', data.length, 'problems');
      setProblems(data);
    } catch (error) {
      console.error('[FRONTEND] Fetch error:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete (supports multiple)
  const handleDelete = async (ids: string[]) => {
    console.log('🗑️ Delete requested for', ids.length, 'patients:', ids);

    if (!confirm(`ยืนยันการลบ ${ids.length} รายการ?\n\n⚠️ การลบจะไม่สามารถกู้คืนได้\n\nผู้ใช้ที่มี ID:\n${ids.slice(0, 3).join('\n')}${ids.length > 3 ? '\n...และอีก ' + (ids.length - 3) + ' รายการ' : ''}`)) {
      console.log('❌ User cancelled delete');
      return;
    }

    try {
      console.log('📡 Sending delete request for', ids.length, 'patients...');

      const res = await fetch('/api/admin/delete-problems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ patientIds: ids }),
        cache: 'no-store',
      });

      console.log('📥 Response status:', res.status);

      const data = await res.json();
      console.log('📦 Response data:', data);

      if (res.ok && data.success) {
        toast.success(`✅ ลบ ${data.deleted} รายการสำเร็จ`);
        console.log('🔄 Forcing fresh data reload...');
        await fetchProblems();
        setSelectedIds([]);
        console.log('✅ Delete complete!');
      } else {
        console.error('❌ Delete failed:', data);
        toast.error(`❌ การลบไม่สำเร็จ: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Delete error:', error);
      toast.error('เกิดข้อผิดพลาดในการลบ - ดู Console สำหรับรายละเอียด');
    }
  };

  // Handle edit click
  const handleEditClick = (patient: Problem) => {
    console.log('✏️ Edit clicked for patient:', patient);
    setEditingPatient(patient);
    setEditForm({
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      hospital_number: patient.hospital_number || '',
      id_card: patient.id_card || ''
    });
    setIsEditModalOpen(true);
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!editingPatient) return;

    console.log('💾 Saving edits for patient:', editingPatient.patient_id);
    console.log('💾 Form data:', editForm);

    setSaving(true);

    try {
      const res = await fetch('/api/admin/update-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: editingPatient.patient_id,
          updates: editForm
        }),
      });

      const data = await res.json();
      console.log('💾 Response:', data);

      if (res.ok && data.success) {
        toast.success('✅ อัปเดตข้อมูลสำเร็จ');
        setIsEditModalOpen(false);
        setEditingPatient(null);
        await fetchProblems();
      } else {
        toast.error(`❌ อัปเดตไม่สำเร็จ: ${data.error}`);
      }
    } catch (error) {
      console.error('💾 Error:', error);
      toast.error('เกิดข้อผิดพลาดในการอัปเดต');
    } finally {
      setSaving(false);
    }
  };

  // Get badge for issue type
  const getIssueBadge = (issueType: string) => {
    const config: Record<string, { variant: 'destructive' | 'warning' | 'secondary' | 'outline'; icon: any; label: string }> = {
      'ไม่มี Profile': { variant: 'destructive', icon: UserX, label: 'ไม่มี Profile' },
      'DUPLICATE_ID': { variant: 'destructive', icon: Users, label: 'เลขบัตรซ้ำ' },
      'INVALID_ID_FORMAT': { variant: 'warning', icon: AlertCircle, label: 'Format ผิด' },
      'ไม่มีชื่อ': { variant: 'secondary', icon: FileX, label: 'ไม่มีชื่อ' },
      'ไม่มีนามสกุล': { variant: 'secondary', icon: FileX, label: 'ไม่มีนามสกุล' },
      'ไม่มี HN': { variant: 'secondary', icon: Hash, label: 'ไม่มี HN' },
      'DUPLICATE_HN_SAME_HOSPITAL': { variant: 'destructive', icon: Hash, label: 'HN ซ้ำ' },
    };

    const { variant, icon: Icon, label } = config[issueType] || {
      variant: 'outline' as const,
      icon: AlertCircle,
      label: issueType
    };

    return <Badge variant={variant}><Icon className="w-3 h-3 mr-1" />{label}</Badge>;
  };

  // Filter problems
  const filteredProblems = problems.filter(p => {
    const matchSearch =
      p.id_card.includes(searchTerm) ||
      p.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.hospital_number?.includes(searchTerm);

    const matchFilter = filterType === 'all' || p.issue_type === filterType;

    return matchSearch && matchFilter;
  });

  // Count stats dynamically
  const statsByType = problems.reduce((acc, p) => {
    acc[p.issue_type] = (acc[p.issue_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const uniqueIssueTypes = Object.keys(statsByType);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header พร้อมปุ่มย้อนกลับ */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* ✅ ปุ่มลูกศรย้อนกลับ */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoBack}
            className="flex items-center gap-2"
            title="กลับไปหน้าก่อนหน้า"
          >
            <ArrowLeft className="w-4 h-4" />
            ย้อนกลับ
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold">🔧 Correct Data</h1>
            <p className="text-muted-foreground">จัดการข้อมูลคนไข้ที่บกพร่อง</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchProblems} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards - Dynamic */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ปัญหาทั้งหมด</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{problems.length}</div>
            <p className="text-xs text-muted-foreground">รายการทั้งหมด</p>
          </CardContent>
        </Card>

        {/* Cards per type - auto generated */}
        {uniqueIssueTypes.map((type) => {
          const count = statsByType[type];
          const config: Record<string, { color: string; icon: any }> = {
            'ไม่มี Profile': { color: 'text-red-600', icon: UserX },
            'DUPLICATE_ID': { color: 'text-orange-600', icon: Users },
            'INVALID_ID_FORMAT': { color: 'text-yellow-600', icon: AlertCircle },
            'ไม่มีชื่อ': { color: 'text-blue-600', icon: FileX },
            'ไม่มีนามสกุล': { color: 'text-blue-600', icon: FileX },
            'ไม่มี HN': { color: 'text-purple-600', icon: Hash },
            'DUPLICATE_HN_SAME_HOSPITAL': { color: 'text-pink-600', icon: Hash },
          };
          const { color, icon: Icon } = config[type] || { color: 'text-gray-600', icon: AlertCircle };

          return (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium truncate">{type}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${color}`}>{count}</div>
                <p className="text-xs text-muted-foreground">รายการ</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="ค้นหาด้วย เลขบัตร, ชื่อ, HN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border rounded-md px-3 py-2 bg-white"
        >
          <option value="all">ทั้งหมด ({problems.length})</option>
          {uniqueIssueTypes.map((type) => (
            <option key={type} value={type}>
              {type} ({statsByType[type]})
            </option>
          ))}
        </select>
        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => handleDelete(selectedIds)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            ลบที่เลือก ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.length === filteredProblems.length && filteredProblems.length > 0}
                    onCheckedChange={(checked) => {
                      setSelectedIds(checked ? filteredProblems.map(p => p.patient_id) : []);
                    }}
                  />
                </TableHead>
                <TableHead>ปัญหา</TableHead>
                <TableHead>เลขบัตรประชาชน</TableHead>
                <TableHead>ชื่อ-นามสกุล</TableHead>
                <TableHead>HN</TableHead>
                <TableHead>โรงพยาบาล</TableHead>
                <TableHead>วันที่สร้าง</TableHead>
                <TableHead>จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-muted-foreground">กำลังโหลดข้อมูล...</p>
                  </TableCell>
                </TableRow>
              ) : filteredProblems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    ไม่พบข้อมูล
                  </TableCell>
                </TableRow>
              ) : (
                filteredProblems.map((problem) => (
                  <TableRow key={`${problem.patient_id}-${problem.issue_type}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(problem.patient_id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds(
                            checked
                              ? [...selectedIds, problem.patient_id]
                              : selectedIds.filter(id => id !== problem.patient_id)
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell>{getIssueBadge(problem.issue_type)}</TableCell>
                    <TableCell className="font-mono text-sm">{problem.id_card}</TableCell>
                    <TableCell>
                      {problem.first_name || '-'} {problem.last_name || ''}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {problem.hospital_number || '-'}
                    </TableCell>
                    <TableCell className="text-sm">{problem.hospital_name || '-'}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(problem.created_at).toLocaleDateString('th-TH')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditClick(problem)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete([problem.patient_id])}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingPatient(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="ปิดหน้าต่างแก้ไข"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <DialogTitle className="flex items-center gap-2 flex-1">
                <Edit className="w-5 h-5" />
                ✏️ แก้ไขข้อมูลคนไข้
              </DialogTitle>
            </div>
            <DialogDescription>
              แก้ไขข้อมูลที่บกพร่องของคนไข้ {editingPatient?.first_name || ''} {editingPatient?.last_name || ''}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name" className="text-sm font-medium">
                  ชื่อ <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="first_name"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                  placeholder="ชื่อ"
                  className="bg-white"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name" className="text-sm font-medium">
                  นามสกุล <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="last_name"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                  placeholder="นามสกุล"
                  className="bg-white"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hospital_number" className="text-sm font-medium">
                Hospital Number (HN)
              </Label>
              <Input
                id="hospital_number"
                value={editForm.hospital_number}
                onChange={(e) => setEditForm({...editForm, hospital_number: e.target.value})}
                placeholder="HN"
                className="bg-white"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="id_card" className="text-sm font-medium">
                เลขบัตรประชาชน
              </Label>
              <Input
                id="id_card"
                value={editForm.id_card}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 13);
                  setEditForm({...editForm, id_card: value});
                }}
                placeholder="เลขบัตรประชาชน 13 หลัก"
                maxLength={13}
                className="bg-white font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                ความยาว: {editForm.id_card.length}/13
              </p>
            </div>

            <div className="bg-muted p-3 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-600" />
                <div className="text-sm">
                  <p className="font-medium">⚠️ ปัญหาที่พบ:</p>
                  <p className="text-muted-foreground">{editingPatient?.issue_description}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingPatient(null);
              }}
              type="button"
            >
              <X className="w-4 h-4 mr-2" />
              ยกเลิก
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editForm.first_name || !editForm.last_name}
              type="button"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Edit className="w-4 h-4 mr-2" />
                  บันทึกการแก้ไข
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}