import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  console.log('🔍 Status check for task:', taskId);
  
  try {
    const task = await taskManager.get(taskId);
    if (!task) {
      console.log('❌ Task not found:', taskId);
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    console.log('✅ Task found:', task.status);
    return NextResponse.json(task);
  } catch (error) {
    console.error('❌ Error getting task status:', error);
    return NextResponse.json(
      { error: 'Failed to get task status', status: 'error' }, 
      { status: 500 }
    );
  }
} 