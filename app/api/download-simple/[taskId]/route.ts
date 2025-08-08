import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }
    
    console.log('📥 下载请求:', taskId);
    
    // 确保获取全局缓存
    const globalThis = global as any;
    console.log('🔍 全局缓存存在:', !!globalThis.simpleCache);
    
    if (!globalThis.simpleCache) {
      console.log('❌ 全局缓存未找到');
      return NextResponse.json({ error: 'Cache not initialized' }, { status: 500 });
    }
    
    const cached = globalThis.simpleCache.get(taskId);
    console.log('🔍 任务缓存存在:', !!cached);
    console.log('🔍 缓存大小:', globalThis.simpleCache.size);
    
    if (!cached) {
      // 列出所有缓存的key用于调试
      const allKeys = Array.from(globalThis.simpleCache.keys());
      console.log('🔍 所有缓存键:', allKeys);
      return NextResponse.json({ 
        error: 'File not found or expired',
        debug: { requestedId: taskId, availableKeys: allKeys }
      }, { status: 404 });
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