import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@/lib/tasks';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  
  // 检查任务是否存在且已完成
  const task = tasks.get(taskId);
  if (!task || task.status !== 'finished') {
    return NextResponse.json({ error: 'File not found or not ready' }, { status: 404 });
  }
  
  // 环境检测和数据检查
  const isVercel = process.env.VERCEL === '1';
  
  if (isVercel) {
    // Vercel 环境：检查音频流
    if (!task.audioStream) {
      console.error('Vercel 环境音频流不存在:', taskId);
      return NextResponse.json({ error: 'Audio stream not found' }, { status: 404 });
    }
    
    try {
      return new NextResponse(task.audioStream as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${taskId}.mp3"`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'Transfer-Encoding': 'chunked',
        },
      });
    } catch (error) {
      console.error('返回音频流失败:', error);
      return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
    }
  } else {
    // 本地环境：检查音频缓冲区
    if (!task.audioBuffer) {
      console.error('本地环境音频缓冲区不存在:', taskId);
      return NextResponse.json({ error: 'Audio buffer not found' }, { status: 404 });
    }
    
    try {
      const buffer = task.audioBuffer;
      console.log(`📁 返回音频文件，大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${taskId}.mp3"`,
          'Content-Length': buffer.length.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('返回音频缓冲区失败:', error);
      return NextResponse.json({ error: 'Failed to return audio' }, { status: 500 });
    }
  }
}