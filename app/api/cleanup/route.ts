import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    console.log('🧹 清理任务:', taskId);
    
    // 获取当前任务状态
    const currentTask = await taskManager.get(taskId);
    console.log('📋 当前任务状态:', currentTask);
    
    if (!currentTask) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }
    
    // 如果任务卡在processing状态，强制设置为error
    if (currentTask.status === 'processing') {
      await taskManager.update(taskId, {
        status: 'error',
        error: '任务被手动清理 - 可能由于超时或其他问题卡住'
      });
      
      console.log('✅ 已将卡住的任务标记为错误');
      
      return NextResponse.json({
        message: 'Task cleaned up successfully',
        previousStatus: currentTask.status,
        newStatus: 'error'
      });
    } else {
      return NextResponse.json({
        message: 'Task is not stuck',
        currentStatus: currentTask.status
      });
    }
    
  } catch (error) {
    console.error('❌ 清理任务失败:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup task', details: (error as Error).message }, 
      { status: 500 }
    );
  }
}