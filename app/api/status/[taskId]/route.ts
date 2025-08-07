import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@/lib/tasks';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  console.log('🔍 Status check for task:', taskId);
  console.log('📊 Current tasks count:', tasks.size);
  console.log('📋 Available task IDs:', Array.from(tasks.keys()));
  
  const task = tasks.get(taskId);
  if (!task) {
    console.log('❌ Task not found:', taskId);
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  
  console.log('✅ Task found:', task.status);
  return NextResponse.json(task);
} 