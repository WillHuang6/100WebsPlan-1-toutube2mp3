import { NextRequest, NextResponse } from 'next/server';

// 引用同一个缓存
declare const simpleCache: Map<string, { 
  audioBuffer: Buffer; 
  title: string; 
  createdAt: number; 
}>;

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const taskId = params.taskId;
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }
    
    // 从全局对象获取缓存（简单的跨模块共享）
    const globalThis = global as any;
    if (!globalThis.simpleCache) {
      return NextResponse.json({ error: 'File not found or expired' }, { status: 404 });
    }
    
    const cached = globalThis.simpleCache.get(taskId);
    
    if (!cached) {
      return NextResponse.json({ error: 'File not found or expired' }, { status: 404 });
    }
    
    console.log(`📥 下载文件: ${taskId}, 大小: ${(cached.audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // 设置合适的headers
    const fileName = `${cached.title.replace(/[^a-zA-Z0-9\-_\s]/g, '').substring(0, 50)}.mp3`;
    
    return new NextResponse(cached.audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': cached.audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
    
  } catch (error) {
    console.error('❌ 下载失败:', error);
    return NextResponse.json({
      error: 'Download failed',
      details: (error as Error).message
    }, { status: 500 });
  }
}