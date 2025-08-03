import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@/lib/tasks';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = tasks.get(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
} 