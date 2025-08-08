import { NextRequest, NextResponse } from 'next/server';
import { taskManager } from '@/lib/tasks';

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    console.log('🔄 手动重试任务:', taskId);
    
    // 获取任务信息
    const task = await taskManager.get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    console.log('📋 当前任务状态:', task.status);
    
    // 重置任务状态为错误，提示用户重新提交
    await taskManager.update(taskId, {
      status: 'error',
      progress: 0,
      error: '任务已被手动取消。请重新提交转换请求。'
    });
    
    return NextResponse.json({
      success: true,
      message: 'Task has been cancelled. Please submit a new conversion request.',
      taskId
    });
    
  } catch (error) {
    console.error('❌ 手动重试失败:', error);
    return NextResponse.json({ 
      error: 'Failed to retry task',
      details: (error as Error).message 
    }, { status: 500 });
  }
}